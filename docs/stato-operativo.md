# Stato operativo — Gestore Spese Quotidiane

**Data snapshot:** 2026-08-06

| Voce | Valore |
|------|--------|
| Branch atteso | `main` |
| Commit applicativo di riferimento | `18a4bf91001589c75fcf0796bde7f2da7d1b1c87` — *fix(billing): harden webhook event processing* — I4.3A |
| Ultimo commit governance/documentale consolidato | `8ff556d174af0725ae6ded426a94c624b1634e9d` — *chore(governance): add controlled mirror synchronization* — GOVERNANCE-7 |
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
- Stripe test-mode: checkout Edge Function operativa (create-checkout-session); webhook con firma + persistenza billing_events + correlazione customer→tenant su checkout.session.completed; I4.3A consolidato in 18a4bf9 (hardening ciclo billing_events).
- I4.3A: processed_at è commit marker applicativo (non semplice ricevuta); eventi incompleti (processed_at nullo) ritentabili sulla stessa riga; eventi già completati = no-op idempotenti; billing_events.tenant_id valorizzato in modo verificato e non rimappabile silenziosamente; correlazione tenant_billing_customers senza upsert che cambi identità; conflitti customer–tenant non sovrascritti; processing_error sintetico/sanitizzato; update critici condizionati con record restituito o readback; race F1–F4 corrette. Eventi customer.subscription.* e invoice.* allowlist: solo persistiti, processed_at resta nullo (attendono I4.3B). Deploy webhook aggiornato e test runtime NON eseguiti né autorizzati.
- Governance: GOVERNANCE-5-bis in 063cbf7; GOVERNANCE-6-bis in 253affa; I4.3A-bis in 99dc1f6; GOVERNANCE-7 consolidato in 8ff556d (script scripts/sync-ai-context-mirror.sh; sync controllata mirror).
- Mirror: Git canonico, Drive = consultazione. Commit/push restano dell’utente. Dopo conferma del commit, Cursor esegue dry-run poi apply (obbligatoria dopo ogni -bis). Config locale non versionata (AI_CONTEXT_MIRROR_DIR o .git/ai-context-mirror-path). Nessun --delete, nessuna sync inversa. Verifica byte-per-byte. Prima sync controllata completata su 15 file. Propagazione cloud = Google Drive Desktop. ChatGPT rilegge il mirror a ogni ripresa.
- ANCORA MANCANTE: deploy/test controllato del webhook aggiornato; sync subscription → tenant_subscriptions + snapshot tenants (I4.3B, non avviato); billing portal; UI checkout reale; feature gating piani; tenant switcher/inviti.

Riparti dal prossimo micro-task raccomandato: I4.3A-D1 — verifica stato remoto e deploy controllato della sola Edge Function stripe-webhook in Stripe test mode (operazione protetta; richiede autorizzazione esplicita dell’utente). NON avviare I4.3B né sync subscription senza task esplicito. Dopo il deploy: task separato I4.3A-T1 per test runtime controllati.

Chiedimi conferma prima di: deploy Edge Functions, apply migration produzione, db push, live Stripe keys, cambi RLS su expenses.
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
| Commit storici governance | `14a8575` (GOVERNANCE-4-bis); `1e83f19` (fonti canoniche) |
| Commit applicativo corrente | `18a4bf9` — *fix(billing): harden webhook event processing* (I4.3A, include fix review F1–F4) |
| Commit applicativo precedente | `1f633fcc` (I4.2) |
| `.cursor/rules/000-project-context.mdc` | Esteso in `063cbf7`; sync post-commit aggiornata in `8ff556d` |
| `docs/ai-context-mirror.md` | Creato in `063cbf7`; workflow script aggiornato in `8ff556d` |
| `scripts/sync-ai-context-mirror.sh` | Introdotto in `8ff556d` (mode Git `100755`) |
| `README.md` | Collegamento a `docs/stato-operativo.md` **versionato** in `1e83f19` |

L’HEAD reale e l’allineamento con `origin/main` vanno **sempre verificati** all’inizio di ogni task. **I4.3B** resta separato e non avviato. Nessuna sincronizzazione subscription, nessun aggiornamento dello snapshot `tenants`, nessun deploy del webhook aggiornato dichiarati come eseguiti in questo snapshot.

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
| Governance operativa (GOVERNANCE-1/2/3-bis/4/`1e83f19`/4-bis/`14a8575`/5-bis/`063cbf7`/6-bis/`253affa`/I4.3A-bis/`99dc1f6`/7/`8ff556d`) | Modello Supervisor/Executor; numerazione prompt e workflow `-bis`; fonti canoniche in `1e83f19`; GOVERNANCE-4-bis in `14a8575`; GOVERNANCE-5-bis in `063cbf7`; GOVERNANCE-6-bis in `253affa`; I4.3A-bis in `99dc1f6`; GOVERNANCE-7 in `8ff556d` |
| **GOVERNANCE-7 — sync controllata mirror** | Commit `8ff556d`: script `scripts/sync-ai-context-mirror.sh`; delega post-commit a Cursor (dopo conferma utente); dry-run → apply; apply solo con working tree pulita; perimetro Git tracciato (`docs/**/*.md`, `.cursor/rules/**/*.mdc`); privacy-safe (no percorsi personali); no `--delete` / no sync inversa; verifica byte-per-byte; **prima sync controllata completata su 15 file** |
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

