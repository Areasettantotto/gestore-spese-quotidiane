# Stato operativo — Gestore Spese Quotidiane

**Data snapshot:** 2026-08-07

| Voce | Valore |
|------|--------|
| Branch atteso | `main` |
| Commit applicativo di riferimento | `18a4bf91001589c75fcf0796bde7f2da7d1b1c87` — *fix(billing): harden webhook event processing* — I4.3A |
| Ultimo commit governance/documentale consolidato | `751852bb83487889ce24e15a35982513adb6ecd5` — *docs(context): record stripe webhook deployment* — I4.3A-D1-bis |
| Verifica Git richiesta | All’inizio di ogni task: `git rev-parse HEAD`, `git status`, `git branch --show-current` |

Nota: l’HEAD reale deve essere verificato all’inizio di ogni task con `git rev-parse HEAD`. Il commit che aggiorna `stato-operativo.md` può essere successivo all’ultimo commit registrato nel documento; questo non costituisce automaticamente una divergenza. Branch, working tree e cronologia reale del repository prevalgono sempre sui valori storici riportati nel documento. Non riportare come HEAD stabile il futuro commit del task documentale corrente.

**Scopo di questo file:** dare a un altro agente (ChatGPT / Cursor) il contesto minimo per **riprendere lo sviluppo senza rieseguire fasi già fatte**. Fonte canonica dinamica del progetto (vedi `.cursor/rules/000-project-context.mdc`).

---

## Prompt da incollare in ChatGPT

Copia tutto il blocco sotto (incluso il riferimento a questo file) all’inizio di una nuova chat:

```text
Sei un agente senior Software Architecture / SaaS multi-tenant / React+Vite+TypeScript / Supabase (Auth, PostgreSQL RLS, Edge Functions Deno) / Stripe billing test-mode.

Progetto: “Gestore Spese Quotidiane” — evoluzione da MVP single-user a SaaS multi-tenant su stack statico + Supabase (NO backend Node obbligatorio per il flusso principale).

Prima di proporre codice:
1. Leggi integralmente docs/stato-operativo.md (questo snapshot).
2. Consulta al bisogno: docs/saas-refactor-plan.md, docs/billing-data-model.md, docs/supabase-cli-baseline.md, docs/production-readiness.md, .cursor/rules/*.mdc.
3. NON ripetere fasi già completate.
4. Modifiche INCREMENTALI, piccoli scope, niente refactor wide-ranging non richiesti.
5. Mai service_role / secret Stripe nel frontend o in VITE_*.
6. Mai supabase db push / reset produzione senza conferma esplicita.
7. Quality gates dopo blocchi rilevanti: npm run lint && npm run build.

Stato attuale (sintesi):
- Multi-tenancy + RLS tenant-first: FATTO (tenants, profiles, tenant_memberships, expenses.tenant_id).
- Layer frontend expenses/tenancy/billing snapshot: FATTO.
- Schema billing (tenant_billing_customers, tenant_subscriptions, billing_events) in produzione: FATTO (ex migration 006, ora nella baseline locale).
- Supabase CLI baseline locale M8 (000_baseline_current_schema.sql): FATTO. Prossime migration additive da 007_*.
- Stripe test-mode: checkout Edge Function operativa (create-checkout-session v4 remota invariata); webhook con firma + persistenza billing_events + correlazione customer→tenant su checkout.session.completed; I4.3A consolidato in 18a4bf9 (hardening ciclo billing_events).
- I4.3A: processed_at è commit marker applicativo (non semplice ricevuta); eventi incompleti (processed_at nullo) ritentabili sulla stessa riga; eventi già completati = no-op idempotenti; billing_events.tenant_id valorizzato in modo verificato e non rimappabile silenziosamente; correlazione tenant_billing_customers senza upsert che cambi identità; conflitti customer–tenant non sovrascritti; processing_error sintetico/sanitizzato; update critici condizionati con record restituito o readback; race F1–F4 corrette. Eventi customer.subscription.* e invoice.* allowlist: solo persistiti, processed_at resta nullo (attendono I4.3B).
- I4.3A-D1: deploy controllato della sola Edge Function stripe-webhook su project ref dormvfiwgzyzslxybetb completato (remoto v3→v4, ACTIVE, function ID invariato, verify_jwt=false); nessuna modifica locale; nessun secret/migration/RLS/DB/frontend; create-checkout-session invariata v4.
- I4.3A-D1-bis: consolidato in 751852b — *docs(context): record stripe webhook deployment*.
- I4.3A-T1A: completato — rifiuto firma webhook (POST senza Stripe-Signature e con firma invalida → HTTP 400 INVALID_REQUEST); verificato anche manualmente dall’utente con curl; nessuna firma valida né scrittura DB intenzionale.
- I4.3A-T1B: completato — un solo stripe trigger customer.subscription.created (sandbox, exit 0); Workbench HTTP 200 su customer.subscription.created e invoice.payment_succeeded; billing_events con due righe differite (processed_at/tenant_id/processing_error NULL); tenant_subscriptions = 0 per la subscription target; nessun resend/cleanup; I4.3B non avviato.
- I4.3A-T1 complessivo: parzialmente completato (T1A+T1B), ancora aperto per idempotenza/retry, correlazione checkout.session.completed, conflitti customer–tenant e race runtime.
- Governance: GOVERNANCE-5-bis in 063cbf7; GOVERNANCE-6-bis in 253affa; I4.3A-bis in 99dc1f6; GOVERNANCE-7 consolidato in 8ff556d; GOVERNANCE-7-bis consolidato in a380ce9; I4.3A-D1-bis consolidato in 751852b.
- Mirror: Git canonico, Drive = consultazione. Commit/push restano dell’utente. Dopo conferma del commit, Cursor esegue dry-run poi apply (obbligatoria dopo ogni -bis). Config locale non versionata (AI_CONTEXT_MIRROR_DIR o .git/ai-context-mirror-path). Nessun --delete, nessuna sync inversa. Verifica byte-per-byte. Prima sync controllata completata su 15 file. Propagazione cloud = Google Drive Desktop. ChatGPT rilegge il mirror a ogni ripresa.
- ANCORA MANCANTE: test runtime residui di I4.3A-T1 (idempotenza, retry, checkout.session.completed → tenant_billing_customers, conflitti customer–tenant, race); sync subscription → tenant_subscriptions + snapshot tenants (I4.3B, non avviato); billing portal; UI checkout reale; feature gating piani; tenant switcher/inviti. Drift storico di production-readiness.md e billing-data-model.md ancora presente.

Riparti dal prossimo micro-task runtime dedicato (da definire/revisionare da ChatGPT): test isolato di idempotenza/retry e/o checkout.session.completed in Stripe test mode (operazione protetta; richiede autorizzazione esplicita). I4.3A-T1A e I4.3A-T1B sono completati; I4.3A-T1 complessivo resta aperto. NON avviare I4.3B né sync subscription senza task esplicito. I4.3A-D1 (deploy amministrativo) è concluso.

Chiedimi conferma prima di: deploy Edge Functions, apply migration produzione, db push, live Stripe keys, cambi RLS su expenses, test runtime Stripe/webhook.
```

