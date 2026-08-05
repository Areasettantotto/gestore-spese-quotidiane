# Stato operativo — Gestore Spese Quotidiane

**Data snapshot:** 2026-08-05

| Voce | Valore |
|------|--------|
| Branch atteso | `main` |
| Commit applicativo di riferimento | `1f633fccbeccddd5a1a3182acc4c5bd667513457` — *I4.2 correlate Stripe customers to tenants* |
| Ultimo commit governance/documentale consolidato | `14a8575` — *docs(governance): normalize operational state references* (GOVERNANCE-4-bis) |
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
- Stripe test-mode: checkout Edge Function operativa (create-checkout-session); webhook con firma + persistenza billing_events + correlazione customer→tenant su checkout.session.completed (I4.2).
- Governance operativa (GOVERNANCE-4 / 4-bis / 5-bis): modello Supervisor/Architect (ChatGPT) + Execution Agent/Executor (Cursor); numerazione prompt e workflow `-bis`; mirror Drive documentato in docs/ai-context-mirror.md; consolidamento fonti in 1e83f19; GOVERNANCE-4-bis consolidato in 14a8575 (push/deploy non verificati).
- ANCORA MANCANTE: hardening ciclo elaborazione billing_events (I4.3A); sync subscription → tenant_subscriptions + snapshot tenants (I4.3B); billing portal; UI checkout reale; feature gating piani; tenant switcher/inviti.

Riparti dal prossimo micro-task: I4.3A — hardening del ciclo di elaborazione billing_events e della correlazione tenant/customer. NON avviare I4.3B né sync subscription senza task esplicito.

