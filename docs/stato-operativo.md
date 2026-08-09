# Stato operativo — Gestore Spese Quotidiane

**Data snapshot:** 2026-08-09

| Voce | Valore |
|------|--------|
| Branch atteso | `main` |
| Commit applicativo di riferimento | `18a4bf91001589c75fcf0796bde7f2da7d1b1c87` — *fix(billing): harden webhook event processing* — I4.3A |
| Ultimo commit governance/documentale consolidato | `436d58752eec09ef8008feff7f3f74ebd504f7ff` — *docs(context): record subscription sync architecture findings* — I4.3BA-bis |
| Verifica Git richiesta | All’inizio di ogni task: `git rev-parse HEAD`, `git status`, `git branch --show-current` |

Nota: l’HEAD reale deve essere verificato all’inizio di ogni task con `git rev-parse HEAD`. Il commit che aggiorna `stato-operativo.md` può essere successivo all’ultimo commit registrato nel documento; questo non costituisce automaticamente una divergenza. Branch, working tree e cronologia reale del repository prevalgono sempre sui valori storici riportati nel documento. Non riportare come HEAD stabile il futuro commit del task documentale corrente (I4.3BB-bis).

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
- I4.3A-T1C: PASS — percorso reale create-checkout-session → Checkout Stripe test-mode → checkout.session.completed naturale → stripe-webhook → billing_events (processed_at valorizzato) → tenant_billing_customers (customer cus_V1suEl84dwLFCe sul tenant demo dedicato). Session cs_test_a15jnXeM0ql2POBYCWPtjQLrUopbUd7K71aOU9F6jvqtIClXHHvGSMvtxq; evento evt_1U1p9GFOUoE38beBvxBWm69d (Workbench Consegnato, HTTP 200). Fixture failed diagnostica precedente evt_1U1o48FOUoE38beB2KuEcYKQ distinta (HTTP 502, non bug applicativo). Nessun file applicativo modificato; I4.3B non avviato.
- I4.3A-T1C-bis: consolidato in 2c0c060 — *docs(context): record checkout correlation runtime pass*.
- I4.3A-T1D: PASS — idempotenza runtime verificata con un solo Resend Workbench dello stesso checkout.session.completed già processato (evt_1U1p9GFOUoE38beBvxBWm69d); HTTP 200; billing_events/customer/tenant invarianti; nessun secondo resend; I4.3B non avviato.
- I4.3A-T1D-bis: consolidato in 87d410c — *docs(context): record webhook idempotency runtime pass*.
- I4.3A-T1E: PASS — retry runtime di billing_event incompleto (evt_1U1o48FOUoE38beB2KuEcYKQ) verificato fail-closed: una sola riga; processed_at/tenant_id NULL; customer NULL; processing_error coerente; payload invariato; nessuna correlazione/subscription/snapshot commerciale; HTTP 502; lacuna minore due POST 502 senza event ID nei log (non bloccante); nessun ulteriore resend; I4.3B non avviato.
- I4.3A-T1E-bis: consolidato in 8615cda — *docs(context): record incomplete webhook retry runtime pass*.
- I4.3A-T1F: CHIUSO SU EVIDENZA STATICA SUFFICIENTE (non runtime PASS; CASO 3; nessun runtime conflict). I4.3A-T1F-bis consolidato in d4a2889 — *docs(context): record customer tenant conflict static closure*.
- I4.3A-T1G: CHIUSO SU EVIDENZA STATICA SUFFICIENTE (non runtime PASS). Nessun runtime race test eseguito; runtime non necessario (decisione Supervisor); classificazione CASO 3. Race R1–R8 neutralizzate rispetto agli invarianti del flusso corrente; UNIQUE DB su billing_events e tenant_billing_customers; update condizionali + readback; 23505 → re-lookup/riclassificazione; recordProcessingError non riscrive eventi completed; markBillingEventProcessed azzera processing_error; stati intermedi multi-query ritentabili; nessuno stato permanente incoerente individuato.
- I4.3A-T1G-bis: consolidato in 30da6a5 — *docs(context): record webhook race static closure*.
- I4.3A-T1 complessivo: CHIUSO COMPLESSIVAMENTE con evidenza mista — T1A–T1E runtime PASS; T1F e T1G chiusure statiche. NON dichiarare «I4.3A-T1 runtime PASS» nel complesso. Nessun residuo I4.3A-T1.
- I4.3BA: completato — ricognizione architetturale zero-code su subscription sync; classificazione schema M2. I4.3BA-bis consolidato in 436d587 — *docs(context): record subscription sync architecture findings*; sync repository → mirror post-commit completata (dry-run OK, apply OK, verifica byte/hash OK su 15 file; cloud mirror verificato da ChatGPT; nessuna sync inversa; nessun --delete).
- I4.3BB / I4.3BB-R / F1–F3: completati ZERO-CODE / ZERO-DIFF. Strategia anti-stale: provider re-fetch + admission watermark Event + CAS/readback/re-fetch (**K2**). W_sub = (last_applied_provider_event_created_at, last_applied_provider_event_id) — admission watermark + CAS token, NON versione Stripe né clock. processed_at = unico commit marker Event; W_sub = prova effetto per-subscription (partial retry F1). Race snapshot cross-subscription (F2) → design revision-on-snapshot **superseded** da F3. Design tecnico approvato (**R2** / A2): tenants.billing_state_revision = generazione locale monotona del SET tenant_subscriptions; bump atomico via trigger DB su INSERT/UPDATE/DELETE (G1); snapshot CAS H2 NON incrementa revision; double-read non obbligatorio; billing_snapshot_revision NON richiesta. Forma M2 architetturale candidata approvata (NON implementata). SECURITY DEFINER del trigger NON congelato. Guardrail: Snapshot(S) deterministica sui dati catturati/protetti. D4: predicate/readback fail-closed necessari; is_demo non scritto dal webhook. Decisioni aperte: D3/D4/D5/D7/unpaid (D5 bloccante). I4.3B resta NON IMPLEMENTATO.
- Governance: GOVERNANCE-5-bis in 063cbf7; GOVERNANCE-6-bis in 253affa; I4.3A-bis in 99dc1f6; GOVERNANCE-7 consolidato in 8ff556d; GOVERNANCE-7-bis consolidato in a380ce9; I4.3A-D1-bis consolidato in 751852b; I4.3A-T1-bis consolidato in b4da681; I4.3A-T1C-bis consolidato in 2c0c060; I4.3A-T1D-bis consolidato in 87d410c; I4.3A-T1E-bis consolidato in 8615cda; I4.3A-T1F-bis consolidato in d4a2889; I4.3A-T1G-bis consolidato in 30da6a5; I4.3BA-bis consolidato in 436d587.
- Mirror: Git canonico, Drive = consultazione. Il mirror pre-task non contiene ancora I4.3BB-bis (differenza attesa). Commit/push restano dell’utente. Dopo conferma del commit, Cursor esegue dry-run poi apply (obbligatoria dopo ogni -bis). Config locale non versionata (AI_CONTEXT_MIRROR_DIR o .git/ai-context-mirror-path). Nessun --delete, nessuna sync inversa. Verifica byte-per-byte. Prima sync controllata completata su 15 file. Propagazione cloud = Google Drive Desktop. ChatGPT rilegge il mirror a ogni ripresa.
- ANCORA MANCANTE: sync subscription → tenant_subscriptions + snapshot tenants (I4.3B, NON IMPLEMENTATO; forma M2 architetturale candidata approvata ma migration/trigger/mapper/wiring assenti; decisioni D3/D4/D5/D7/unpaid aperte, D5 bloccante); invoice fuori scope I4.3B; billing portal; UI checkout reale; feature gating piani; tenant switcher/inviti. Drift storico di production-readiness.md e billing-data-model.md ancora presente.

Prossimo punto di ripresa: I4.3BC — decisione prodotto zero-code pre-implementazione (chiudere D3/D4/D5/D7/unpaid, priorità D5; verificare determinismo Snapshot(S)). I4.3B resta NON IMPLEMENTATO. NON avviare migration M2 / I4.3B1 mapper / webhook wiring. I4.3A-T1 = CHIUSO COMPLESSIVAMENTE. I4.3A-D1 concluso. I4.3BA / I4.3BB / I4.3BB-R / F1–F3 chiusi.

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
| I4.3A-T1-bis | Consolidato in `b4da681` — *docs(context): record webhook runtime verification* |
| I4.3A-T1C-bis | Consolidato in `2c0c060` — *docs(context): record checkout correlation runtime pass* |
| I4.3A-T1D-bis | Consolidato in `87d410c` — *docs(context): record webhook idempotency runtime pass* |
| I4.3A-T1E-bis | Consolidato in `8615cda` — *docs(context): record incomplete webhook retry runtime pass* |
| I4.3A-T1F-bis | Consolidato in `d4a2889` — *docs(context): record customer tenant conflict static closure* |
| I4.3A-T1G-bis | Consolidato in `30da6a5` — *docs(context): record webhook race static closure* |
| I4.3BA-bis | Consolidato in `436d587` — *docs(context): record subscription sync architecture findings* |
| Commit storici governance | `14a8575` (GOVERNANCE-4-bis); `1e83f19` (fonti canoniche) |
| Commit applicativo corrente | `18a4bf9` — *fix(billing): harden webhook event processing* (I4.3A, include fix review F1–F4) |
| Commit applicativo precedente | `1f633fcc` (I4.2) |
| `.cursor/rules/000-project-context.mdc` | Esteso in `063cbf7`; sync post-commit aggiornata in `8ff556d` |
| `docs/ai-context-mirror.md` | Creato in `063cbf7`; workflow script aggiornato in `8ff556d` |
| `scripts/sync-ai-context-mirror.sh` | Introdotto in `8ff556d` (mode Git `100755`) |
| `README.md` | Collegamento a `docs/stato-operativo.md` **versionato** in `1e83f19` |