---

## 0. Governance operativa

### Modello ruoli (regola `000`)

| Ruolo | Chi | Responsabilità |
|-------|-----|----------------|
| **Supervisor / Architect** | ChatGPT | Pianifica fasi, definisce micro-task, risolve divergenze; **decide** se aggiornare questo file |
| **Execution Agent / Executor** | Cursor | Esegue **solo** il micro-task assegnato; propone `Prompt -bis necessario: sì/no` ma non decide |
| **Controllore** | Utente | Autorizza commit, push, deploy, migration, segreti |

### Convenzione prompt e aggiornamento stato (sintesi)

- ChatGPT decide quando aggiornare `docs/stato-operativo.md`.
- Cursor propone nel report `Prompt -bis necessario: sì` oppure `Prompt -bis necessario: no`; il suggerimento non autorizza.
- Task principale e task `-bis` sono **separati**; `-bis` è riservato all’aggiornamento di questo file.
- Suffissi: `-R` review; `-F<n>` fix; `-D<n>` deploy/operazione controllata; `-T<n>` test operativo (solo se ChatGPT lo decide).
- **Vietato** `-bis-bis`. Il commit documentale viene registrato al prossimo aggiornamento significativo.
- Ogni report Cursor termina con la sezione esatta `Consigli a ChatGPT per i prossimi prompt` (ultima sezione; niente sezioni successive).
- Dettaglio stabile: `.cursor/rules/000-project-context.mdc`.

### Mirror Google Drive

- Documento operativo: [`docs/ai-context-mirror.md`](ai-context-mirror.md). Script ufficiale: `scripts/sync-ai-context-mirror.sh` (GOVERNANCE-7, commit `8ff556d`).
- **Repository / Git** = fonte canonica; Drive = **mirror di consultazione**, non canonico.
- Cursor modifica **solo** i file nel repository, non direttamente in Drive.
- Configurazione locale non versionata: variabile `AI_CONTEXT_MIRROR_DIR` oppure file `.git/ai-context-mirror-path`. Nessun percorso personale in file versionati, report o prompt.
- Commit e push restano dell’**utente**. Dopo **conferma del commit** in conversazione, Cursor può eseguire direttamente la sincronizzazione locale controllata (senza attendere un nuovo prompt ChatGPT).
- Sync **obbligatoria** dopo ogni task `-bis`; **consentita** dopo altri commit documentali/governance che modificano file del perimetro mirror.
- Ordine: verifiche pre-sync → `scripts/sync-ai-context-mirror.sh --dry-run` → validazione percorsi → `--apply` (solo con working tree **completamente pulita**) → confronto byte-per-byte → report → Cursor si ferma.
- Lista file da `git ls-files`, perimetro: `docs/**/*.md` e `.cursor/rules/**/*.mdc`.
- Divieti permanenti: `--delete`; sincronizzazione inversa Drive → repository; Git hook; monitoraggio in background.
- Comportamento **fail-closed** (working tree sporca, config assente, dry-run anomalo, rsync fallito → non apply).
- Propagazione locale → cloud: **Google Drive Desktop**. ChatGPT **non** monitora Drive automaticamente e deve **rileggere** il mirror a ogni ripresa.
- Prima sincronizzazione controllata post-commit (su `8ff556d`): riuscita — 15 file, dry-run OK, apply OK, verifica byte-per-byte OK; nessun `--delete`; nessun percorso personale.
- Nessuna riconciliazione Drive → repository è consentita. Dettaglio: `docs/ai-context-mirror.md` e `.cursor/rules/000-project-context.mdc`.

### Fonte canonica e vincoli di processo

