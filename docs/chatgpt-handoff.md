# ChatGPT handoff — Gestore Spese SaaS

**Snapshot:** 2026-08-11 · **Categoria:** HOT · Target: 3–8 KB

| Voce | Valore |
|------|--------|
| Branch di riferimento (snapshot) | `main` |
| Commit applicativo di riferimento | `2d9a639` — *feat(billing): add Stripe subscription pre-admission context* (I4.3BL) |
| Nota HEAD | `2d9a639` è il riferimento dello **snapshot**, non necessariamente l’HEAD futuro dopo consolidamenti governance |
| `origin/main` (al momento dello snapshot) | `e673840` (locale era **ahead 1**; I4.3BL non pushato) |
| Sync Drive | **BLOCCATA** finché restano working tree sporca intenzionale e/o gap GOVERNANCE-8B (clean-tree / dirty `stato-operativo`) |

**Sempre verificare su Git reale:** `git branch --show-current`, `git rev-parse HEAD`, `git status`. Branch / HEAD / working tree reali prevalgono su questo snapshot. **Non** trattare alcun elenco di file dirty come invariante.

---

## Obiettivo prodotto

SaaS **gestione spese** multi-tenant: React+Vite+TS (static) + Supabase (Auth, PostgreSQL+RLS, Realtime) + Stripe **test-mode** via Edge Functions. **Niente** backend Node obbligatorio sul path principale. **Niente** `service_role` / secret Stripe in `VITE_*`.

---

## Baseline tecnica essenziale

- Multi-tenancy + RLS tenant-first: **FATTO**
- Schema billing + checkout webhook (I4.3A) + correlazione customer→tenant: **FATTO** (deploy webhook remoto v4)
- CLI baseline locale M8 (`000_baseline…`); migration `007` (W_sub / revision / G1) **nel repo**, testata **solo locale**, **non** applicata in remoto
- I4.3B (subscription sync → `tenant_subscriptions` + snapshot `tenants`): **NON COMPLETO**

---

## Decisioni attive (non rinegoziare senza Supervisor)

- Strategy anti-stale **K2**; admission W_sub; design **R-A** (M2/R2)
- Snapshot(S) **V3** set-based; H2 CAS **V2** + TenantGuard; D3/D4/D5/D7/unpaid **congelate** (I4.3BC)
- Trust boundary: tenant solo da mapping server-side; provider state solo da fresh Stripe retrieve (no fallback webhook payload)
- Da I4.3BL-bis: `docs/stato-operativo.md` aggiornabile in `-bis` **locale**, **non** commit `docs(context)`
- Contesto AI: **locale = SoT**; Drive = mirror one-way; continuità ordinaria via questo handoff + indice HOT/WARM/COLD (`docs/ai-context-index.md`)

---

## Filone corrente — I4.3B

| Slice | Stato |
|-------|--------|
| I4.3BD schema M2 | CHIUSO (repo + T1 locale) |
| I4.3BE normalizer | CHIUSO, non wired |
| I4.3BF tenant resolver | CHIUSO, non wired |
| I4.3BG refetch | CHIUSO, non wired |
| I4.3BH admission classifier | CHIUSO, non wired |
| I4.3BI observation reader | CHIUSO, non wired |
| I4.3BJ composer BG→BE | CHIUSO, non wired |
| I4.3BL pre-admission orchestrator | CHIUSO in `2d9a639`, **non wired**, **non pushato** (al momento dello snapshot) |

**Ancora assenti:** BH runtime / `processed_at` mapping / persistence INSERT·CAS / 23505 / Snapshot V3 / H2 / TenantGuard / webhook `customer.subscription.*` / apply remoto 007 / deploy runtime sync.

---

## Governance contesto AI

| ID | Stato |
|----|--------|
| **GOVERNANCE-9** | Ristrutturazione HOT/WARM/COLD **in corso / non ancora consolidata** (handoff, index, rule 000, mirror HOT/FULL). **Non** inventare l’hash del commit futuro di consolidamento |
| **GOVERNANCE-8B** | **Separato e APERTO** — eccezione controllata dirty `stato-operativo` / contratto GOVERNANCE-8A (**non** implementato in GOVERNANCE-9) |
| GOVERNANCE-8B-R | Review ZERO-DIFF del working tree di ristrutturazione (gap → GOVERNANCE-9-F1) |

HOT/FULL = policy di **selezione perimetro** mirror, **non** bypass della safety policy clean-tree.

---

## Ultimo task significativo

- **Applicativo:** I4.3BL — `resolveStripeSubscriptionPreAdmissionContext` (BJ→identity→BF→BI→ownership fail-closed)
- **Documentale locale:** I4.3BL-bis / F1 su `stato-operativo.md` (non committed)
- **Governance:** GOVERNANCE-9 (ristrutturazione contesto) + fix selettivi GOVERNANCE-9-F1 — **non consolidati** finché non review/commit/`-bis`

---

## Rischi / blocchi aperti

1. Sync Drive **BLOCCATA** (stato operativo tracked-modified + `--apply` fail-closed; GOVERNANCE-8B ancora aperto)
2. I4.3BL ahead rispetto a `origin/main` al momento dello snapshot; verificare push con Git
3. Helpers I4.3B **non wired** in `stripe-webhook`
4. Drift noto: `billing-data-model.md` / `production-readiness.md` vs implementazione reale
5. Compatibilità strutturale client Stripe/Supabase reali non ancora provata nel wiring

---

## Prossimi passi candidati (decide Supervisor)

1. Review + commit selettivo GOVERNANCE-9 (senza includere `stato-operativo.md` se resta locale intenzionale)
2. GOVERNANCE-9-bis (registrare modello HOT/WARM/COLD nello stato operativo)
3. Solo dopo: GOVERNANCE-8B (dirty-state controllato) **oppure** ripresa I4.3B — **non** anticipare

Chiedere conferma prima di: deploy EF, apply migration remota, `db push`, Stripe live, cambi RLS expenses, test runtime Stripe, sync Drive `--apply`.

---

## Sintesi Cursor Rules

| Rule | Ruolo |
|------|--------|
| `000` | Ruoli, micro-task, SoT locale, handoff, no commit autonomi, report |
| `010` | Tenant-first, layering (always) |
| `020` | RLS/tenancy (glob SQL/lib) |
| `030` | Frontend React (glob src) |
| `040` | Billing readiness (glob billing/functions) |
| `050` | lint + build (always) |

---

## Drill-down (non caricare a ogni prompt)

| Bisogno | Fonte | Cat. |
|---------|-------|------|
| Indice fonti | `docs/ai-context-index.md` | HOT |
| Dettaglio/storico operativo | `docs/stato-operativo.md` | WARM |
| Policy mirror/sync | `docs/ai-context-mirror.md` | WARM |
| Billing model | `docs/billing-data-model.md` | WARM |
| Supabase CLI/migrations | `docs/supabase-cli-baseline.md` | WARM |
| Production/deploy | `docs/production-readiness.md` | WARM |
| Demo tenant | `docs/demo-tenant.md` | WARM |
| RLS test plan | `docs/saas-rls-test-plan.md` | WARM |
| Audit / piano refactor storici | `docs/saas-audit.md`, `docs/saas-refactor-plan.md` | COLD |

**Continuità ordinaria ChatGPT:** conversazione → questo handoff → report Cursor recente → **un solo** drill-down se serve.