L’HEAD reale e l’allineamento con `origin/main` vanno **sempre verificati** all’inizio di ogni task. Durante I4.3A-D1 l’HEAD locale è rimasto `a380ce9` (nessuna modifica locale; nessun commit applicativo). I4.3A-D1-bis consolidato in `751852b`. I4.3A-T1-bis consolidato in `b4da681`. I4.3A-T1C-bis consolidato in `2c0c060`. I4.3A-T1D-bis consolidato in `87d410c`. I4.3A-T1E-bis consolidato in `8615cda`. I4.3A-T1F-bis consolidato in `d4a2889`. I4.3A-T1G-bis consolidato in `30da6a5`. I4.3BA-bis consolidato in `436d587` (sync mirror post-commit: dry-run OK, apply OK, verifica byte/hash OK su 15 file; cloud mirror verificato da ChatGPT; nessuna sync inversa; nessun `--delete`). La freschezza server di `origin/main` **non** è stata aggiornata con `git fetch` (né in D1 né nei test T1A–T1G né in I4.3BA/I4.3BB). **I4.3A-D1** (deploy amministrativo `stripe-webhook`) è concluso. **I4.3A-T1A**–**T1E** = runtime PASS; **I4.3A-T1F** e **I4.3A-T1G** = **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (non runtime PASS; CASO 3). **I4.3A-T1** = **CHIUSO COMPLESSIVAMENTE** (evidenza mista; **non** «runtime PASS» nel complesso; nessun residuo). **I4.3BA** / **I4.3BB** / **I4.3BB-R** / **F1–F3** = ricognizioni/decisioni architetturali zero-code **completate** (forma M2 architetturale candidata approvata; migration **non** implementata). **I4.3B** resta **NON IMPLEMENTATO**. Nessuna sincronizzazione subscription, nessun aggiornamento dello snapshot `tenants`. Prossimo punto: **I4.3BC** (decisione prodotto zero-code).

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
| Governance operativa (GOVERNANCE-1/2/3-bis/4/`1e83f19`/4-bis/`14a8575`/5-bis/`063cbf7`/6-bis/`253affa`/I4.3A-bis/`99dc1f6`/7/`8ff556d`/7-bis/`a380ce9`/I4.3A-D1-bis/`751852b`/I4.3A-T1-bis/`b4da681`/I4.3A-T1C-bis/`2c0c060`/I4.3A-T1D-bis/`87d410c`/I4.3A-T1E-bis/`8615cda`/I4.3A-T1F-bis/`d4a2889`/I4.3A-T1G-bis/`30da6a5`/I4.3BA-bis/`436d587`) | Modello Supervisor/Executor; numerazione prompt e workflow `-bis`; fonti canoniche in `1e83f19`; GOVERNANCE-4-bis in `14a8575`; GOVERNANCE-5-bis in `063cbf7`; GOVERNANCE-6-bis in `253affa`; I4.3A-bis in `99dc1f6`; GOVERNANCE-7 in `8ff556d`; GOVERNANCE-7-bis in `a380ce9`; I4.3A-D1-bis in `751852b`; I4.3A-T1-bis in `b4da681`; I4.3A-T1C-bis in `2c0c060`; I4.3A-T1D-bis in `87d410c`; I4.3A-T1E-bis in `8615cda`; I4.3A-T1F-bis in `d4a2889`; I4.3A-T1G-bis in `30da6a5`; I4.3BA-bis in `436d587` |
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
| **I4.3A-T1B — percorso differito `customer.subscription.created`** | Completato (sandbox/test-mode). Eseguito **una sola volta**: `stripe trigger customer.subscription.created` (exit code 0). Evento target `evt_1U1YPpFOUoE38beB0W7rWRDY` (`customer.subscription.created`); subscription target `sub_1U1YPmFOUoE38beBxmPr1zil`; `livemode=false`. Evento allowlist correlato `evt_1U1YPpFOUoE38beFpDTOmNj` (`invoice.payment_succeeded`). Fixture ha generato anche eventi non-allowlist sandbox attesi; nessun evento live. Nessun secondo trigger, nessun resend, nessun cleanup |
| **I4.3A-T1C — correlazione `checkout.session.completed`** | **PASS** (sandbox/test-mode). Percorso reale: `create-checkout-session` (HTTP 200, tenant demo dedicato, membership admin già verificata, `plan_code` richiesto `pro_monthly`; JWT solo manuale dall’utente, mai registrato/condiviso) → Checkout Stripe test-mode completato una sola volta (`cs_test_a15jnXeM0ql2POBYCWPtjQLrUopbUd7K71aOU9F6jvqtIClXHHvGSMvtxq`, redirect app riuscito) → evento naturale `evt_1U1p9GFOUoE38beBvxBWm69d` (`checkout.session.completed`, Workbench Consegnato, HTTP 200) → `billing_events` (una riga; provider `stripe`; `tenant_id` sul demo dedicato; `processed_at` NOT NULL; `processing_error` NULL) → `tenant_billing_customers` (una sola riga demo; customer `cus_V1suEl84dwLFCe`). Isolamento: correlazione Stripe del tenant personale attivo invariata; tenant personale storico senza nuova correlazione. Fixture failed diagnostica precedente `evt_1U1o48FOUoE38beB2KuEcYKQ` (`stripe trigger`, fixture default non rappresentativa, `mode=payment`, `customer=NULL`, webhook HTTP 502 fail-closed, `billing_events` incompleto con `processed_at` NULL, nessuna correlazione demo, nessun effetto collaterale sui tenant personali; non rispedita/ripulita in T1C; eventuali retry Stripe automatici restano separati dal path positivo — **non** bug applicativo; resend controllato successivo in T1E). I4.3A-T1C-F1: ricognizione zero-trigger → percorso reale `create-checkout-session` invece di seconda fixture sintetica. Nessun file applicativo modificato in F1/T1C; nessun deploy/migration/secret/resend/cleanup; Stripe live mai usato. I4.3B non avviato (`tenant_subscriptions` demo = 0; demo `plan_code` = `demo`; demo `subscription_status` = `active`; nessuna sync subscription né snapshot commerciale) |
| **I4.3A-T1C-bis** | Commit `2c0c060` — *docs(context): record checkout correlation runtime pass* |
| **I4.3A-T1D — idempotenza su evento già processato** | **PASS** (sandbox/test-mode). Un solo Resend Workbench effettuato personalmente dall’utente sullo stesso event ID già processato `evt_1U1p9GFOUoE38beBvxBWm69d` (`checkout.session.completed`); stessa `stripe-webhook`; HTTP 200; nessun secondo resend; nessun nuovo checkout/trigger. Ramo applicativo: `ensureBillingEventRow` → riga `billing_events` esistente → `processed_at !== null` → return immediato `receivedOk` → nessuna riesecuzione di `processCheckoutSessionCompleted` → nessuna nuova correlazione customer → nessuna modifica tenant/subscription. Before/after: `billing_events` count 1→1 (id/provider/`provider_event_id`/`event_type`/`tenant_id`/`processed_at`/`created_at`/fingerprint invariati; `processing_error` NULL→NULL); `tenant_billing_customers` count 1→1 (mapping e timestamp invariati); `tenant_subscriptions` 0→0; snapshot demo invariato (`plan_code=demo`, `subscription_status=active`, `is_demo=true`, `trial_ends_at=NULL`); fingerprint non-target invariati. Lacuna probatoria minore: il nuovo delivery attempt non è stato serializzato direttamente dalla UI Workbench nel report; HTTP 200 osservato nei log Edge Function, coerente con l’unico resend utente e con le invarianti SQL — Supervisor: T1D PASS. Nessuna modifica repository; nessun deploy/migration/secret/cleanup; I4.3B non avviato |
| **I4.3A-T1D-bis** | Commit `87d410c` — *docs(context): record webhook idempotency runtime pass* |
| **I4.3A-T1E — retry runtime di billing_event incompleto** | **PASS** (sandbox/test-mode). Target: `evt_1U1o48FOUoE38beB2KuEcYKQ` (`checkout.session.completed`; fixture diagnostica storica non rappresentativa: `mode=payment`, `customer=NULL`, `billing_event` incompleto; prima delivery HTTP 502 fail-closed; non bug applicativo). Sequenza: **T1EA** ricognizione statica locale (evento già presente + `processed_at=NULL` → recupero riga esistente; `processed_at=NULL` non attiva no-op T1D; processing prosegue; fallisce su customer mancante; `session.mode` non è gate; HTTP 502 atteso; `processed_at`/`tenant_id` restano NULL; correlazione/subscription/tenants non toccati; unica mutazione prevista = `processing_error`; zero accesso remoto/Stripe; zero-diff) → **T1EB** baseline SQL remota read-only pre-resend (`target_event_count=1`; `processed_at`/`tenant_id` NULL; `processing_error` non-NULL length 54 fingerprint `af24fa91a17a58a4`; `checkout_mode=payment`; `customer=NULL`; payload fingerprint `a31b92ca81bb6a77`; `tenant_billing_customers` count 2 / distinct tenants 2 / fingerprint `262cdc77bd94942c`; `tenant_subscriptions` 0 / fingerprint `d41d8cd98f00b204`; `tenants` count 3 / demo 1 / commercial fingerprint `0de87c9da37af418`; nessuna mutation) → **T1EC** Workbench read-only/manuale (utente): stesso event ID; stessa `stripe-webhook`; un solo delivery attempt osservabile; HTTP 502 ERR; nessun retry automatico aggiuntivo/pending osservabile; **CASO 2**; nessun resend in T1EC → **T1ED** un solo Resend Workbench utente (Cursor non ha usato Stripe) + verifica post SQL read-only: tutte le invarianti DB identiche (count 1→1; `processed_at`/`tenant_id` NULL→NULL; `processing_error` coerente length/fingerprint; payload/`checkout_mode`/`customer` invariati; `tenant_billing_customers`/`tenant_subscriptions`/snapshot commerciale `tenants` invariati). Log post-resend: due nuovi POST HTTP 502 sulla `stripe-webhook` (~18s); log senza event ID → non attribuibili entrambi con certezza allo stesso evento; Supervisor: lacuna minore non bloccante (resend confermato; almeno un 502 temporalmente coerente; invarianti DB intatte; **nessun ulteriore resend**). Nessun cleanup/manual DB mutation; I4.3B non avviato |
| **I4.3A-T1E-bis** | Commit `8615cda` — *docs(context): record incomplete webhook retry runtime pass* |
| **I4.3A-T1F — conflitto customer–tenant** | **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (Supervisor). **Non** runtime PASS: nessun test runtime del conflitto eseguito; runtime non necessario (decisione Supervisor); scenario classificato **CASO 3**. Evidenze statiche: conflict path deterministico e fail-closed; mapping Stripe customer già associato al tenant A non viene sovrascritto/rimappato verso tenant B; detection prima di qualsiasi INSERT/UPDATE su `tenant_billing_customers`; `billing_events` creata/recuperata e può avere `tenant_id`=B prima della detection; `processed_at` resta NULL; `processing_error` valorizzato; `tenant_billing_customers` invariata (nessun INSERT/UPDATE/remap); `tenant_subscriptions` e `tenants` non modificati; retry dello stesso event ID resta sulla stessa riga e fallisce nuovamente senza remap; HTTP 502; il normale `create-checkout-session` non riutilizza un customer Stripe esistente (provocare il conflitto reale richiederebbe evento craftato / manipolazione preparatoria / configurazione artificiale — valore probatorio aggiuntivo non giustifica inquinamento dati/rischio operativo). Debito minore (non vulnerabilità/leak PII): messaggio pubblico del conflitto usa terminologia tecnica interna. I4.3B non avviato |
| **I4.3A-T1F-bis** | Commit `d4a2889` — *docs(context): record customer tenant conflict static closure* |
| **I4.3A-T1G — race condition webhook** | **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (Supervisor). **Non** runtime PASS: nessun runtime race test eseguito; runtime non necessario (decisione Supervisor); classificazione **CASO 3**. Conclusioni T1GA: una sola `billing_events` per provider/`provider_event_id` garantita dal DB (UNIQUE); `tenant_id` non rimappato dal codice corrente; customer Stripe non rimappabile tra tenant grazie a DB + codice; un customer per tenant/provider protetto dal DB; `processed_at` valorizzato dal codice solo dopo gli effetti applicativi richiesti; failure concorrente non può riscrivere `processing_error` dopo `processed_at` (`recordProcessingError` opera con `processed_at IS NULL` + readback); `markBillingEventProcessed` imposta `processed_at` e azzera `processing_error`; retry converge grazie a idempotenza, conditional update e readback; race possono produrre risposte HTTP temporaneamente differenti; possono esistere stati parziali multi-query ritentabili; nessuno stato permanente incoerente individuato. Un doppio resend non dimostrerebbe vera concorrenza; un runtime race affidabile richiederebbe harness/timing/instrumentation artificiale con valore probatorio insufficiente. Guardrail architetturale residuo (non bug corrente): I2 tenant binding immutabile, I5 `processed_at` come commit marker, I6 protezione da failure concorrente dipendono dal codice privilegiato/server-side e non da CHECK/constraint DB completi — da preservare nelle evoluzioni server-side. I4.3B non avviato |
| **I4.3A-T1G-bis** | Commit `30da6a5` — *docs(context): record webhook race static closure* |
| **I4.3A-T1 — chiusura complessiva** | **CHIUSO COMPLESSIVAMENTE** con evidenza mista: T1A–T1E = runtime PASS; T1F = chiusura statica; T1G = chiusura statica. **Non** dichiarare «I4.3A-T1 runtime PASS» nel complesso. Nessun residuo I4.3A-T1 |
| **I4.3BA — ricognizione architetturale subscription sync** | **Completata** (zero-code). Nessuna modifica repository; nessun runtime Stripe/Supabase; nessuna migration; nessun deploy. Conclusioni Supervisor approvate: eventi `customer.subscription.*` / `invoice.*` allowlist persistiti in `billing_events` ma deferred (no `tenant_id`, `processed_at` NULL, no handler business, no `tenant_subscriptions`/snapshot; HTTP 200 deferred); `checkout.session.completed` resta ramo I4.3A. Schema `tenant_subscriptions`: UNIQUE(`provider`,`provider_subscription_id`); **nessun** UNIQUE(`tenant_id`,`provider`) → più subscription per tenant/provider ammesse; status dettagliati Stripe; snapshot `tenants` vocabolario più ristretto; **nessun** watermark/`last_provider_event_*` nello schema attuale; `updated_at` senza trigger dedicato. Risoluzione tenant primaria: `subscription.customer` → `provider_customer_id` → `tenant_billing_customers` → `tenant_id`; metadata `tenant_id` solo cross-check futuro, non trust boundary autonomo; mapping assente/incoerente/conflict → fail-closed. Plan vocabulary: `pro_monthly` = codice prodotto/prezzo checkout; `paid` = tier commerciale interno; non intercambiabili; non scrivere `pro_monthly` nei campi DB a vocabolario interno. Rischio **out-of-order / stale overwrite concreto**: idempotenza `billing_events` deduplica lo stesso `provider_event_id` ma **non** ordina eventi distinti. Classificazione schema **M2** (quasi sufficiente; serve hardening additivo freshness/order **prima** del wiring completo). La forma migration watermark iniziale proposta in BA è stata **superseded** dalle decisioni I4.3BB/R/F1–F3 (vedi sotto). **D5 bloccante**. `processed_at` resta commit marker I4.3A. Invoice fuori scope primo I4.3B. I4.3B **NON IMPLEMENTATO** |
| **I4.3BA-bis** | Commit `436d587` — *docs(context): record subscription sync architecture findings*. Sync repository → mirror post-commit completata: dry-run OK; apply OK; verifica byte/hash OK su **15 file**; cloud mirror successivamente verificato da ChatGPT; nessuna sync inversa; nessun `--delete`; nessuna modifica repository durante la sync |
| **I4.3BB — ricognizione/decisione anti-stale** | **Completata** (ZERO-CODE / ZERO-DIFF). Nessuna modifica repository; nessuna migration; nessun runtime Stripe/Supabase; nessun deploy. Conclusioni: (1) Event payload e provider state sono concetti distinti; (2) `event.created` = timestamp dell’Event, utilizzabile come admission watermark per-subscription, **NON** versione nativa dello snapshot Subscription re-fetched; (3) `event.id` = identificatore univoco, **NON** clock cronologico, **NON** ordinare lessicograficamente per freshness; (4) strategia anti-stale scelta: **provider re-fetch + admission watermark + CAS/readback/re-fetch**; (5) il solo provider re-fetch **non** elimina le race concorrenti; (6) Event stale non deve sovrascrivere stato più recente; (7) Provider API temporaneamente indisponibile → nessun fallback al payload webhook; failure ritentabile; `processed_at` resta NULL; HTTP candidato 502; `processing_error` sanitizzato; (8) `customer.subscription.deleted`: retrieve post-cancel supportato; non è più capacità fondamentale da validare prima del design; restano failure transient/ownership/CAS. Decisioni prodotto D3/D4/D5/D7/unpaid restano aperte |
| **I4.3BB-R — correzione K2** | **Completata** (ZERO-CODE). Classificazione **K2**: provider re-fetch + Event watermark è corretto **solo** con CAS sull’osservazione W0, conditional update, readback, nuovo provider re-fetch dopo CAS failure se l’Event resta candidato, retry locale limitato, fail/retry se contention non converge. **W_sub** = (`last_applied_provider_event_created_at`, `last_applied_provider_event_id`). Semantica: `last_applied_provider_event_created_at` = admission watermark dell’Event applicato (**NON** versione/freshness dello stato Stripe re-fetched); `last_applied_provider_event_id` = identificatore dell’ultimo Event applicato e CAS token locale (**NON** clock cronologico). Equal timestamp: stesso ts + stesso event id → distinguere billing_event completed da partial retry; stesso ts + event id diverso → re-fetch provider, CAS sulla coppia W osservata, CAS failure → readback, non riusare snapshot provider vecchio, nuovo re-fetch se ancora candidato. **NON** registrare `event.id` come tie-break cronologico |
| **I4.3BB-R-F1 — partial retry** | **Completata** (ZERO-CODE). Invariante: `billing_events.processed_at` = **UNICO** commit marker dell’intero processing applicativo dell’Event; W_sub = prova esclusivamente dello stato dell’effetto per-subscription. Quindi W_sub == Event corrente **AND** `processed_at IS NULL` **NON** significa completed: significa subscription effect già applicato, downstream effects ancora da completare. Retry: non riscrivere ciecamente la subscription; rileggere/riclassificare W_sub; recompute snapshot dal set locale corrente; completare effetti downstream; solo dopo successo impostare `processed_at`. Se snapshot o mark falliscono: `processed_at` resta NULL; failure ritentabile; HTTP candidato 502. **ROW_ABSENT** ≠ **ROW_PRESENT con W NULL/NULL**. ROW_ABSENT: provider re-fetch → INSERT `tenant_subscriptions`; UNIQUE(`provider`,`provider_subscription_id`) gestisce race; **23505 non è automaticamente fatal** → re-lookup, tenant ownership check, riclassificazione W, eventuale CAS/re-fetch. Se re-lookup mostra tenant diverso: **FAIL-CLOSED**; nessun remap `tenant_id`; `processed_at` NULL; `processing_error` sanitizzato; HTTP candidato 502 |
| **I4.3BB-R-F2 — race snapshot cross-subscription** | **Completata** (ZERO-CODE). Il semplice «read tutte `tenant_subscriptions` → derive Snapshot(S) → UPDATE `tenants`» è **INSUFFICIENTE** sotto concorrenza: due handler su subscription diverse possono leggere generazioni differenti del set e invertire l’ordine delle snapshot write, lasciando uno snapshot tenant stale. Il CAS W_sub protegge la singola subscription ma **NON** lo snapshot aggregato cross-subscription. F2 individuò correttamente la necessità di una revision tenant-side; la **prima proposta F2** (revision incrementata dallo snapshot writer) era **INCOMPLETA** ed è **superseded** da F3. Non usare F2 come design corrente della revision |
| **I4.3BB-R-F3 — design tecnico approvato (R2 / A2)** | **Completata** (ZERO-CODE). Classificazione finale **R2**; **M2** resta classificazione schema. Semantica approvata: `tenants.billing_state_revision` = generazione **LOCALE** monotona del SET `tenant_subscriptions` del tenant — **NON** event watermark, **NON** Stripe timestamp, **NON** snapshot-write counter, **NON** provider ordering token. La revision deve avanzare **atomicamente** con le mutation committed di `tenant_subscriptions`. Soluzione architetturale approvata **G1**: trigger DB locale + K2 mantenuto nella Edge Function (accoppiamento atomico mutation+bump nella stessa transazione PostgreSQL; preferito a RPC ampia). **Regola bump conservativa**: ogni INSERT/UPDATE/DELETE committed su `tenant_subscriptions` fa avanzare `billing_state_revision` del tenant interessato (D3/D5/D7 non congelate → non lista fragile di colonne business-relevant; UPDATE no-op può produrre bump extra: inefficiente ma corretto). Ownership `tenant_id` immutabile/fail-closed; trigger futuro da progettare correttamente rispetto a OLD/NEW se mutazione `tenant_id` fosse tecnicamente possibile. **Snapshot CAS H2**: lo snapshot write **NON** incrementa `billing_state_revision`. Flusso: (1) read revision = expected; (2) read `tenant_subscriptions` del tenant; (3) derive Snapshot(S); (4) UPDATE `tenants` snapshot WHERE tenant id AND `billing_state_revision = expected` (+ predicate D4); (5) CAS 0 row → readback/recompute/retry limitato; (6) solo dopo snapshot CAS accettato → mark `billing_event` processed. Double-read della revision: **non obbligatorio** (eventuale fail-fast; CAS finale = correctness boundary). **NON** introdurre ora `billing_snapshot_revision`. Forma M2 architetturale candidata (NON implementata): colonne W_sub su `tenant_subscriptions` (bigint NULL + text NULL); `tenants.billing_state_revision bigint NOT NULL DEFAULT 0`; funzione trigger locale + trigger sulle mutation. Migration futura additiva da `007_*`; nessun backfill remoto automatico; righe esistenti: revision default 0; W_sub nullable. **SECURITY DEFINER NON congelato** come requisito: security mode da verificare in migration; preferire least privilege; DEFINER solo se tecnicamente necessario (search_path fisso, privilegi minimi, review RLS). **Guardrail determinismo**: H2 presuppone Snapshot(S) deterministica rispetto agli input DB catturati/protetti; non dipendere da ordering Event, `event.id`, wall-clock, input esterno non versionato. **D4 technical guard**: `billing_state_revision` non protegge automaticamente `is_demo` / `plan_code` internal/demo / altri flag esterni al set subscription → snapshot CAS deve includere predicate/readback fail-closed; nessuna seconda revision per D4; `is_demo` **NON** scritto automaticamente dal billing webhook. I4.3B **NON IMPLEMENTATO** |