- Prima di ogni task, Cursor deve leggere **integralmente** `docs/stato-operativo.md`.
- La regola `.cursor/rules/000-project-context.mdc` include: autorità sullo stato, ciclo micro-fasi, numerazione prompt, gerarchia fonti, mirror Drive (principi e sync post-commit), operazioni protette, report finale.
- I consigli in `Consigli a ChatGPT per i prossimi prompt` **non** autorizzano Cursor a implementare autonomamente la fase successiva.
- `README.md` collega la documentazione di sviluppo a `docs/stato-operativo.md` (percorso relativo).

### Stato Git storico (governance e applicativo)

| Voce | Valore |
|------|--------|
| Branch atteso | `main` (verificare sempre con `git branch --show-current`) |
| HEAD reale | **Verificare** con `git rev-parse HEAD` — non dedurre dal documento |
| GOVERNANCE-5-bis | Consolidato in `063cbf7` — *docs(governance): formalize prompt workflow and drive mirror* |
| GOVERNANCE-6-bis | Consolidato in `253affa` — *docs(governance): align operational state after drive mirror* |
| I4.3A-bis | Consolidato in `99dc1f6` — *docs(context): record billing event hardening* |
| GOVERNANCE-7 | Consolidato in `8ff556d` — *chore(governance): add controlled mirror synchronization* (include fix F1/F2) |
| GOVERNANCE-7-bis | Consolidato in `a380ce9` — *docs(context): record controlled mirror workflow* |
| I4.3A-D1-bis | Consolidato in `751852b` — *docs(context): record stripe webhook deployment* |
| Commit storici governance | `14a8575` (GOVERNANCE-4-bis); `1e83f19` (fonti canoniche) |
| Commit applicativo corrente | `18a4bf9` — *fix(billing): harden webhook event processing* (I4.3A, include fix review F1–F4) |
| Commit applicativo precedente | `1f633fcc` (I4.2) |
| `.cursor/rules/000-project-context.mdc` | Esteso in `063cbf7`; sync post-commit aggiornata in `8ff556d` |
| `docs/ai-context-mirror.md` | Creato in `063cbf7`; workflow script aggiornato in `8ff556d` |
| `scripts/sync-ai-context-mirror.sh` | Introdotto in `8ff556d` (mode Git `100755`) |
| `README.md` | Collegamento a `docs/stato-operativo.md` **versionato** in `1e83f19` |

L’HEAD reale e l’allineamento con `origin/main` vanno **sempre verificati** all’inizio di ogni task. Durante I4.3A-D1 l’HEAD locale è rimasto `a380ce9` (nessuna modifica locale; nessun commit applicativo). I4.3A-D1-bis consolidato in `751852b`. La freschezza server di `origin/main` **non** è stata aggiornata con `git fetch` (né in D1 né nei test T1A/T1B). **I4.3A-D1** (deploy amministrativo `stripe-webhook`) è concluso. **I4.3A-T1A** e **I4.3A-T1B** sono completati; **I4.3A-T1** complessivo resta **parzialmente aperto** (test runtime residui). **I4.3B** resta separato e **non avviato**. Nessuna sincronizzazione subscription, nessun aggiornamento dello snapshot `tenants`.

---

## 1. Cos’è il prodotto

SaaS di **gestione spese quotidiane** multi-tenant:

| Layer | Scelta |
|-------|--------|
| Frontend | React 19, Vite 6, TypeScript, Tailwind 4 |
| Dati / Auth | Supabase (PostgreSQL + RLS + Auth + Realtime) |
| Deploy UI | Static site (`npm run build` → `dist`), tipicamente Render |
| Billing | Stripe **test mode** via **Edge Functions** (in corso) |
| Backend Node | **Non** obbligatorio per il path principale |

Project ref Supabase produzione (da sessioni operative): `dormvfiwgzyzslxybetb`.

---

## 2. Dove siamo (punto di ripresa)

### Completato