### In corso / incompleto

| Voce | Dettaglio |
|------|-----------|
| **Deploy webhook aggiornato** | Codice I4.3A in repo (`18a4bf9`); **deploy della Edge Function `stripe-webhook` non verificato / non eseguito** in questo snapshot — non dichiarare deployato |
| **Test runtime test-mode** | Non eseguiti (né autorizzati) dopo I4.3A |
| **I4.3B (separato, non avviato)** | Sync `customer.subscription.*` → `tenant_subscriptions` + snapshot `tenants` — **non** avviato |
| **Sync subscription** | Eventi `customer.subscription.*` / invoice: **solo persistiti** in `billing_events` con `processed_at` nullo; **non** aggiornano ancora `tenant_subscriptions` né lo snapshot su `tenants` |
| **Billing portal** | `create-billing-portal-session` → ancora `501 Not Implemented` |
| **Frontend checkout** | UI mostra “Gestione abbonamento in arrivo”; **non** invoca l’Edge Function |
| **Feature gating** | Non implementato |
| **Tenant switcher / inviti** | Non implementati da UI |
| **Smoke test post-H4** | Checklist produzione da chiudere manualmente se non già fatto |
| **Staging dedicato** | Spesso assente: lavoro fatto su produzione con cautela |
| **Docs drift** | `docs/billing-data-model.md` §16 descrive I4.0 “senza mutazioni DB”; I4.1/I4.2/I4.3A le hanno introdotte/estese — aggiornare la doc in una fase dedicata di allineamento documentazione billing |
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

### Punto di ripresa raccomandato: I4.3A-D1 (protetto, non autorizzato)

**I4.3A-D1 — verifica dello stato remoto e deploy controllato della sola Edge Function `stripe-webhook` in Stripe test mode**

- **GOVERNANCE-7** e la prima sincronizzazione controllata sono **completati** (`8ff556d`).
- **GOVERNANCE-7-bis** è il task documentale **corrente** (aggiornamento di questo file); il relativo commit sarà registrato nel prossimo aggiornamento significativo — **non** anticiparlo qui.
- Dopo il commit di GOVERNANCE-7-bis, Cursor dovrà eseguire **automaticamente** la sincronizzazione post-commit (dry-run → apply → verifica byte-per-byte → report → stop).
- Operazione **protetta**: richiede **autorizzazione esplicita** dell’utente.
- **Non** eseguire nel task documentale.
- **Non** includere: migration, `db push`, rotazione/configurazione segreti, Stripe **live**.
- Solo la Edge Function `stripe-webhook` (verificare stato remoto prima del deploy).
- Dopo il deploy dovrà seguire un task **separato** **I4.3A-T1** per test runtime controllati in test mode.
- **I4.3B** resta successivo e **non** deve essere avviato automaticamente né presentato come immediatamente autorizzato.

### Dopo deploy + test: I4.3B (fase separata, non avviata)

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
3. **Doc sync** — aggiornare `docs/billing-data-model.md` e sezione “prossimi passi” di `docs/saas-refactor-plan.md` allo stato post-I4.3.
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
| Deploy Edge Function | **Non eseguito** |

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

### I4.3A

- Il flusso webhook usa **più query Supabase** e **non** costituisce una singola transazione PostgreSQL; il retry è reso idempotente dalla riga `billing_events` e dalla correlazione non rimappante.
- Eventi legacy di I4.1/I4.2 già marcati `processed_at` **prima** di una correlazione riuscita **non** vengono riparati automaticamente.
- Conflitti permanenti customer–tenant possono continuare a generare retry finché non vengono diagnosticati.
- Il nuovo codice **non** è ancora stato verificato a runtime dopo deploy.
- `deno check` resta da eseguire in un ambiente idoneo.
- Eventi `customer.subscription.*` / `invoice.*` persistiti con `processed_at` nullo attendono **I4.3B**.

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
- Lettura successiva da ChatGPT: confermato l’aggiornamento di `docs/ai-context-mirror.md` e `.cursor/rules/000-project-context.mdc`.
- `docs/stato-operativo.md` viene aggiornato da questo task (GOVERNANCE-7-bis) e sarà sincronizzato **solo dopo** il relativo commit.
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