### In corso / incompleto

| Voce | Dettaglio |
|------|-----------|
| **I4.3A-T1 (test post-deploy)** | **CHIUSO COMPLESSIVAMENTE** — evidenza mista: T1A–T1E runtime PASS; T1F e T1G **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (non runtime PASS). Nessun residuo I4.3A-T1. **Non** dichiarare «I4.3A-T1 runtime PASS» nel complesso |
| **I4.3BA / I4.3BA-bis** | **Completate** — ricognizione + consolidamento documentale in `436d587`; sync mirror post-commit OK |
| **I4.3BB / I4.3BB-R / F1–F3** | **Completate** (ZERO-CODE) — architettura anti-stale K2 + snapshot R2/A2 approvata Supervisor; forma M2 candidata architetturale; **nessuna** implementazione |
| **I4.3BC (prossimo)** | Decisione prodotto **zero-code** pre-implementazione: chiudere **D3 / D4 / D5 / D7 / unpaid** (priorità **D5** bloccante); verificare che le policy rispettino il guardrail Snapshot(S) deterministica. **NON** avviare migration M2, I4.3B1 mapper, webhook wiring, deploy o runtime test |
| **I4.3B (separato)** | Sync `customer.subscription.*` → `tenant_subscriptions` + snapshot `tenants` — **NON IMPLEMENTATO**. Non esiste ancora: migration M2, trigger, mapper, subscription persistence, snapshot derivation, wiring `customer.subscription.*`, runtime test I4.3B, deploy I4.3B. Forma M2 architetturale candidata approvata (W_sub + `billing_state_revision` + trigger mutation→revision); SQL/migration **non** creati. Decisioni aperte: D3/D4/D5/D7/unpaid (**D5 bloccante**). Invoice fuori scope del primo I4.3B |
| **Sync subscription** | Eventi `customer.subscription.*` / invoice: **solo persistiti** in `billing_events` con `processed_at` nullo; **non** risolvono `tenant_id`; **non** eseguono handler business; **non** aggiornano `tenant_subscriptions` né lo snapshot su `tenants`; rispondono HTTP 200 deferred. Architettura anti-stale/snapshot progettata (K2+R2) ma **non** wired. Watermark per-subscription (W_sub) e snapshot CAS cross-subscription (`billing_state_revision`) = problemi collegati ma distinti |
| **Billing portal** | `create-billing-portal-session` → ancora `501 Not Implemented` |
| **Frontend checkout** | UI mostra “Gestione abbonamento in arrivo”; **non** invoca l’Edge Function |
| **Feature gating** | Non implementato |
| **Tenant switcher / inviti** | Non implementati da UI |
| **Smoke test post-H4** | Checklist produzione da chiudere manualmente se non già fatto |
| **Staging dedicato** | Spesso assente: lavoro fatto su produzione con cautela |
| **Docs drift** | Drift storico **ancora presente e non corretto** in questo task: `docs/production-readiness.md` e `docs/billing-data-model.md` (§16 descrive ancora I4.0 “senza mutazioni DB”; I4.1/I4.2/I4.3A le hanno introdotte/estese). Fuori scope di I4.3BB-bis — allineare in fase documentale dedicata |
| **Prerequisiti / limiti operativi mirror** | Config locale necessaria per ogni clone/macchina; apply bloccato da qualsiasi modifica o file untracked (fail-closed); Google Drive Desktop può richiedere tempo per propagare al cloud; lo script è versionato nel repo ma **non** fa parte del perimetro mirror docs/rules |
| **Debito operativo `processed_at=NULL`** | Oggi significa sia deferred intenzionale sia evento incompleto — da affrontare separatamente; non in I4.3BB-bis |

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
27. **I4.3A-T1-bis** — aggiornamento stato operativo dopo T1A/T1B, consolidato in `b4da681`
28. **I4.3A-T1C** — test runtime positivo correlazione `checkout.session.completed` (PASS): percorso reale `create-checkout-session` → Checkout test-mode → webhook → `billing_events` → `tenant_billing_customers`; fixture failed diagnostica distinta; I4.3B non avviato
29. **I4.3A-T1C-bis** — aggiornamento stato operativo dopo T1C, consolidato in `2c0c060`
30. **I4.3A-T1D** — test runtime idempotenza su evento già processato (PASS): un solo Resend Workbench di `evt_1U1p9GFOUoE38beBvxBWm69d`; HTTP 200; invarianti DB/customer/tenant; I4.3B non avviato
31. **I4.3A-T1D-bis** — aggiornamento stato operativo dopo T1D, consolidato in `87d410c`
32. **I4.3A-T1E** — test runtime retry di billing_event incompleto (PASS): target `evt_1U1o48FOUoE38beB2KuEcYKQ`; T1EA–T1ED; un solo resend Workbench; fail-closed HTTP 502; invarianti DB; lacuna minore due POST 502 senza event ID; I4.3B non avviato
33. **I4.3A-T1E-bis** — aggiornamento stato operativo dopo T1E, consolidato in `8615cda`
34. **I4.3A-T1F** — conflitto customer–tenant **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (non runtime PASS; CASO 3; nessun runtime conflict eseguito); I4.3B non avviato
35. **I4.3A-T1F-bis** — aggiornamento stato operativo dopo T1F, consolidato in `d4a2889`
36. **I4.3A-T1G** — race condition webhook **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (non runtime PASS; CASO 3; nessun runtime race eseguito; runtime non necessario); I4.3A-T1 **CHIUSO COMPLESSIVAMENTE** (evidenza mista); I4.3B non avviato
37. **I4.3A-T1G-bis** — aggiornamento stato operativo dopo T1G, consolidato in `30da6a5`
38. **I4.3BA** — ricognizione architetturale zero-code su subscription sync: stato deferred eventi; schema `tenant_subscriptions`; risoluzione tenant; plan vocabulary; rischio out-of-order concreto; classificazione **M2**; decisioni D3/D4/D5/D7 aperte (D5 bloccante). Nessuna modifica repository; I4.3B **NON IMPLEMENTATO**
39. **I4.3BA-bis** — aggiornamento stato operativo dopo I4.3BA, consolidato in `436d587` — *docs(context): record subscription sync architecture findings*; sync mirror post-commit (dry-run/apply/byte-hash OK su 15 file; cloud mirror verificato da ChatGPT)
40. **I4.3BB** — ricognizione/decisione anti-stale ZERO-CODE: Event payload ≠ provider state; `event.created` admission watermark; `event.id` non clock; strategia provider re-fetch + watermark + CAS; no fallback payload su API down; deleted retrieve supportato
41. **I4.3BB-R** — correzione **K2** (CAS/readback/re-fetch obbligatori su W_sub); equal-timestamp senza tie-break cronologico su `event.id`
42. **I4.3BB-R-F1** — partial retry: `processed_at` unico commit marker Event; W_sub prova effetto per-subscription; ROW_ABSENT/INSERT/23505/ownership fail-closed
43. **I4.3BB-R-F2** — race snapshot cross-subscription individuata; proposta revision-on-snapshot **INCOMPLETA** (superseded da F3)
44. **I4.3BB-R-F3** — design tecnico approvato **R2/A2**: `billing_state_revision` monotona locale; trigger G1 mutation→revision obbligatorio; snapshot CAS H2 senza bump; forma M2 candidata; SECURITY DEFINER non congelato; determinismo Snapshot(S); D4 technical predicate

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