| Area | Stato |
|------|--------|
| Project Rules Cursor (`.cursor/rules/000`…`050`) | Completate |
| Governance operativa (GOVERNANCE-1/2/3-bis/4/`1e83f19`/4-bis/`14a8575`/5-bis/`063cbf7`/6-bis/`253affa`/I4.3A-bis/`99dc1f6`/7/`8ff556d`/7-bis/`a380ce9`/I4.3A-D1-bis/`751852b`) | Modello Supervisor/Executor; numerazione prompt e workflow `-bis`; fonti canoniche in `1e83f19`; GOVERNANCE-4-bis in `14a8575`; GOVERNANCE-5-bis in `063cbf7`; GOVERNANCE-6-bis in `253affa`; I4.3A-bis in `99dc1f6`; GOVERNANCE-7 in `8ff556d`; GOVERNANCE-7-bis in `a380ce9`; I4.3A-D1-bis in `751852b` |
| **GOVERNANCE-7 — sync controllata mirror** | Commit `8ff556d`: script `scripts/sync-ai-context-mirror.sh`; delega post-commit a Cursor (dopo conferma utente); dry-run → apply; apply solo con working tree pulita; perimetro Git tracciato (`docs/**/*.md`, `.cursor/rules/**/*.mdc`); privacy-safe (no percorsi personali); no `--delete` / no sync inversa; verifica byte-per-byte; **prima sync controllata completata su 15 file** |
| **GOVERNANCE-7-bis** | Commit `a380ce9` — stato operativo aggiornato dopo GOVERNANCE-7 / sync controllata mirror |
| **I4.3A-bis** | Commit `99dc1f6` — stato operativo aggiornato dopo hardening billing I4.3A |
| Audit → piano SaaS | `docs/saas-audit.md`, `docs/saas-refactor-plan.md` |
| Tenant RLS + signup provisioning | Schema + helper `is_tenant_member` / `has_tenant_role` |
| Guard insert `tenant_id` su expenses | Trigger (ex 003) |
| Realtime delete (`replica identity`) | Ex 004 |
| Plan readiness su `tenants` | `plan_code`, `subscription_status`, `is_demo`, `trial_ends_at` (ex 005) |
| Demo tenant runbook | `docs/demo-tenant.md` + SQL in `supabase/snippets/demo/` |
| Production readiness light | `docs/production-readiness.md` |
| Billing data model design + hardening | `docs/billing-data-model.md` |
| Migration billing ufficiale | Ex `006` → applicata in **produzione** (FASE H4) |
| Baseline CLI locale M8 | Solo `supabase/migrations/000_baseline_current_schema.sql`; legacy in `migrations_archive/` |
| Refactor frontend expenses/tenancy | `src/features/expenses/*`, `src/features/tenancy/*` |
| Split UI `App.tsx` (N1) | `src/components/app/*` |
| Billing read model UI (N2) | `src/features/billing/*` — badge/placeholder, **nessun checkout client** |
| Edge Functions scaffold + authz (I1–I2) | `_shared/auth.ts`, `_shared/http.ts` |
| Checkout Stripe subscription test (I3.0) | `create-checkout-session` |
| Webhook firma + allowlist + solo test mode (I4.0) | `stripe-webhook` |
| Persistenza idempotente `billing_events` (I4.1) | Nel webhook |
| Correlazione customer↔tenant (I4.2) | Su `checkout.session.completed` → `tenant_billing_customers` |
| **I4.3A — hardening ciclo `billing_events`** | Commit `18a4bf9` (include fix review F1–F4): `processed_at` post-effetti (commit marker); retry eventi incompleti sulla stessa riga; `tenant_id` tracciabile e immutabile dopo la prima valorizzazione; correlazione customer–tenant idempotente e non rimappante; race condition gestite con filtri condizionali e readback; eventi `customer.subscription.*` / `invoice.*` allowlist solo persistiti (`processed_at` nullo, deferiti a I4.3B) |
| **I4.3A-D1 — deploy controllato `stripe-webhook`** | Completato (nessun commit applicativo; nessuna modifica locale). Project ref `dormvfiwgzyzslxybetb`. Comando eseguito **una sola volta**: `npx --no-install supabase functions deploy stripe-webhook --project-ref dormvfiwgzyzslxybetb` (exit code 0). Remoto: versione **3 → 4**, stato `ACTIVE`, function ID invariato `cfe903ca-9285-4b1f-a9ed-97e51f676a1c`, `verify_jwt = false`. `create-checkout-session` invariata v4; nessuna altra Edge Function toccata; nessun secret modificato/ruotato; nessuna migration, RLS, operazione DB o deploy frontend. Verifica remota limitata a metadati amministrativi (versione/timestamp), non confronto byte-per-byte del bundle |
| **I4.3A-D1-bis** | Commit `751852b` — *docs(context): record stripe webhook deployment* |
| **I4.3A-T1A — rifiuto firma webhook** | Completato. Endpoint sandbox autorizzato: `https://dormvfiwgzyzslxybetb.functions.supabase.co/stripe-webhook`. POST senza `Stripe-Signature` → HTTP 400 `INVALID_REQUEST` «Missing Stripe-Signature header.»; POST con firma palesemente invalida → HTTP 400 `INVALID_REQUEST` «Invalid Stripe signature.» Stessi comportamenti verificati anche manualmente dall’utente con curl. Nessuna firma valida né scrittura DB intenzionale durante T1A |
| **I4.3A-T1B — percorso differito `customer.subscription.created`** | Completato (sandbox/test-mode). Eseguito **una sola volta**: `stripe trigger customer.subscription.created` (exit code 0). Evento target `evt_1U1YPpFOUoE38beB0W7rWRDY` (`customer.subscription.created`); subscription target `sub_1U1YPmFOUoE38beBxmPr1zil`; `livemode=false`. Evento allowlist correlato `evt_1U1YPpFOUoE38beBagDTOmNj` (`invoice.payment_succeeded`). Fixture ha generato anche eventi non-allowlist sandbox attesi; nessun evento live. Nessun secondo trigger, nessun resend, nessun cleanup |

### In corso / incompleto

| Voce | Dettaglio |
|------|-----------|
| **Test runtime post-deploy (I4.3A-T1)** | **Parzialmente completato**: T1A e T1B conclusi. Restano **non** ancora provati sul remoto: idempotenza su evento valido già persistito; retry di evento incompleto; correlazione positiva `checkout.session.completed` → `tenant_billing_customers`; conflitti customer–tenant runtime; race condition corrette in I4.3A. **I4.3A-T1 non è integralmente chiuso** |
| **I4.3B (separato, non avviato)** | Sync `customer.subscription.*` → `tenant_subscriptions` + snapshot `tenants` — **non** avviato; resta **successivo** ai test runtime residui |
| **Sync subscription** | Eventi `customer.subscription.*` / invoice: **solo persistiti** in `billing_events` con `processed_at` nullo; **non** aggiornano ancora `tenant_subscriptions` né lo snapshot su `tenants` (verificato in T1B: `tenant_subscriptions` = 0 per la subscription target) |
| **Billing portal** | `create-billing-portal-session` → ancora `501 Not Implemented` |
| **Frontend checkout** | UI mostra “Gestione abbonamento in arrivo”; **non** invoca l’Edge Function |
| **Feature gating** | Non implementato |
| **Tenant switcher / inviti** | Non implementati da UI |
| **Smoke test post-H4** | Checklist produzione da chiudere manualmente se non già fatto |
| **Staging dedicato** | Spesso assente: lavoro fatto su produzione con cautela |
| **Docs drift** | Drift storico **ancora presente e non corretto** in questo task: `docs/production-readiness.md` e `docs/billing-data-model.md` (§16 descrive ancora I4.0 “senza mutazioni DB”; I4.1/I4.2/I4.3A le hanno introdotte/estese). Fuori scope di I4.3A-T1-bis — allineare in fase documentale dedicata |
| **Prerequisiti / limiti operativi mirror** | Config locale necessaria per ogni clone/macchina; apply bloccato da qualsiasi modifica o file untracked (fail-closed); Google Drive Desktop può richiedere tempo per propagare al cloud; lo script è versionato nel repo ma **non** fa parte del perimetro mirror docs/rules |