Chiedimi conferma prima di: deploy Edge Functions, apply migration produzione, db push, live Stripe keys, cambi RLS su expenses.
```

---

## 0. Governance operativa (GOVERNANCE-5-bis)

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

- Documento operativo: [`docs/ai-context-mirror.md`](ai-context-mirror.md).
- Drive = **mirror di consultazione**, non canonico; aggiornato esternamente dall’utente; privo di segreti; da **rileggere** a ogni ripresa.
- Repository / Git verificato prevale sul mirror.

### Fonte canonica e vincoli di processo

- Prima di ogni task, Cursor deve leggere **integralmente** `docs/stato-operativo.md`.
- La regola `.cursor/rules/000-project-context.mdc` include: autorità sullo stato, ciclo micro-fasi, numerazione prompt, gerarchia fonti, mirror Drive (principi), operazioni protette, report finale.
- I consigli in `Consigli a ChatGPT per i prossimi prompt` **non** autorizzano Cursor a implementare autonomamente la fase successiva.
- `README.md` collega la documentazione di sviluppo a `docs/stato-operativo.md` (percorso relativo).

### Stato Git dopo GOVERNANCE-4-bis e working tree GOVERNANCE-5-bis

| Voce | Valore verificato |
|------|-------------------|
| Branch atteso | `main` |
| Commit applicativo di riferimento | `1f633fccbeccddd5a1a3182acc4c5bd667513457` (*I4.2*) |
| Ultimo commit governance/documentale consolidato | `14a8575` — *docs(governance): normalize operational state references* (GOVERNANCE-4-bis) |
| Commit fonti canoniche | `1e83f19` — *docs(governance): consolidate canonical project sources* |
| `.cursor/rules/000-project-context.mdc` | Esteso in GOVERNANCE-5-bis (working tree, in attesa di review/commit) |
| `docs/stato-operativo.md` | Questo snapshot (GOVERNANCE-5-bis) in working tree, in attesa di review/commit |
| `docs/ai-context-mirror.md` | **Nuovo** in GOVERNANCE-5-bis (working tree, in attesa di review/commit) |
| `README.md` | Collegamento a `docs/stato-operativo.md` **versionato** in `1e83f19` (invariato in questo task) |
| Push / deploy | **Non verificati** — non dichiarati eseguiti |

GOVERNANCE-5-bis **non** è dichiarato committato. Il prossimo task applicativo resta **I4.3A**; **I4.3B** resta separato e non avviato. Nessuna sincronizzazione subscription, nessun deploy, nessuna migration, nessuna modifica applicativa in questo task.

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
| Governance operativa (GOVERNANCE-1/2/3-bis/4/`1e83f19`/4-bis/`14a8575`/5-bis) | Modello Supervisor/Executor; numerazione prompt e workflow `-bis`; mirror Drive in `docs/ai-context-mirror.md`; fonti canoniche in `1e83f19`; GOVERNANCE-4-bis consolidato in `14a8575`; GOVERNANCE-5-bis in working tree (non ancora committato) |
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
| Correlazione customer↔tenant (I4.2) | Upsert `tenant_billing_customers` su `checkout.session.completed` |

### In corso / incompleto

| Voce | Dettaglio |
|------|-----------|
| **I4.3A (prossimo)** | Hardening ciclo elaborazione `billing_events` + correlazione tenant/customer — **non completato** |
| **I4.3B (dopo I4.3A)** | Sync subscription → `tenant_subscriptions` + snapshot `tenants` — fase **separata**, non avviata |
| **Sync subscription** | Eventi `customer.subscription.*` / invoice: **non** aggiornano ancora `tenant_subscriptions` né lo snapshot su `tenants` |
| **Billing portal** | `create-billing-portal-session` → ancora `501 Not Implemented` |
| **Frontend checkout** | UI mostra “Gestione abbonamento in arrivo”; **non** invoca l’Edge Function |
| **Deploy webhook** | In sessioni I3.1: checkout deployato; webhook/portal spesso **non** ancora deployati — verificare stato reale su Supabase prima di test end-to-end |
| **Smoke test post-H4** | Checklist produzione da chiudere manualmente se non già fatto |
| **Staging dedicato** | Spesso assente: lavoro fatto su produzione con cautela |
| **Docs drift** | `docs/billing-data-model.md` §16 descrive I4.0 “senza mutazioni DB”; I4.1/I4.2 le hanno introdotte — aggiornare la doc nella prossima fase billing |

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
    stripe-webhook/            # firma + billing_events + tenant_billing_customers
    _shared/auth.ts, http.ts
  snippets/demo/, snippets/drafts/
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
18. **GOVERNANCE-1 / GOVERNANCE-2 / GOVERNANCE-3-bis / GOVERNANCE-4 (`1e83f19`) / GOVERNANCE-4-bis (`14a8575`) / GOVERNANCE-5-bis** — modello operativo Supervisor/Executor; consolidamento fonti in `1e83f19`; normalizzazione stato in `14a8575`; GOVERNANCE-5-bis formalizza numerazione prompt, workflow `-bis`, report Cursor e mirror Drive (`docs/ai-context-mirror.md`) senza anticipare I4.3A/I4.3B

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

### Punto di ripresa applicativo: I4.3A

**I4.3A — hardening del ciclo di elaborazione `billing_events` e della correlazione tenant/customer**

Obiettivi (da implementare in un task dedicato; **non** ancora eseguiti):

- `billing_events.processed_at` deve essere valorizzato **soltanto** dopo il completamento riuscito degli effetti DB previsti.
- In caso di errore: valutare e documentare `processing_error` e il comportamento dei retry.
- `billing_events.tenant_id` deve essere valorizzato quando il tenant viene risolto.
- La correlazione customer Stripe → tenant deve rispettare i vincoli di unicità e **non** rimappare silenziosamente customer o tenant incompatibili.
- **Non** sincronizzare ancora `tenant_subscriptions`.
- **Non** aggiornare ancora lo snapshot commerciale di `public.tenants`.
- Nessun deploy nel task di implementazione.
- Nessuna migration prevista salvo evidenza tecnica successiva.

**I4.3 non è completato.** I4.3A è il prossimo micro-task applicativo.

### Dopo I4.3A: I4.3B (fase separata)

**I4.3B — subscription sync e tenant snapshot**

Punti ancora da progettare e implementare (non trasformare in implementazione ora):

- Eventi `customer.subscription.created|updated|deleted`
- Upsert di `tenant_subscriptions`
- Mapping del prodotto Stripe `pro_monthly` verso il piano interno `paid`
- Mapping esplicito degli stati Stripe verso `tenants.subscription_status`
- Protezione dei tenant `demo` e `internal`
- Gestione di `trial_ends_at`
- Eventi invoice inizialmente fuori scope, salvo decisione esplicita

### Altri passi (dopo I4.3B o in parallelo se priorità diversa)

1. **Deploy + test** webhook in test mode (endpoint Stripe Dashboard → Edge Function; `verify_jwt=false` già previsto in `config.toml` per webhook).
2. **I5** — implementare `create-billing-portal-session` (authz già presente).
3. **UI** — CTA checkout/portal solo per ruolo `admin`/`billing`, chiamando le EF (senza secret client).
4. **Doc sync** — aggiornare `docs/billing-data-model.md` e sezione “prossimi passi” di `docs/saas-refactor-plan.md` allo stato post-I4.3.
5. **Prodotto SaaS non-billing**: tenant switcher, inviti, test RLS cross-tenant (`docs/saas-rls-test-plan.md`).

---

## 7. Guardrail non negoziabili

- Tenant-first: ogni operazione dati con `activeTenantId` / `tenant_id` tracciabile.
- RLS sempre on; scritture billing **solo** server-side.
- `billing_events` **non** leggibile dal client (no GRANT SELECT authenticated).
- Baseline `000_*` immutabile per cambi futuri; niente rewrite storia produzione.
- `npm run lint` (= `tsc --noEmit`) e `npm run build` dopo modifiche rilevanti.
- Nessun commit di `.env` / chiavi reali.
- Cursor esegue solo il micro-task assegnato; non anticipa I4.3B o altre fasi dai “Consigli a ChatGPT”.

---

## 8. Comandi utili

```bash
npm install
npm run dev          # Vite :3000
npm run lint
npm run build
npx supabase start
npx supabase db reset   # SOLO locale, dopo review baseline
# Deploy EF (solo con conferma):
# npx supabase functions deploy <name> --project-ref <ref>
```

---

## 9. Documenti di riferimento

| Documento | Contenuto |
|-----------|-----------|
| `docs/stato-operativo.md` | Questo snapshot (ripresa rapida) — **fonte canonica dinamica** |
| `.cursor/rules/000-project-context.mdc` | Contesto, ruoli, ciclo micro-fasi, numerazione prompt, report obbligatorio |
| `docs/ai-context-mirror.md` | Mirror Google Drive di consultazione (non canonico) |
| `docs/saas-refactor-plan.md` | Storia fasi A–M e decisioni |
| `docs/billing-data-model.md` | Design billing + note I1–I4.0 (parziale drift post I4.1) |
| `docs/supabase-cli-baseline.md` | Come creare migration post-baseline |
| `docs/production-readiness.md` | Deploy / smoke / rollback |
| `docs/demo-tenant.md` | Runbook demo |
| `docs/saas-rls-test-plan.md` | Checklist RLS |
| `README.md` | Setup locale e Render |

---

*Aggiornare questo file alla fine di ogni micro-fase billing, governance o migration rilevante (commit applicativo di riferimento, commit governance consolidato, cosa fatto, prossima azione). Non pretendere che l’HEAD Git corrente coincida stabilmente con i valori storici di questo documento; verificarlo sempre con `git rev-parse HEAD`.*