### Punto di ripresa: I4.3BC (decisione prodotto zero-code)

**I4.3A applicativo:** completato e consolidato in `18a4bf9`.

**I4.3A-D1:** deploy amministrativamente verificato — Edge Function `stripe-webhook` remota versione **4** su project ref `dormvfiwgzyzslxybetb` (da v3; `ACTIVE`; function ID invariato; comando nominativo eseguito una sola volta con exit code 0). Nessuna modifica locale durante D1. Nessun secret ruotato; nessuna altra funzione/DB/frontend toccati. Documentato in I4.3A-D1-bis (`751852b`).

**I4.3A-T1 complessivo:** **CHIUSO COMPLESSIVAMENTE** con evidenza mista. T1A–T1E = runtime PASS; T1F = chiusura statica; T1G = chiusura statica. **Non** dichiarare «I4.3A-T1 runtime PASS» nel complesso. **Nessun residuo** I4.3A-T1. I4.3A-T1G-bis consolidato in `30da6a5` — *docs(context): record webhook race static closure*.

**I4.3BA:** **completata** — ricognizione architetturale **zero-code**. I4.3BA-bis consolidato in `436d587` — *docs(context): record subscription sync architecture findings*; sync mirror post-commit: dry-run OK, apply OK, verifica byte/hash OK su 15 file; cloud mirror verificato da ChatGPT; nessuna sync inversa; nessun `--delete`.