### Esplicitamente fuori scope finché non richiesto

- Stripe **live** keys
- Feature gating hard / limiti piano
- Tenant switcher UI, inviti membership da UI
- Backend Node obbligatorio
- Audit log completo, job asincroni product-wide
- Self-service signup pubblico (AuthGate resta invitation-oriented)

---

## 3. Architettura attuale (mappa file)

```
src/
  App.tsx                    # orchestrazione UI
  AuthGate.tsx               # login password
  features/expenses/         # repository, mapper, hooks, realtime (filtro tenant_id)
  features/tenancy/          # activeTenantId, plan snapshot, membership role
  features/billing/          # read-model snapshot + placeholder CTA
  components/app/            # presentational pieces
  lib/supabaseClient.ts      # solo VITE_SUPABASE_URL + ANON_KEY

supabase/
  migrations/000_baseline_current_schema.sql   # baseline locale CLI (NON push cieco in prod)
  migrations_archive/001..006                  # storia; non replayare da zero
  functions/
    create-checkout-session/   # Stripe Checkout mode=subscription (test)
    create-billing-portal-session/  # 501
    stripe-webhook/            # firma + billing_events + correlazione tenant_billing_customers (I4.3A)
    _shared/auth.ts, http.ts
  snippets/demo/, snippets/drafts/

scripts/
  sync-ai-context-mirror.sh    # sync controllata mirror (GOVERNANCE-7)
```

**Vincolo migration:** dopo M8, nuove migration **additive** (`007_*` o timestamp). **Non** editare la baseline `000_` per evoluzioni.

---

## 4. Cronologia fasi (dai prompt di lavoro)

Ordine concettuale seguito nelle chat (May–Aug 2026):

1. **Prompt 0** — Project Rules in `.cursor/rules/`
2. **Audit** — `docs/saas-audit.md` (senza codice)
3. **Fase 1 DB** — tenant RLS (ex 002) + fix frontend `tenant_id` + guard 003
4. **FASE B/C** — extract expenses/tenancy layers; hardening client
5. **FASE D** — tenant plan readiness (ex 005)
6. **FASE E** — demo tenant operativo (doc + SQL manuali)
7. **FASE F** — production readiness light
8. **FASE G / G2–G4** — design billing data model (+ draft SQL)
9. **FASE H1 / H1.1 / H2 / H4** — harden draft → migration 006 → apply produzione + validazione
10. **FASE M2–M9** — Supabase CLI, dedup migrations, snippets, baseline squash locale, app su Supabase local, guardrail workflow
11. **FASE N0–N2** — hardening pre-Stripe, split `App.tsx`, billing read model frontend
12. **FASE I0–I2** — design Stripe → scaffold EF → auth/authz JWT + ruolo admin/billing
13. **I3.0 / I3.0-R / I3.0-D1** — checkout session foundation + review + fix import Deno per deploy
14. **I3.1** — test manuale produzione checkout (secrets, smoke 401/422, Stripe test)
15. **I4.0** — webhook signature verification foundation
16. **I4.1** — persistenza idempotente `billing_events`
17. **I4.2** — correlazione Stripe customer → `tenant_billing_customers` (+ checkout già in mode subscription)
18. **I4.3A** — hardening del ciclo `billing_events` e della correlazione Stripe customer–tenant, consolidato in `18a4bf9`, inclusi i fix di review F1–F4
19. **GOVERNANCE-1 / GOVERNANCE-2 / GOVERNANCE-3-bis / GOVERNANCE-4 (`1e83f19`) / GOVERNANCE-4-bis (`14a8575`) / GOVERNANCE-5-bis (`063cbf7`) / GOVERNANCE-6-bis (`253affa`)** — modello operativo Supervisor/Executor; consolidamento fonti in `1e83f19`; normalizzazione stato in `14a8575`; GOVERNANCE-5-bis in `063cbf7`; GOVERNANCE-6-bis consolidato in `253affa`
20. **I4.3A-bis** — aggiornamento stato operativo dopo hardening billing, consolidato in `99dc1f6`
21. **GOVERNANCE-7** — sincronizzazione controllata del mirror, consolidata in `8ff556d` (inclusi F1 e F2); script `scripts/sync-ai-context-mirror.sh`; prima sincronizzazione post-commit completata su **15 file** (dry-run, apply, confronto byte-per-byte)
22. **GOVERNANCE-7-bis** — aggiornamento stato operativo dopo GOVERNANCE-7, consolidato in `a380ce9`
23. **I4.3A-D1** — deploy controllato della sola Edge Function `stripe-webhook` su project ref `dormvfiwgzyzslxybetb` (remoto v3→v4, `ACTIVE`); nessuna modifica locale
24. **I4.3A-D1-bis** — aggiornamento stato operativo dopo deploy webhook, consolidato in `751852b`
25. **I4.3A-T1A** — test runtime negativo firma webhook (HTTP 400 senza signature / con signature invalida); verificato anche manualmente dall’utente con curl
26. **I4.3A-T1B** — test runtime positivo differito `customer.subscription.created` (sandbox); Workbench HTTP 200; persistenza `billing_events` differita verificata; `tenant_subscriptions` = 0

