# Indice contesto AI — Gestore Spese SaaS

**Scopo:** far scegliere a ChatGPT/Cursor la **singola** fonte pertinente, senza caricare l’intero corpus.

**Principi:**

1. **Contesto locale = source of truth** (`docs/`, `.cursor/rules/`, repository Git)
2. **Google Drive = mirror derivato** one-way (LOCALE → Drive); mai Drive → locale automatico
3. Continuità ordinaria: conversazione → `chatgpt-handoff.md` → report Cursor → drill-down mirato
4. Categorie: **HOT** (ogni ripresa) · **WARM** (dominio del task) · **COLD** (raro / storico)

---

## HOT — continuità ordinaria

| File | Responsabilità | Autorità | Quando aggiornarlo | Quando leggerlo |
|------|----------------|----------|--------------------|-----------------|
| `docs/chatgpt-handoff.md` | Snapshot compatto (3–8 KB): HEAD, filone, decisioni attive, rischi, next steps | Continuity ChatGPT (derivato da Git + stato) | Cambio materiale di baseline / decisione / milestone / workstream / blocco / regola / HEAD di riferimento | **Ogni** ripresa ordinaria ChatGPT; Cursor all’avvio task se serve ripresa |
| `docs/ai-context-index.md` | Mappa fonti HOT/WARM/COLD | Indice (non sostituisce i documenti puntati) | Aggiunta/rimozione/riclassificazione fonti | Ripresa se non chiaro cosa aprire; mai al posto dell’handoff |

**HOT sync Drive:** solo questi due file (+ manifest scritto nella destinazione mirror dallo script).

---

## WARM — drill-down per dominio

| File | Responsabilità | Autorità | Quando aggiornarlo | Quando leggerlo |
|------|----------------|----------|--------------------|-----------------|
| `docs/stato-operativo.md` | Dettaglio/storico operativo, log task, decisioni estese | Fonte **WARM** autorevole per **profondità**/cronologia (non HOT; **non** obbligatorio intero a ogni prompt). Repository/Git resta canonico; Drive = mirror derivato | Task `-bis` quando cambia materialmente lo stato (**separato** dal task principale). Dopo review e autorizzazione utente l’aggiornamento segue il lifecycle Git/commit normale; il commit del `-bis` si registra nel successivo aggiornamento significativo (**vietato** `-bis-bis`). Modello ordinario: evitare working tree permanentemente dirty | Solo se serve cronologia, criteri chiusure, o dettaglio oltre handoff |
| `docs/ai-context-mirror.md` | Policy mirror Drive, HOT/FULL, workflow sync | Autorevole per sync/mirror | Cambio tooling o policy sync | Task sync/governance mirror |
| `docs/billing-data-model.md` | Modello dati billing / snapshot tenant | Design billing (possibile drift vs codice) | Evoluzione schema/contratti billing | Task billing/schema/subscription |
| `docs/supabase-cli-baseline.md` | Baseline CLI, replay migrations, guardrail `db push` | Workflow Supabase locale | Cambio baseline/migration policy | Task migration/CLI/reset locale |
| `docs/production-readiness.md` | Deploy, env, smoke, rollback | Runbook rilascio (possibile drift) | Cambio processo deploy | Task release/deploy/hosting |
| `docs/demo-tenant.md` | Runbook tenant demo | Operativo demo | Cambio procedura demo | Task demo tenant / fixture |
| `docs/saas-rls-test-plan.md` | Checklist test RLS | Piano test tenancy | Cambio policy RLS rilevanti | Task RLS / verifica isolamento |
| `.cursor/rules/000-project-context.mdc` | Ruoli, micro-task, SoT, report | Invarianti processo (always) | Solo invarianti; niente stato dinamico | Cursor always; ChatGPT solo se serve processo |
| `.cursor/rules/010-saas-architecture.mdc` | Tenant-first, layering | Invarianti architettura (always) | Cambi strutturali SoT | Task architettura/layering |
| `.cursor/rules/020-supabase-rls-tenancy.mdc` | RLS / Realtime / secret | Invarianti RLS (glob) | Cambi policy tenancy | Task SQL/RLS/lib |
| `.cursor/rules/030-react-typescript-frontend.mdc` | UI / repository pattern | Invarianti frontend (glob) | Cambi convenzioni UI | Task `src/` |
| `.cursor/rules/040-billing-readiness.mdc` | Billing server-side, idempotenza | Invarianti billing (glob) | Cambi astrazioni billing | Task Edge Functions / billing |
| `.cursor/rules/050-quality-gates.mdc` | lint + build | Quality gate (always) | Cambio script package | Dopo modifiche rilevanti |
| `README.md` | Run locale, deploy Render, link docs | Onboarding umano | Cambi setup | Setup/deploy base |

---

## COLD — storico / raro

| File | Responsabilità | Autorità | Quando aggiornarlo | Quando leggerlo |
|------|----------------|----------|--------------------|-----------------|
| `docs/saas-audit.md` | Audit architetturale iniziale | Storico (snapshot epoca audit) | Di norma **non**; preferire nuovi doc | Solo ricostruzione storica / confronto |
| `docs/saas-refactor-plan.md` | Piano fase 1 tenancy/migrations | Storico implementazione fase 1 | Di norma **non** | Solo se serve contesto migration storiche 001–005 |

**Candidati cleanup futuro (NON eliminare ora):** consolidare drift di `billing-data-model.md` / `production-readiness.md`; eventuale archivio esplicito audit/refactor sotto `docs/archive/` in un task dedicato.

---

## Policy ChatGPT (continua)

Usare in ordine:

1. Contesto già in conversazione
2. `docs/chatgpt-handoff.md`
3. Report Cursor più recente

Poi **al più un** documento WARM/COLD pertinente al dominio del task.

**Non** richiedere sistematicamente: stato-operativo intero, audit, refactor plan, billing model, production readiness, tutte le rules, tutto Drive.

Esempi: task UI senza dipendenza billing → niente billing docs; task RLS → `020` + eventuale `saas-rls-test-plan`; task rilascio → `production-readiness`; task demo → `demo-tenant`.

---

## Policy Cursor

- All’avvio: verificare Git (`branch`, `HEAD`, `status`); leggere handoff se serve ripresa; **non** obbligo di leggere intero `stato-operativo.md`
- Drill-down solo sul file indicato dal task / dall’indice
- Non dipendere da Google Drive per eseguire task
- Sync solo esplicita (vedi `ai-context-mirror.md`); default **HOT**; **FULL** solo su richiesta

---

## Sync Drive (sintesi)

| Modalità | Contenuto |
|----------|-----------|
| **HOT** (default) | `chatgpt-handoff.md`, `ai-context-index.md` + manifest in destinazione |
| **FULL** | Tutti i `docs/**/*.md` e `.cursor/rules/**/*.mdc` tracciati da Git |

Flusso: **LOCALE → Drive** only. No `--delete`. No watcher/cron/hook. No sync a ogni prompt.