**I4.3BB / I4.3BB-R / F1–F3:** **completati** (ZERO-CODE / ZERO-DIFF). Nessuna modifica repository; nessuna migration; nessun runtime; nessun deploy. Sintesi decisioni Supervisor approvate:

- **Anti-stale (I4.3BB + K2):** Event payload ≠ provider state; `event.created` = admission watermark per-subscription (non versione Subscription); `event.id` = id univoco (**non** clock; **non** ordinare lessicograficamente); strategia = provider re-fetch + admission watermark + CAS/readback/re-fetch; re-fetch da solo non elimina race; Event stale non sovrascrive; API Stripe down → no fallback payload webhook, `processed_at` NULL, HTTP 502 candidato; `customer.subscription.deleted` retrieve post-cancel supportato.
- **W_sub:** (`last_applied_provider_event_created_at`, `last_applied_provider_event_id`) — watermark di admission + CAS token; **non** freshness Stripe; **non** clock.
- **Partial retry (F1):** `processed_at` = unico commit marker Event; W_sub = prova effetto per-subscription; W_sub==Event AND `processed_at` NULL = partial (non completed); ROW_ABSENT ≠ ROW_PRESENT W NULL; INSERT + 23505 → re-lookup/ownership/riclassificazione; tenant diverso → fail-closed no remap.
- **Snapshot race (F2→F3):** read-all→derive→UPDATE insufficiente sotto concorrenza; CAS W_sub non protegge aggregato cross-sub; proposta F2 revision-on-snapshot writer = **superseded**.
- **R2 / A2 (F3):** `tenants.billing_state_revision` = generazione locale monotona del SET `tenant_subscriptions`; bump atomico via **trigger G1** su ogni INSERT/UPDATE/DELETE committed; K2 resta in Edge Function; snapshot CAS **H2** non incrementa revision; double-read non obbligatorio; `billing_snapshot_revision` non richiesta; forma M2 candidata (colonne W_sub + revision + trigger) **non implementata**; SECURITY DEFINER **non** congelato; Snapshot(S) deve essere deterministica sui dati catturati/protetti; D4 richiede predicate/readback (`is_demo` non scritto dal webhook).

**Decisioni prodotto ancora aperte** (non inventare risposta; non cristallizzare D1/D2 o mapper finché non chiuse):

| ID | Tema | Note |
|----|------|------|
| **D3** | Semantica `canceled` / `incomplete_expired` e piano risultante | Aperta |
| **D4** | Demo/internal: registrazione subscription sì/no e preservazione snapshot | Aperta; vincolo tecnico: predicate CAS + `is_demo` non auto-scritto |
| **D5** | Subscription corrente / winner cross-subscription | **BLOCCANTE** per wiring snapshot |
| **D7** | `trialing` e relazione `plan_code`/`status` | Aperta |
| **unpaid** | Mapping tenant snapshot / entitlement | Aperta |