Stile operativo ricorrente nei prompt: **micro-fasi**, “modifica SOLO questi file”, no deploy/migration senza conferma, Stripe solo `sk_test_`, nessun secret in repo.

---

## 5. Secrets e ambiente (senza valori)

### Frontend (Vite)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Mai `service_role`. Template: `.env.example`. File locali ignorati da `.gitignore` (`.env*`).

### Edge Functions (solo server Supabase secrets)

| Secret | Uso |
|--------|-----|
| `STRIPE_SECRET_KEY` | Deve iniziare con `sk_test_` |
| `STRIPE_PRICE_ID_PRO_MONTHLY` | Price Checkout |
| `APP_BASE_URL` / `SITE_URL` | success/cancel URL |
| `STRIPE_WEBHOOK_SECRET` | Verifica firma webhook |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Persistenza webhook (server-only) |

File locali tipo `.env.edge.production.local` / `supabase/functions/.env*.local` sono gitignored — **non** condividere contenuti con ChatGPT.

---

## 6. Prossimi passi consigliati

### Punto di ripresa raccomandato: micro-test runtime residuo di I4.3A-T1 (protetto)

**I4.3A applicativo:** completato e consolidato in `18a4bf9`.

**I4.3A-D1:** deploy amministrativamente verificato — Edge Function `stripe-webhook` remota versione **4** su project ref `dormvfiwgzyzslxybetb` (da v3; `ACTIVE`; function ID invariato; comando nominativo eseguito una sola volta con exit code 0). Nessuna modifica locale durante D1. Nessun secret ruotato; nessuna altra funzione/DB/frontend toccati. Documentato in I4.3A-D1-bis (`751852b`).

**I4.3A-T1A:** completato — rifiuto firma (mancante / invalida → HTTP 400 `INVALID_REQUEST`); anche verificato manualmente dall’utente con curl. Nessuna scrittura DB intenzionale.

**I4.3A-T1B:** completato — un solo `stripe trigger customer.subscription.created` (sandbox, exit 0). Workbench: destinazione attiva; `customer.subscription.created` e `invoice.payment_succeeded` **Consegnato / HTTP 200**; nessun resend. DB read-only (SQL Editor, utente): esattamente due righe in `billing_events` (`evt_1U1YPpFOUoE38beB0W7rWRDY`, `evt_1U1YPpFOUoE38beBagDTOmNj`) con `tenant_id` / `processed_at` / `processing_error` tutti `NULL`; `tenant_subscriptions` per `sub_1U1YPmFOUoE38beBxmPr1zil` = **0**. Comportamento differito verificato; nessuna sync subscription.

**I4.3A-T1 complessivo:** **parzialmente completato**, **non** integralmente chiuso. Restano non provati sul remoto: idempotenza su evento già persistito; retry di evento incompleto; correlazione positiva `checkout.session.completed` → `tenant_billing_customers`; conflitti customer–tenant runtime; race condition di I4.3A.

**Prossimo micro-task:** da definire/revisionare da ChatGPT — test isolato di **idempotenza/retry** e/o **`checkout.session.completed`**, senza anticipare automaticamente quale dei due. Operazione protetta; richiede **autorizzazione esplicita** dell’utente.

**I4.3B:** non avviato e non autorizzato; resta **successivo** ai test runtime residui.

Vincoli permanenti da mantenere:

- Stripe esclusivamente in **test mode**
- Billing **tenant-first**
- Secrets e `service_role` esclusivamente **server-side**; nessun secret in `VITE_*`
- `billing_events` **non** leggibile direttamente dal frontend; nessuna scrittura billing privilegiata dal frontend
- Nessun avvio della sincronizzazione `tenant_subscriptions` o snapshot `tenants`
- Nessun uso di Stripe **live**
- Nessuna modifica della baseline `supabase/migrations/000_baseline_current_schema.sql`
- Future migration soltanto **additive** da `007_*` o timestamp equivalente
- Nessun `supabase db push`

### Dopo test runtime: I4.3B (fase separata, non avviata)

**I4.3B — subscription sync e tenant snapshot**

Punti ancora da progettare e implementare (non trasformare in implementazione ora):

- Eventi `customer.subscription.created|updated|deleted` (oggi solo persistiti, `processed_at` nullo)
- Upsert di `tenant_subscriptions`
- Mapping del prodotto Stripe `pro_monthly` verso il piano interno `paid`
- Mapping esplicito degli stati Stripe verso `tenants.subscription_status`
- Protezione dei tenant `demo` e `internal`
- Gestione di `trial_ends_at`
- Eventi invoice inizialmente fuori scope, salvo decisione esplicita

### Altri passi (dopo I4.3B o in parallelo se priorità diversa)