**I4.3B:** **NON IMPLEMENTATO**. Non esiste ancora: migration M2; trigger; mapper; subscription persistence; snapshot derivation; wiring `customer.subscription.*`; runtime test I4.3B; deploy I4.3B. Invoice fuori scope del primo I4.3B.

**Prossimo punto di ripresa: I4.3BC** — decisione prodotto **zero-code** pre-implementazione:

- chiudere **D3 / D4 / D5 / D7 / unpaid** con particolare priorità a **D5**;
- verificare che le policy scelte rispettino il guardrail **Snapshot(S) deterministica** sui dati catturati/protetti dal CAS;
- **senza** implementazione, migration, mapper, webhook wiring, deploy o runtime.

Dopo I4.3BC e relativo consolidamento se necessario, il Supervisor potrà autorizzare il primo task schema M2. **NON** impostare come prossimo: I4.3B1 mapper; migration `007`; webhook wiring; deploy; runtime test.

Vincoli permanenti da mantenere:

- Stripe esclusivamente in **test mode**
- Billing **tenant-first**
- Secrets e `service_role` esclusivamente **server-side**; nessun secret in `VITE_*`
- `billing_events` **non** leggibile direttamente dal frontend; nessuna scrittura billing privilegiata dal frontend
- Nessun avvio della sincronizzazione `tenant_subscriptions` o snapshot `tenants` senza task esplicito post-I4.3BC + approvazione schema
- Protezione `is_demo` / `plan_code=demo|internal` da sovrascritture commerciali automatiche (fail-closed)
- Nessun uso di Stripe **live**
- Nessuna modifica della baseline `supabase/migrations/000_baseline_current_schema.sql`
- Future migration soltanto **additive** da `007_*` o timestamp equivalente — **non** creare migration finché non autorizzata post-I4.3BC
- Nessun `supabase db push`

### Dopo I4.3BC: I4.3B (fase separata, non implementata)

**I4.3B — subscription sync e tenant snapshot** (solo dopo decisioni I4.3BC e task schema M2 autorizzato)

Punti ancora da progettare e implementare (non trasformare in implementazione ora):

- Eventi `customer.subscription.created|updated|deleted` (oggi solo persistiti, `processed_at` nullo)
- Upsert di `tenant_subscriptions` con protezione K2 / W_sub
- Trigger + `billing_state_revision` (G1) e snapshot CAS H2
- Mapping del prodotto Stripe `pro_monthly` verso il piano interno `paid`
- Mapping esplicito degli stati Stripe verso `tenants.subscription_status`
- Regola subscription corrente / snapshot quando esistono più righe (D5)
- Protezione dei tenant `demo` e `internal` (D4)
- Gestione di `trial_ends_at` e semantica trialing (D7)
- Piano interno dopo canceled / incomplete_expired (D3)
- Mapping `unpaid`
- Eventi invoice inizialmente fuori scope, salvo decisione esplicita

### Altri passi (dopo I4.3B o in parallelo se priorità diversa)

1. **I5** — implementare `create-billing-portal-session` (authz già presente).
2. **UI** — CTA checkout/portal solo per ruolo `admin`/`billing`, chiamando le EF (senza secret client).
3. **Doc sync** — aggiornare `docs/billing-data-model.md` e `docs/production-readiness.md` (drift storico ancora aperto) e sezione “prossimi passi” di `docs/saas-refactor-plan.md` allo stato post-I4.3.
4. **Prodotto SaaS non-billing**: tenant switcher, inviti, test RLS cross-tenant (`docs/saas-rls-test-plan.md`).
5. **Debito operativo** — distinguere semanticamente `processed_at=NULL` deferred vs incompleto (separato da I4.3B).

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
| Idempotenza / retry / conflitti / race | Idempotenza su evento già processato verificata in T1D (PASS); retry incompleto verificato in T1E (PASS); conflitto customer–tenant chiuso su evidenza statica in T1F (CASO 3; non runtime PASS); race webhook chiuse su evidenza statica in T1G (CASO 3; non runtime PASS); I4.3A-T1 **CHIUSO COMPLESSIVAMENTE** (evidenza mista; nessun residuo) |
| I4.3B | **Non avviato** |

### I4.3A-T1C (correlazione positiva `checkout.session.completed`)

Registrati dal report operativo T1C e dalle verifiche manuali utente (create-checkout-session reale + Checkout + Workbench + SQL Editor):

| Gate | Esito |
|------|--------|
| Percorso | `create-checkout-session` reale → Checkout Stripe test-mode → `checkout.session.completed` naturale → `stripe-webhook` → `billing_events` → `tenant_billing_customers` |
| `create-checkout-session` | HTTP 200; account tenant demo dedicato; membership admin già verificata; `plan_code` richiesto `pro_monthly`; JWT solo manuale utente (mai registrato/condiviso); nessun secret nel repository |
| Checkout Session | `cs_test_a15jnXeM0ql2POBYCWPtjQLrUopbUd7K71aOU9F6jvqtIClXHHvGSMvtxq` — test-mode; completata una sola volta; redirect app riuscito |
| Evento positivo | `evt_1U1p9GFOUoE38beBvxBWm69d` — `checkout.session.completed`; Workbench Consegnato; HTTP 200 |
| `billing_events` (positivo) | Una sola riga; provider `stripe`; `tenant_id` sul demo dedicato; `processed_at` NOT NULL; `processing_error` NULL |
| Customer / correlazione | `cus_V1suEl84dwLFCe` — una sola `tenant_billing_customers` sul demo; nuovo customer correlato a un solo tenant |
| Isolamento | Correlazione Stripe del tenant personale attivo invariata; tenant personale storico senza nuova correlazione |
| Fixture failed diagnostica | `evt_1U1o48FOUoE38beB2KuEcYKQ` — `stripe trigger`; fixture default non rappresentativa; `mode=payment`; `customer=NULL`; webhook HTTP 502 fail-closed; `billing_events` incompleto (`processed_at` NULL); nessuna correlazione demo; nessun effetto collaterale sui tenant personali; non rispedita/ripulita in T1C; retry Stripe automatici separati dal path positivo — **non** bug applicativo; resend controllato successivo in T1E |
| I4.3A-T1C-F1 | Ricognizione zero-trigger → percorso reale `create-checkout-session` invece di seconda fixture sintetica |
| File applicativi / deploy / migration / secret / resend / cleanup / Stripe live | **Nessuno** / **non** eseguiti |
| Demo post-T1C (I4.3B non avviato) | `tenant_subscriptions` = 0; `plan_code` = `demo`; `subscription_status` = `active`; nessuna sync subscription né snapshot commerciale |
| Esito complessivo T1C | **PASS** |
| I4.3B | **Non avviato** |

### I4.3A-T1D (idempotenza su evento già processato)

Registrati dal report operativo T1D e dalle verifiche manuali utente (un solo Resend Workbench + log Edge Function + SQL Editor before/after):

| Gate | Esito |
|------|--------|
| Evento target | `evt_1U1p9GFOUoE38beBvxBWm69d` — `checkout.session.completed`; sandbox/test-mode; già processato in T1C |
| Modalità | **Un solo** Resend Workbench effettuato personalmente dall’utente; stessa `stripe-webhook`; **nessun** secondo resend; nessun nuovo checkout/trigger |
| HTTP post-resend | **200** (osservato nei log Edge Function; coerente con unico resend utente) |
| Ramo applicativo | `ensureBillingEventRow` → riga esistente → `processed_at !== null` → return `receivedOk`; nessuna riesecuzione `processCheckoutSessionCompleted`; nessuna nuova correlazione/modifica tenant |
| `billing_events` before→after | count 1→1; id/provider/`provider_event_id`/`event_type`/`tenant_id`/`processed_at`/`created_at`/fingerprint invariati; `processing_error` NULL→NULL |
| `tenant_billing_customers` | count 1→1; mapping e timestamp invariati |
| `tenant_subscriptions` / snapshot demo | 0→0; `plan_code=demo`, `subscription_status=active`, `is_demo=true`, `trial_ends_at=NULL` invariati |
| Fingerprint non-target | Invariati |
| Lacuna probatoria minore | Attempt non serializzato direttamente dalla UI Workbench nel report; Supervisor: evidenza complessiva sufficiente → **PASS** |
| File / deploy / migration / secret / cleanup | **Nessuna** modifica repository; **non** eseguiti |
| Git finale (task runtime) | Working tree pulita; zero-diff codice |
| `npm run lint` / `npm run build` / `deno check` | **Non necessari** (task runtime zero-diff) |
| Esito complessivo T1D | **PASS** |
| I4.3B | **Non avviato** |

### I4.3A-T1E (retry runtime di billing_event incompleto)

Registrati dal report operativo T1E (T1EA–T1ED) e dalle verifiche manuali utente (Workbench read-only + un solo Resend + SQL Editor before/after + log Edge Function):

| Gate | Esito |
|------|--------|
| Evento target | `evt_1U1o48FOUoE38beB2KuEcYKQ` — `checkout.session.completed`; sandbox/test-mode; fixture diagnostica storica incompleta (`mode=payment`, `customer=NULL`) |
| Sequenza | **T1EA** statico locale → **T1EB** baseline SQL read-only → **T1EC** Workbench read-only/CASO 2 (nessun resend) → **T1ED** un solo Resend Workbench utente + post-check |
| Resend | **Un solo** Resend Workbench effettuato personalmente dall’utente; Cursor senza Stripe/plugin; **nessun** ulteriore resend |
| HTTP | **502** coerente con fail-closed su customer mancante |
| `billing_events` before→after | count 1→1; `processed_at` NULL→NULL; `tenant_id` NULL→NULL; `processing_error` non-NULL→non-NULL (length 54→54; fingerprint `af24fa91a17a58a4`); `checkout_mode=payment`; `customer=NULL`; payload fingerprint `a31b92ca81bb6a77` invariato |
| `tenant_billing_customers` | count 2→2; distinct tenants 2→2; fingerprint `262cdc77bd94942c` invariato |
| `tenant_subscriptions` | count 0→0; fingerprint `d41d8cd98f00b204` invariato |
| `tenants` snapshot commerciale | count 3→3; demo 1→1; commercial fingerprint `0de87c9da37af418` invariato |
| Lacuna minore | Due POST 502 post-resend nei log Edge Function (~18s) senza event ID; non attribuibili entrambi con certezza allo stesso evento; Supervisor: non bloccante |
| Cleanup / mutation DB manuale / deploy / migration / secret | **Non** eseguiti |
| Git / codice | Task runtime zero-diff; working tree pulita |
| `npm run lint` / `npm run build` / `deno check` | **Non necessari** (task runtime zero-code) |
| Esito complessivo T1E | **PASS** |
| I4.3B | **Non avviato** |

### I4.3A-T1F (conflitto customer–tenant — chiusura statica)

Registrati dalla decisione Supervisor su evidenza statica (I4.3A-T1FA / chiusura T1F); **nessun** runtime conflict test:

| Gate | Esito |
|------|--------|
| Modalità | Chiusura su evidenza **statica**; **non** runtime PASS |
| Runtime conflict test | **Non** eseguito; runtime **non** necessario (decisione Supervisor) |
| Classificazione scenario | **CASO 3** |
| Path conflict | Deterministico e fail-closed |
| Mapping customer→tenant | Customer già associato al tenant A **non** sovrascritto/rimappato verso B |
| Detection | Prima di qualsiasi INSERT/UPDATE su `tenant_billing_customers` |
| `billing_events` | Creata/recuperata; `tenant_id` può essere valorizzato con tenant B prima della detection; `processed_at` resta NULL; `processing_error` valorizzato |
| `tenant_billing_customers` | Invariata — nessun INSERT/UPDATE/remap |
| `tenant_subscriptions` / `tenants` | Non modificati |
| Retry stesso event ID | Stessa riga; fallisce nuovamente senza remap; HTTP 502 |
| Checkout normale | `create-checkout-session` non riutilizza un customer Stripe esistente |
| Motivazione no-runtime | Provocare il conflitto reale richiederebbe evento craftato / manipolazione preparatoria / configurazione artificiale; valore probatorio aggiuntivo non giustifica inquinamento dati/rischio operativo |
| Debito minore | Messaggio pubblico del conflitto usa terminologia tecnica interna (non vulnerabilità / non leak PII) |
| File / deploy / migration / secret / Stripe / Workbench / mutation DB | **Nessuno** / **non** eseguiti in T1F |
| Esito complessivo T1F | **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** |
| I4.3B | **Non avviato** |

### I4.3A-T1G (race condition webhook — chiusura statica)

Registrati dalla decisione Supervisor su evidenza statica (I4.3A-T1GA / chiusura T1G); **nessun** runtime race test:

| Gate | Esito |
|------|--------|
| Modalità | Chiusura su evidenza **statica**; **non** runtime PASS |
| Runtime race test | **Non** eseguito; runtime **non** necessario (decisione Supervisor) |
| Classificazione scenario | **CASO 3** |
| Unicità `billing_events` | Una sola riga per provider/`provider_event_id` garantita dal DB (UNIQUE) |
| Tenant binding | `tenant_id` non rimappato dal codice corrente |
| Customer mapping | Customer Stripe non rimappabile tra tenant (DB + codice); un customer per tenant/provider protetto dal DB |
| `processed_at` | Valorizzato dal codice solo dopo gli effetti applicativi richiesti; commit marker applicativo |
| Failure concorrente | `recordProcessingError` non riscrive eventi già completed (`processed_at IS NULL` + readback); `markBillingEventProcessed` imposta `processed_at` e azzera `processing_error` |
| Retry | Converge grazie a idempotenza, conditional update e readback |
| Stati intermedi | Multi-query possono produrre stati parziali ritentabili e risposte HTTP temporaneamente differenti; nessuno stato permanente incoerente individuato |
| Motivazione no-runtime | Un doppio resend non dimostrerebbe vera concorrenza; harness/timing/instrumentation artificiale avrebbe valore probatorio insufficiente |
| Guardrail residuo (non bug) | I2 tenant binding immutabile, I5 `processed_at` commit marker, I6 protezione failure concorrente dipendono dal codice privilegiato/server-side — da preservare nelle evoluzioni server-side |
| File / deploy / migration / secret / Stripe / Workbench / mutation DB | **Nessuno** / **non** eseguiti in T1G |
| Esito complessivo T1G | **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** |
| I4.3A-T1 complessivo | **CHIUSO COMPLESSIVAMENTE** (T1A–T1E runtime PASS; T1F/T1G chiusure statiche; **non** «runtime PASS» nel complesso) |
| I4.3B | **Non avviato** / **NON IMPLEMENTATO** |

### I4.3BA (ricognizione architetturale zero-code)

Registrati dal report I4.3BA (zero-code; nessuna modifica repository) e dalla chiusura documentale I4.3BA-bis (`436d587`):

| Gate | Esito |
|------|--------|
| Modalità | Ricognizione architetturale **zero-code**; **nessuna** implementazione I4.3B |
| Runtime Stripe / Supabase / Workbench | **Non** eseguiti |
| Migration / deploy / secret / RLS / DB mutation | **Non** eseguiti |
| Classificazione schema | **M2** (approvata Supervisor); forma migration iniziale BA **superseded** da I4.3BB/R/F3 |
| Rischio out-of-order / stale overwrite | **Concreto** — strategia anti-stale definita in I4.3BB+ (K2) |
| Decisioni aperte | D3/D4/D5/D7/unpaid; **D5 bloccante** |
| Invoice | Fuori scope primo I4.3B |
| I4.3B | **NON IMPLEMENTATO** |
| Sync mirror post I4.3BA-bis | dry-run OK; apply OK; byte/hash OK su 15 file; cloud mirror verificato ChatGPT |
| `npm run lint` / `npm run build` / `deno check` | **Non necessari** (task documentale/ricognizione) |

### I4.3BB / I4.3BB-R / F1–F3 (architettura anti-stale + snapshot)

Registrati dai report ZERO-CODE / ZERO-DIFF (nessuna modifica repository) e dalla chiusura documentale I4.3BB-bis:

| Gate | Esito |
|------|--------|
| Modalità | Ricognizione/decisione architetturale **zero-code**; **nessuna** implementazione |
| Runtime / migration / deploy / secret | **Non** eseguiti |
| Strategia anti-stale | Provider re-fetch + admission watermark + CAS/readback/re-fetch (**K2**) |
| W_sub | Due colonne; `event.id` **non** clock / **non** tie-break cronologico |
| Partial retry F1 | `processed_at` unico commit marker; ROW_ABSENT/23505/ownership fail-closed |
| Race snapshot F2 | Individuata; design revision-on-snapshot writer **superseded** |
| Design F3 / R2 | `billing_state_revision` A2; trigger G1 obbligatorio; snapshot H2 senza bump; double-read non obbligatorio; `billing_snapshot_revision` non richiesta |
| Forma M2 | Candidata architetturale approvata; SQL/migration **non** creati |
| SECURITY DEFINER | **Non** congelato come requisito |
| Determinismo Snapshot(S) | Guardrail registrato |
| D4 technical guard | Predicate/readback; `is_demo` non auto-scritto |
| Decisioni prodotto | D3/D4/D5/D7/unpaid aperte; **D5 bloccante** |
| I4.3B | **NON IMPLEMENTATO** |
| Prossimo punto | **I4.3BC** zero-code |
| `npm run lint` / `npm run build` / `deno check` | **Non necessari** (task documentale/ricognizione) |

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