1. **I5** — implementare `create-billing-portal-session` (authz già presente).
2. **UI** — CTA checkout/portal solo per ruolo `admin`/`billing`, chiamando le EF (senza secret client).
3. **Doc sync** — aggiornare `docs/billing-data-model.md` e `docs/production-readiness.md` (drift storico ancora aperto) e sezione “prossimi passi” di `docs/saas-refactor-plan.md` allo stato post-I4.3.
4. **Prodotto SaaS non-billing**: tenant switcher, inviti, test RLS cross-tenant (`docs/saas-rls-test-plan.md`).

---

## 7. Quality gate

### I4.3A applicativo

Registrati dal consolidamento I4.3A (`18a4bf9`):

| Gate | Esito |
|------|--------|
| `git diff --check` | Superato |
| `npm run lint` (`tsc --noEmit`) | Superato |
| `npm run build` | Superato |
| Warning Vite chunk size | Preesistente, non bloccante |
| `deno check` | **Non eseguito** (Deno non disponibile nell’ambiente del task) |
| Test runtime Stripe / Supabase | **Non eseguiti** |
| Deploy Edge Function | **Non eseguito** in I4.3A (eseguito successivamente in I4.3A-D1) |

### I4.3A-D1 (deploy controllato)

Registrati dal report I4.3A-D1 (nessuna modifica locale; HEAD rimasto `a380ce9`):

| Gate | Esito |
|------|--------|
| `npm run lint` (`tsc --noEmit`) | PASS |
| `npm run build` | PASS |
| Warning Vite chunk size | Preesistente, non bloccante |
| Warning Docker | Non bloccante |
| `deno check` | **Non eseguito** (Deno non disponibile nell’ambiente) |
| Deploy `stripe-webhook` | Eseguito una sola volta; exit code 0; remoto v3→v4, `ACTIVE` |
| Altre Edge Functions / secrets / migration / RLS / DB / frontend | **Non toccati** |
| Test runtime Stripe / webhook | **Non eseguiti** |
| Confronto byte-per-byte del bundle remoto | **Non eseguito** (solo metadati amministrativi versione/timestamp) |
| `git fetch` / freschezza server `origin/main` | **Non eseguito** / non aggiornata |

### I4.3A-T1A (firma negativa)

Registrati dal report operativo T1A (sandbox; nessuna scrittura DB intenzionale):

| Gate | Esito |
|------|--------|
| Endpoint webhook sandbox | `https://dormvfiwgzyzslxybetb.functions.supabase.co/stripe-webhook` |
| POST senza `Stripe-Signature` | HTTP 400 `INVALID_REQUEST` — Missing Stripe-Signature header |
| POST con firma palesemente invalida | HTTP 400 `INVALID_REQUEST` — Invalid Stripe signature |
| Verifica manuale utente (curl) | Stessi due comportamenti confermati |
| Firma valida / scrittura DB intenzionale | **Non** eseguite in T1A |
| `git fetch` | **Non eseguito** |

### I4.3A-T1B (percorso differito positivo)

Registrati dal report operativo T1B e dalle verifiche manuali utente (Workbench + SQL Editor):

| Gate | Esito |
|------|--------|
| `stripe trigger customer.subscription.created` | Eseguito **una sola volta**; exit code 0; sandbox/`livemode=false` |
| Evento target | `evt_1U1YPpFOUoE38beB0W7rWRDY` (`customer.subscription.created`) |
| Subscription target | `sub_1U1YPmFOUoE38beBxmPr1zil` |
| Evento allowlist correlato | `evt_1U1YPpFOUoE38beBagDTOmNj` (`invoice.payment_succeeded`) |
| Workbench `customer.subscription.created` | Consegnato — HTTP 200 |
| Workbench `invoice.payment_succeeded` | Consegnato — HTTP 200 |
| Resend / secondo trigger / cleanup | **Non** eseguiti |
| `billing_events` (SQL Editor, read-only) | Esattamente **2** righe target; `tenant_id` / `processed_at` / `processing_error` tutti `NULL` |
| `tenant_subscriptions` per subscription target | **0** righe |
| Eventi live | Nessuno |
| Idempotenza / retry / `checkout.session.completed` / conflitti / race | **Non** ancora testati (restano aperti in I4.3A-T1) |
| I4.3B | **Non avviato** |

### GOVERNANCE-7

Registrati dal consolidamento GOVERNANCE-7 (`8ff556d`, inclusi F1/F2) e dalla prima sync post-commit:

| Gate | Esito |
|------|--------|
| `git diff --check` | Superato |
| `bash -n scripts/sync-ai-context-mirror.sh` | Superato |
| Dry-run (`--dry-run`) | Superato |
| Test negativo apply con working tree sporca | Superato (output esatto e sanitizzato) |
| Prima apply reale post-commit | Superata (15 file) |
| Confronto byte-per-byte su 15 file | Superato |
| `shellcheck` | **Non eseguito** (non disponibile nell’ambiente) |
| `npm run lint` / `npm run build` | **Non eseguiti** (task governance/documentale) |
| Deploy / migration / test runtime applicativo | **Non eseguiti** |

---

## 8. Rischi e limiti residui

### I4.3A / post-deploy / runtime parziale