### I4.3A / post-deploy / chiusura T1 (evidenza mista)

- Il flusso webhook usa **più query Supabase** e **non** costituisce una singola transazione PostgreSQL; il retry è reso idempotente dalla riga `billing_events` e dalla correlazione non rimappante. **Rischio multi-query non-transazionale ancora aperto** (stati intermedi ritentabili; nessuno stato permanente incoerente individuato in T1G).
- Nota intenzionale fail-closed/tracciabile (T1F): `billing_events` può conservare `tenant_id`=B anche se la correlazione customer fallisce per conflitto con mapping già esistente sul tenant A; `processed_at` resta NULL e `processing_error` è valorizzato — comportamento considerato intenzionalmente fail-closed e tracciabile, non remap silenzioso.
- Debito minore (T1F, senza aprire fix): il messaggio pubblico del conflitto customer–tenant usa terminologia tecnica interna; **non** classificato come vulnerabilità o leak PII.
- Eventi legacy di I4.1/I4.2 già marcati `processed_at` **prima** di una correlazione riuscita **non** vengono riparati automaticamente.
- Conflitti permanenti customer–tenant possono continuare a generare retry finché non vengono diagnosticati; path conflict chiuso su evidenza statica in T1F (CASO 3; nessun runtime conflict eseguito).
- Guardrail code-enforced (T1G, **non** bug corrente): I2 tenant binding immutabile, I5 `processed_at` come commit marker, I6 protezione da failure concorrente dipendono dal codice privilegiato/server-side e non da CHECK/constraint DB completi — da preservare nelle evoluzioni server-side.
- Il codice I4.3A è **deployato** (`stripe-webhook` remota v4). I4.3A-T1 **CHIUSO COMPLESSIVAMENTE** con evidenza mista: T1A–T1E runtime PASS; T1F e T1G **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (non runtime PASS; CASO 3; nessun runtime conflict/race eseguito). **Nessun residuo** I4.3A-T1. **Non** dichiarare «I4.3A-T1 runtime PASS» nel complesso.
- Firma Stripe valida verificata **indirettamente** tramite consegna Workbench HTTP 200 (T1B/T1C) e, per T1D/T1E, tramite log Edge Function sul resend (non tramite firma costruita localmente in T1A).
- La verifica remota di I4.3A-D1 è limitata a **metadati amministrativi** (versione, timestamp, stato `ACTIVE`); **non** è stato eseguito un confronto byte-per-byte del bundle deployato.
- La freschezza server di `origin/main` **non** è stata aggiornata (`git fetch` non eseguito in D1, D1-bis, T1A, T1B, T1C, T1D, T1E, T1F né T1G).
- `deno check` resta da eseguire in un ambiente idoneo (non eseguito in I4.3A né in I4.3A-D1).
- Eventi `customer.subscription.*` / `invoice.*` persistiti con `processed_at` nullo attendono **I4.3B** (**NON IMPLEMENTATO**); T1B ha confermato `tenant_subscriptions` = 0 per la subscription target; T1C/T1D hanno confermato `tenant_subscriptions` demo = 0 e snapshot demo invariato (`plan_code` = `demo`, `subscription_status` = `active`); T1E ha riconfermato `tenant_subscriptions` = 0 e snapshot commerciale `tenants` invariato.
- **I4.3BB+ — architettura anti-stale consolidata (non implementata):** rischio out-of-order/stale overwrite resta concreto finché I4.3B non è wired. Strategia approvata **K2**: provider re-fetch + admission watermark Event (`event.created`) + CAS/readback/re-fetch su **W_sub**; `event.id` **non** è clock né tie-break cronologico. Provider API down → no fallback payload; `processed_at` NULL; HTTP 502 candidato.
- **I4.3BB-R-F1 — partial retry:** `processed_at` è l’unico commit marker dell’Event; W_sub prova solo l’effetto per-subscription. Stati parziali (W_sub aggiornato, `processed_at` NULL) sono ritentabili e non equivalgono a completed. ROW_ABSENT / INSERT / 23505 richiedono re-lookup + ownership fail-closed (nessun remap tenant).
- **I4.3BB-R-F2/F3 — snapshot cross-subscription:** CAS W_sub non protegge lo snapshot aggregato. F2 individuò la race; la proposta «revision incrementata dallo snapshot writer» è **superseded**. Design corrente **R2/A2**: `billing_state_revision` monotona locale del SET, bump atomico via trigger G1 su mutation `tenant_subscriptions`; snapshot CAS H2 **non** incrementa revision. Double-read non obbligatorio. `billing_snapshot_revision` non richiesta. SECURITY DEFINER del trigger **non** congelato.
- **Guardrail determinismo Snapshot(S):** H2 presuppone derivazione deterministica rispetto agli input DB catturati/protetti; non dipendere da ordering Event / `event.id` / wall-clock / input esterno non versionato. Se D3/D5/D7 introducessero dipendenze temporali o esterne, serve invalidazione/reconciliation esplicita.
- **D4 technical guard:** `billing_state_revision` non protegge automaticamente `is_demo` / plan demo|internal / flag esterni al set subscription → predicate/readback fail-closed nel futuro snapshot CAS; `is_demo` non auto-scritto dal webhook.
- **Decisioni prodotto ancora aperte pre-wiring:** D3; D4; **D5 (bloccante)**; D7; unpaid. Forma M2 architetturale candidata approvata ma **non** implementata (nessuna migration/SQL). Invoice fuori scope del primo I4.3B. Debito: `processed_at=NULL` oggi = deferred intenzionale **oppure** incompleto.
- Fixture T1B: eventi non-allowlist sandbox generati dalla fixture restano fuori scope di cleanup in questo ciclo; nessun evento live.
- Fixture failed diagnostica T1C/T1E (`evt_1U1o48FOUoE38beB2KuEcYKQ`): HTTP 502 fail-closed su fixture default non rappresentativa; distinta dal path positivo; non trasformata in bug applicativo; non ripulita manualmente; retry controllato in T1E ha mantenuto fail-closed senza correlazione/subscription.
- Lacuna T1D minore: attempt di delivery non serializzato dalla UI Workbench nel report; HTTP 200 da log Edge Function — non eleva a failure (Supervisor: T1D PASS).
- Lacuna T1E minore: due POST 502 post-resend nei log Edge Function senza event ID — non eleva a failure; nessun ulteriore resend necessario (Supervisor: T1E PASS).
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
- I4.3A-T1-bis consolidato in `b4da681` — *docs(context): record webhook runtime verification*; sync post-commit secondo workflow governance.
- I4.3A-T1C-bis consolidato in `2c0c060` — *docs(context): record checkout correlation runtime pass*; sync post-commit secondo workflow governance.
- I4.3A-T1D-bis consolidato in `87d410c` — *docs(context): record webhook idempotency runtime pass*; sync post-commit secondo workflow governance.
- I4.3A-T1E-bis consolidato in `8615cda` — *docs(context): record incomplete webhook retry runtime pass*; sync post-commit secondo workflow governance.
- I4.3A-T1F-bis consolidato in `d4a2889` — *docs(context): record customer tenant conflict static closure*; sync post-commit secondo workflow governance.
- I4.3A-T1G-bis consolidato in `30da6a5` — *docs(context): record webhook race static closure*; sync post-commit secondo workflow governance.
- I4.3BA-bis consolidato in `436d587` — *docs(context): record subscription sync architecture findings*; sync repository → mirror post-commit completata (dry-run OK; apply OK; verifica byte/hash OK su **15 file**; cloud mirror successivamente verificato da ChatGPT; nessuna sync inversa; nessun `--delete`; nessuna modifica repository durante la sync).
- **Divergenza mirror / Git attesa pre-task I4.3BB-bis:** il mirror Google Drive non contiene ancora I4.3BB-bis. Git reale è la fonte canonica; la differenza è attesa. Nessuna riconciliazione Drive → repository.
- `docs/stato-operativo.md` viene aggiornato da questo task (I4.3BB-bis) e sarà sincronizzato **solo dopo** il relativo commit (e conferma utente secondo workflow governance). Il commit documentale corrente **non** è registrato come ultimo consolidato in questo stesso aggiornamento.
- Nessuna riconciliazione Drive → repository è consentita.

---

## 9. Guardrail non negoziabili

- Tenant-first: ogni operazione dati con `activeTenantId` / `tenant_id` tracciabile.
- RLS sempre on; scritture billing **solo** server-side.
- `billing_events` **non** leggibile dal client (no GRANT SELECT authenticated).
- Baseline `000_*` immutabile per cambi futuri; niente rewrite storia produzione.
- `npm run lint` (= `tsc --noEmit`) e `npm run build` dopo modifiche rilevanti.
- Nessun commit di `.env` / chiavi reali.
- Cursor esegue solo il micro-task assegnato; non anticipa I4.3BC, I4.3B o altre fasi dai “Consigli a ChatGPT”.

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