- Il flusso webhook usa **più query Supabase** e **non** costituisce una singola transazione PostgreSQL; il retry è reso idempotente dalla riga `billing_events` e dalla correlazione non rimappante. **Rischio multi-query non-transazionale ancora aperto.**
- Eventi legacy di I4.1/I4.2 già marcati `processed_at` **prima** di una correlazione riuscita **non** vengono riparati automaticamente.
- Conflitti permanenti customer–tenant possono continuare a generare retry finché non vengono diagnosticati.
- Il codice I4.3A è **deployato** (`stripe-webhook` remota v4). Runtime **parzialmente** verificato: firma negativa (T1A) e percorso differito `customer.subscription.*` / `invoice.*` con persistenza `billing_events` (T1B + Workbench HTTP 200 + SQL Editor). **Non** ancora verificati sul remoto: idempotenza su evento già persistito; retry di evento incompleto; correlazione `checkout.session.completed` → `tenant_billing_customers`; conflitti customer–tenant; race condition di I4.3A.
- Firma Stripe valida verificata **indirettamente** tramite consegna Workbench HTTP 200 (non tramite firma costruita localmente in T1A).
- La verifica remota di I4.3A-D1 è limitata a **metadati amministrativi** (versione, timestamp, stato `ACTIVE`); **non** è stato eseguito un confronto byte-per-byte del bundle deployato.
- La freschezza server di `origin/main` **non** è stata aggiornata (`git fetch` non eseguito in D1, D1-bis, T1A né T1B).
- `deno check` resta da eseguire in un ambiente idoneo (non eseguito in I4.3A né in I4.3A-D1).
- Eventi `customer.subscription.*` / `invoice.*` persistiti con `processed_at` nullo attendono **I4.3B** (non avviato); T1B ha confermato `tenant_subscriptions` = 0 per la subscription target.
- Fixture T1B: eventi non-allowlist sandbox generati dalla fixture restano fuori scope di cleanup in questo ciclo; nessun evento live.
- Drift storico di `docs/production-readiness.md` e `docs/billing-data-model.md` **ancora presente e non corretto** (fuori scope di questo task).

### Mirror (GOVERNANCE-7)

- La configurazione mirror è **locale** al clone/macchina.
- File untracked o modifiche locali bloccano `--apply`, per scelta fail-closed.
- La verifica dello script copre il mirror **locale**; la propagazione cloud dipende da **Google Drive Desktop**.
- ChatGPT **non** monitora Drive automaticamente.
- Nessun Git hook né automazione in background.
- Lo script **non** elimina file obsoleti dal mirror (`--delete` vietato).
- Il percorso personale non deve mai entrare in file versionati, report o prompt.
- Il nuovo workflow **non** autorizza push, deploy, migration, segreti o operazioni remote.

### Stato del mirror Drive

- Prima sync controllata (post-commit `8ff556d`): aggiornati i **15 file** ammessi; dry-run, apply e confronto byte-per-byte riusciti.
- GOVERNANCE-7-bis consolidato in `a380ce9`; sync post-commit del relativo aggiornamento di `docs/stato-operativo.md` secondo workflow governance.
- I4.3A-D1-bis consolidato in `751852b` — *docs(context): record stripe webhook deployment*; sync post-commit secondo workflow governance.
- `docs/stato-operativo.md` viene aggiornato da questo task (I4.3A-T1-bis) e sarà sincronizzato **solo dopo** il relativo commit.
- Nessuna riconciliazione Drive → repository è consentita.

---

## 9. Guardrail non negoziabili

- Tenant-first: ogni operazione dati con `activeTenantId` / `tenant_id` tracciabile.
- RLS sempre on; scritture billing **solo** server-side.
- `billing_events` **non** leggibile dal client (no GRANT SELECT authenticated).
- Baseline `000_*` immutabile per cambi futuri; niente rewrite storia produzione.
- `npm run lint` (= `tsc --noEmit`) e `npm run build` dopo modifiche rilevanti.
- Nessun commit di `.env` / chiavi reali.
- Cursor esegue solo il micro-task assegnato; non anticipa I4.3B o altre fasi dai “Consigli a ChatGPT”.

---

## 10. Comandi utili

```bash
npm install
npm run dev          # Vite :3000
npm run lint
npm run build
npx supabase start
npx supabase db reset   # SOLO locale, dopo review baseline
# Deploy EF (solo con conferma):
# npx supabase functions deploy <name> --project-ref <ref>
# Mirror AI context (solo post-commit, working tree pulita):
# scripts/sync-ai-context-mirror.sh --dry-run
# scripts/sync-ai-context-mirror.sh --apply
```

---

## 11. Documenti di riferimento

| Documento | Contenuto |
|-----------|-----------|
| `docs/stato-operativo.md` | Questo snapshot (ripresa rapida) — **fonte canonica dinamica** |
| `.cursor/rules/000-project-context.mdc` | Contesto, ruoli, ciclo micro-fasi, numerazione prompt, sync mirror, report obbligatorio |
| `docs/ai-context-mirror.md` | Mirror Google Drive di consultazione + workflow script (non canonico) |
| `scripts/sync-ai-context-mirror.sh` | Script ufficiale sync controllata (GOVERNANCE-7) |
| `docs/saas-refactor-plan.md` | Storia fasi A–M e decisioni |
| `docs/billing-data-model.md` | Design billing + note I1–I4.0 (parziale drift post I4.1/I4.3A) |
| `docs/supabase-cli-baseline.md` | Come creare migration post-baseline |
| `docs/production-readiness.md` | Deploy / smoke / rollback |
| `docs/demo-tenant.md` | Runbook demo |
| `docs/saas-rls-test-plan.md` | Checklist RLS |
| `README.md` | Setup locale e Render |

---

*Aggiornare questo file alla fine di ogni micro-fase billing, governance o migration rilevante (commit applicativo di riferimento, commit governance consolidato, cosa fatto, prossima azione). Non pretendere che l’HEAD Git corrente coincida stabilmente con i valori storici di questo documento; verificarlo sempre con `git rev-parse HEAD`.*
