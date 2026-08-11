# Stato operativo — Gestore Spese Quotidiane

**Ruolo:** documento **WARM** di dettaglio/storico operativo. **Non** è obbligatorio leggerlo per intero a ogni prompt. Continuità ordinaria ChatGPT → [`docs/chatgpt-handoff.md`](chatgpt-handoff.md); mappa fonti HOT/WARM/COLD → [`docs/ai-context-index.md`](ai-context-index.md). Questo file resta autorevole per profondità, cronologia task e decisioni estese.

**Data snapshot:** 2026-08-11 — consolidamento **GOVERNANCE-9-bis** (modello HOT/WARM/COLD + lifecycle `-bis`)

| Voce | Valore |
|------|--------|
| Branch atteso | `main` |
| Commit applicativo di riferimento | `2d9a639bfc326644cdcd200e6309abdb51e7ec31` — *feat(billing): add Stripe subscription pre-admission context* — I4.3BL |
| Ultimo consolidamento governance (HEAD locale atteso preflight) | `c9d9f1f0a75bbe7a40c32c4eeedbe149151e8dc0` — *docs(governance): align AI context lifecycle* — **GOVERNANCE-9-F2** |
| GOVERNANCE-9 (include F1) | `a86e773bc871a3aebecd0764f77c3ba95eda8fda` — *chore(governance): restructure AI context workflow* |
| Ultimo commit `docs(context)` storico precedente | `e67384079816bf9defcb15e2069351c28ddbac8a` — *docs(context): record Stripe subscription composition* — I4.3BJ-bis |
| Aggiornamento stato operativo corrente | **GOVERNANCE-9-bis** — consolidamento in questo file (working tree dirty attesa; **hash commit futuro non inventato**); sync Drive **BLOCCATA** finché dopo review+commit la working tree non torna pulita |
| `origin/main` (preflight, senza fetch) | `e673840…` — locale **ahead 3** (I4.3BL + GOVERNANCE-9 + GOVERNANCE-9-F2); verificare sempre con Git |
| Verifica Git richiesta | All’inizio di ogni task: `git rev-parse HEAD`, `git status`, `git branch --show-current` |

Nota: l’HEAD reale deve essere verificato all’inizio di ogni task con `git rev-parse HEAD`. Branch, working tree e cronologia reale del repository prevalgono sempre sui valori storici riportati nel documento. **Source of truth = contesto locale / repository / Git**; Google Drive = **mirror derivato** one-way (LOCALE → Drive). Nessuna riconciliazione silenziosa; nessuna sync inversa Drive → repo.

**Lifecycle `-bis` (normativo, da GOVERNANCE-9-F2):** `docs/stato-operativo.md` si aggiorna con task `-bis` separato quando lo stato cambia materialmente; dopo review Supervisor e autorizzazione utente segue il **normale lifecycle Git/commit**; il commit del `-bis` si registra nel successivo aggiornamento significativo; **vietato** `-bis-bis`; obiettivo ordinario = **working tree pulita** (non dirty permanente). La decisione storica I4.3BL-bis «locale/non-commit permanente» è **SUPERATA / RISOLTA** da GOVERNANCE-9-F2 (vedi §0 e cronologia).

**Scopo di questo file:** dettaglio e storico per **drill-down** quando l’handoff non basta. La continuità ordinaria non richiede il caricamento sistematico di questo intero documento (vedi `.cursor/rules/000-project-context.mdc` e `docs/ai-context-index.md`).

---

## Prompt da incollare in ChatGPT

Per una nuova chat **ordinaria**, preferire il blocco corto sotto (handoff). Il log storico lungo resta nelle sezioni successive di **questo** file per drill-down, non va più incollato intero a ogni ripresa.

```text
Sei un agente senior Software Architecture / SaaS multi-tenant / React+Vite+TypeScript / Supabase (Auth, PostgreSQL RLS, Edge Functions Deno) / Stripe billing test-mode.

Progetto: “Gestore Spese Quotidiane” — SaaS multi-tenant su stack statico + Supabase (NO backend Node obbligatorio sul path principale).

Continuità ordinaria (in ordine):
1. Contesto già in conversazione
2. docs/chatgpt-handoff.md
3. Report Cursor più recente
4. Solo se serve dettaglio: UN documento da docs/ai-context-index.md (WARM/COLD pertinente)

NON caricare sistematicamente: stato-operativo intero, audit, refactor plan, billing model, production readiness, tutte le rules, tutto Drive.

Vincoli:
- Modifiche INCREMENTALI, scope piccolo; niente refactor non richiesti
- Mai service_role / secret Stripe in frontend o VITE_*
- Mai supabase db push / reset produzione / deploy / Stripe live senza conferma esplicita
- Quality gates dopo blocchi rilevanti: npm run lint && npm run build
- Locale = source of truth; Drive = mirror derivato one-way

Filone corrente (sintesi): I4.3B subscription sync NON COMPLETO; I4.3BL pre-admission CHIUSO non wired; GOVERNANCE-9/F2 consolidati; GOVERNANCE-9-bis = questo consolidamento stato-operativo (commit futuro non inventato). Sync Drive BLOCCATA finché working tree non torna pulita dopo commit -bis. GOVERNANCE-8B NON implementato / da rivalutare solo post clean tree. Ripresa I4.3B solo dopo chiusura ciclo governance — non anticipare.

Chiedimi conferma prima di: deploy Edge Functions, apply migration produzione, db push, live Stripe keys, cambi RLS su expenses, test runtime Stripe/webhook.
```

> Nota storica: il precedente “prompt da incollare” includeva una sintesi lunghissima delle chiusure I4.3A–I4.3BL. Quel contenuto **non è stato cancellato**: resta nelle sezioni operative sotto e nell’handoff in forma compatta. Non reinstatare il caricamento sistematico dell’intero corpus.

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
- **Vietato** `-bis-bis`.
- **Lifecycle `-bis` (normativo, GOVERNANCE-9-F2):** quando lo stato cambia materialmente, Cursor aggiorna questo file in un task `-bis` dedicato; il Supervisor revisiona il DIFF; dopo autorizzazione utente l’aggiornamento segue il **normale lifecycle Git/commit**; il commit del `-bis` viene registrato nel successivo aggiornamento significativo; obiettivo ordinario = **working tree pulita**. **Non** esiste più una policy normativa di «stato-operativo permanentemente locale/non committato» né di working tree intenzionalmente dirty permanente.
- **Fatto storico SUPERATO (I4.3BL-bis / I4.3BL-bis-F1):** tra I4.3BL-bis e GOVERNANCE-9-F2 era stata introdotta la decisione «locale/non-commit» e sync **BLOCCATA** con `M docs/stato-operativo.md` intenzionale, motivando la candidatura di un micro-task governance (poi etichettato **GOVERNANCE-8B**) per eccezione dirty-state allo script mirror. Quella decisione **non** è più normativa: **SUPERATA / RISOLTA** da GOVERNANCE-9-F2 (handoff allineato; stato-operativo torna al ciclo Git tramite `-bis`). I commit `docs(context)` storici fino a I4.3BJ-bis (`e673840`) restano storia valida.
- Sync Drive: `--apply` dello script ufficiale resta **fail-closed** su working tree non pulita (HOT/FULL = solo perimetro, **non** bypass safety). Finché questo file resta dirty (ciclo GOVERNANCE-9-bis in corso) la sync resta **BLOCCATA**. Dopo review+commit utente e verifica clean tree: rivalutare sync HOT e **GOVERNANCE-8B**. Vietati workaround (`cp`/`rsync`/bypass/`--delete`/sync inversa).
- Ogni report Cursor termina con la sezione esatta `Consigli a ChatGPT per i prossimi prompt` (ultima sezione; niente sezioni successive).
- Dettaglio stabile: `.cursor/rules/000-project-context.mdc`.

### Modello fonti HOT / WARM / COLD

| Categoria | Fonti | Uso |
|-----------|-------|-----|
| **HOT** | `docs/chatgpt-handoff.md`, `docs/ai-context-index.md` | Continuità ordinaria ChatGPT; routing verso fonti specialistiche |
| **WARM** | `docs/stato-operativo.md`; docs tecnici verticali pertinenti; rules specialistiche di dominio | Drill-down quando il task richiede dettaglio |
| **COLD** | Audit, piani storici, documentazione superata/rara | Consultazione rara; **non** cancellare fonti COLD in questo ciclo |

**Policy ChatGPT (continua):** (1) contesto già in conversazione → (2) handoff → (3) report Cursor recente → (4) solo se necessario, **singolo** drill-down indicato dall’indice. `stato-operativo.md` **non** è obbligatorio intero a ogni prompt.

**Policy Cursor:** all’avvio verificare branch / HEAD / `git status`; usare handoff/index per continuità e routing; consultare WARM solo se pertinente; **non** dipendere da Google Drive per il lavoro nel repository.

### Mirror Google Drive

- Documento operativo: [`docs/ai-context-mirror.md`](ai-context-mirror.md). Script ufficiale: `scripts/sync-ai-context-mirror.sh` (GOVERNANCE-7 `8ff556d`; policy HOT/FULL aggiornata in **GOVERNANCE-9** `a86e773`).
- **Repository / Git** = source of truth; Drive = **mirror derivato** di consultazione, non canonico.
- Cursor modifica **solo** i file nel repository, non direttamente in Drive.
- Configurazione locale non versionata: variabile `AI_CONTEXT_MIRROR_DIR` oppure file `.git/ai-context-mirror-path`. Nessun percorso personale in file versionati, report o prompt.
- Commit e push restano dell’**utente**. Dopo **conferma del commit** in conversazione, Cursor può eseguire la sync controllata (senza nuovo prompt ChatGPT) **solo se** la working tree è **completamente pulita**.
- **HOT** (default): `chatgpt-handoff.md` + `ai-context-index.md` (+ manifest in destinazione). **FULL** (esplicito): `docs/**/*.md` + `.cursor/rules/**/*.mdc` tracciati da Git. HOT/FULL = **perimetro** di selezione; **non** bypassa i guardrail safety dello script.
- Ordine: verifiche pre-sync → `scripts/sync-ai-context-mirror.sh --dry-run` → validazione → `--apply` (solo WT pulita) → confronto byte-per-byte / checksum → report → stop.
- Divieti permanenti: `--delete`; sync inversa Drive → repository; Git hook; sync automatica/background; watcher/cron.
- Comportamento **fail-closed** (working tree sporca, config assente, dry-run anomalo, rsync fallito → non apply).
- **GOVERNANCE-8B** — **NON IMPLEMENTATO / DA RIVALUTARE**: era nato per consentire sync con `docs/stato-operativo.md` intenzionalmente dirty. Con il lifecycle GOVERNANCE-9-F2 (commit `-bis` → WT pulita) la necessità reale va rivalutata **solo dopo** commit di GOVERNANCE-9-bis e verifica clean tree. **Non** dichiararlo necessario, chiuso o cancellato in anticipo. Nessuna eccezione dirty-state / expected-hash/pin TOCTOU nello script attuale.
- Propagazione locale → cloud: **Google Drive Desktop**. Continuità ordinaria via **handoff HOT**, non rilettura dell’intero mirror.
- Prima sincronizzazione controllata post-commit (su `8ff556d`): riuscita — 15 file. Mirror Drive attualmente **più vecchio** del repository (atteso finché il ciclo governance non è consolidato). Nessuna riconciliazione inversa.
- **GOVERNANCE-9-bis:** **nessuna** sync in questo task.

### Fonte canonica e vincoli di processo

- Continuità ordinaria: `docs/chatgpt-handoff.md` + report Cursor; indice `docs/ai-context-index.md`.
- Questo file (`stato-operativo.md`) è **WARM** (dettaglio/storico): **non** obbligatorio leggerlo per intero a ogni prompt.
- Locale / Git = source of truth; Drive = mirror derivato (HOT default / FULL su richiesta).
- La regola `.cursor/rules/000-project-context.mdc` contiene solo invarianti di processo (non lo stato dinamico).
- I consigli in `Consigli a ChatGPT per i prossimi prompt` **non** autorizzano Cursor a implementare autonomamente la fase successiva.
- `README.md` collega handoff, indice e questo file.

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
| I4.3BB-bis | Consolidato in `169dfa4` — *docs(context): record subscription sync concurrency architecture* |
| I4.3BC-bis | Consolidato in `83fbf24` — *docs(context): record subscription snapshot policy* |
| I4.3BD-bis | Consolidato in `aa2b1e7` — *docs(context): record subscription concurrency schema* |
| I4.3BE-bis | Consolidato in `613f3ed` — *docs(context): record Stripe subscription normalizer* |
| I4.3BF-bis | Consolidato in `a16eeb8` — *docs(context): record billing customer tenant resolver* |
| I4.3BG-bis | Consolidato in `bb0f775` — *docs(context): record Stripe subscription refetch primitive* |
| I4.3BH-bis | Consolidato in `57c7e00` — *docs(context): record subscription event admission classifier* |
| I4.3BI-bis | Consolidato in `cc36c06` — *docs(context): record subscription observation reader* |
| I4.3BJ-bis | Consolidato in `e673840` — *docs(context): record Stripe subscription composition* |
| I4.3BL-bis / I4.3BL-bis-F1 | Fatto storico: aggiornamento locale di `docs/stato-operativo.md` con decisione «locale/non-commit» + sync BLOCCATA — **SUPERATO / RISOLTO** da GOVERNANCE-9-F2 (vedi sotto); contenuto applicativo I4.3BL resta autorevole |
| **GOVERNANCE-9** (include F1) | **CHIUSO / CONSOLIDATO** in `a86e773` — *chore(governance): restructure AI context workflow* |
| **GOVERNANCE-9-F2** | **CHIUSO / CONSOLIDATO** in `c9d9f1f` — *docs(governance): align AI context lifecycle* |
| **GOVERNANCE-9-bis** | In corso in questo file — consolidamento stato operativo HOT/WARM/COLD + lifecycle `-bis` (**hash commit futuro non inventato**) |
| **GOVERNANCE-8B** | **NON IMPLEMENTATO / DA RIVALUTARE** solo dopo commit GOVERNANCE-9-bis + working tree pulita — **non** necessario/chiuso/cancellato in anticipo |
| Commit storici governance | `14a8575` (GOVERNANCE-4-bis); `1e83f19` (fonti canoniche) |
| Commit applicativo corrente | `2d9a639` — *feat(billing): add Stripe subscription pre-admission context* (I4.3BL) |
| Commit applicativo precedente rilevante | `e87462c` — *feat(billing): compose Stripe subscription refetch and normalization* (I4.3BJ); `92fb6dd` — *feat(billing): add subscription observation reader* (I4.3BI); `38e4280` — *feat(billing): add subscription event admission classifier* (I4.3BH); `dc5cbcf` — *feat(billing): add Stripe subscription refetch primitive* (I4.3BG); `48782cd` — *feat(billing): add billing customer tenant resolver* (I4.3BF); `0e42dd5` — *feat(billing): add Stripe subscription normalizer* (I4.3BE); `8246000` — *feat(billing): add subscription sync concurrency schema* (I4.3BD); prima ancora `18a4bf9` (I4.3A, include fix review F1–F4); `1f633fcc` (I4.2) |
| `.cursor/rules/000-project-context.mdc` | Esteso in `063cbf7`; sync aggiornata in `8ff556d`; ristrutturata invarianti HOT/WARM/COLD in **GOVERNANCE-9** `a86e773` |
| `docs/chatgpt-handoff.md` / `docs/ai-context-index.md` | Introdotti in **GOVERNANCE-9** `a86e773`; lifecycle allineato in **GOVERNANCE-9-F2** `c9d9f1f` |
| `docs/ai-context-mirror.md` | Creato in `063cbf7`; workflow script in `8ff556d`; policy HOT/FULL in **GOVERNANCE-9** `a86e773` |
| `scripts/sync-ai-context-mirror.sh` | Introdotto in `8ff556d`; HOT default / FULL / `--status` / checksum / manifest in **GOVERNANCE-9** `a86e773` |
| `README.md` | Collegamento a `docs/stato-operativo.md` **versionato** in `1e83f19`; navigazione handoff/index in **GOVERNANCE-9** |

L’HEAD reale e l’allineamento con `origin/main` vanno **sempre verificati** all’inizio di ogni task. Durante I4.3A-D1 l’HEAD locale è rimasto `a380ce9` (nessuna modifica locale; nessun commit applicativo). I4.3A-D1-bis consolidato in `751852b`. I4.3A-T1-bis consolidato in `b4da681`. I4.3A-T1C-bis consolidato in `2c0c060`. I4.3A-T1D-bis consolidato in `87d410c`. I4.3A-T1E-bis consolidato in `8615cda`. I4.3A-T1F-bis consolidato in `d4a2889`. I4.3A-T1G-bis consolidato in `30da6a5`. I4.3BA-bis consolidato in `436d587` (sync mirror post-commit: dry-run OK, apply OK, verifica byte/hash OK su 15 file; cloud mirror verificato da ChatGPT; nessuna sync inversa; nessun `--delete`). I4.3BB-bis consolidato in `169dfa4` — *docs(context): record subscription sync concurrency architecture* (sync mirror post-commit: dry-run OK, apply OK, verifica byte/hash 15/15; cloud mirror verificato da ChatGPT; push `origin/main` completato; `main`/`origin/main` allineati; nessuna sync inversa; nessun `--delete`). I4.3BC-bis consolidato in `83fbf24` — *docs(context): record subscription snapshot policy*. **I4.3BD** consolidato in `8246000` — *feat(billing): add subscription sync concurrency schema* (schema M2). **I4.3BD-bis** consolidato in `aa2b1e7` — *docs(context): record subscription concurrency schema* (sync mirror post-commit successivamente completata: dry-run PASS; apply PASS; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessuna sync inversa; nessun `--delete`; la precedente divergenza «sync non attestata» è stata **risolta/verificata**). Push Git di I4.3BD + I4.3BD-bis completato dall’utente prima di I4.3BE. **I4.3BE** consolidato in `0e42dd5` — *feat(billing): add Stripe subscription normalizer* (mapper puro). **I4.3BE-bis** consolidato in `613f3ed` — *docs(context): record Stripe subscription normalizer*. Sync I4.3BE-D1 **completata e verificata** (dry-run PASS; apply PASS; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). Push I4.3BE + I4.3BE-bis completato dall’utente; prima di I4.3BF, `main`/`origin/main` allineati a `613f3ed` (verifica utente). La precedente formulazione storica «sync I4.3BE-bis non eseguita» / «push I4.3BE non attestato» è quindi **risolta/verificata** (non riconciliazione silenziosa). **I4.3BF** consolidato in `48782cd` — *feat(billing): add billing customer tenant resolver* (resolver read-only). **I4.3BF-bis** consolidato in `a16eeb8` — *docs(context): record billing customer tenant resolver*. Sync I4.3BF-D1 **completata e verificata** (dry-run PASS; apply PASS; 15 file; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). Push I4.3BF + I4.3BF-bis completato dall’utente (`613f3ed..a16eeb8` main → main); prima di I4.3BG, `main`/`origin/main` allineati a `a16eeb8` (verifica utente). La precedente formulazione storica «I4.3BF non pushato» / «sync I4.3BF-bis non eseguita» è quindi **risolta/verificata** (non riconciliazione silenziosa). **I4.3BG** consolidato in `dc5cbcf` — *feat(billing): add Stripe subscription refetch primitive* (provider re-fetch primitive). **I4.3BG-bis** consolidato in `bb0f775` — *docs(context): record Stripe subscription refetch primitive*. Sync I4.3BG-D1 **completata e verificata** (dry-run PASS; apply PASS; 15 file; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). Push I4.3BG + I4.3BG-bis completato dall’utente (`a16eeb8..bb0f775` main → main); prima di I4.3BH, `main`/`origin/main` allineati a `bb0f775` (verifica utente). La precedente formulazione storica «I4.3BG non pushato» / «sync I4.3BG-bis non eseguita» è quindi **risolta/verificata** (non riconciliazione silenziosa). **I4.3BH** consolidato in `38e4280` — *feat(billing): add subscription event admission classifier* (pure W_sub admission classifier). **I4.3BH-bis** consolidato in `57c7e00` — *docs(context): record subscription event admission classifier*. Sync I4.3BH-D1 **completata e verificata** (dry-run PASS; apply PASS; 15 file; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). Push I4.3BH + I4.3BH-bis completato dall’utente (`bb0f775..57c7e00` main → main); prima di I4.3BI, `main`/`origin/main` allineati a `57c7e00` (verifica utente). La precedente formulazione storica «I4.3BH non pushato» / «sync I4.3BH-bis non eseguita» è quindi **risolta/verificata** (non riconciliazione silenziosa). **I4.3BI** consolidato in `92fb6dd` — *feat(billing): add subscription observation reader* (read-only row observation reader); I4.3BI-F1 hygiene test **CHIUSO** (reader SHA-256 invariato; nessun F2). **I4.3BI-bis** consolidato in `cc36c06` — *docs(context): record subscription observation reader*. Sync I4.3BI-D1 **completata e verificata** (dry-run PASS; apply PASS; 15 file; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). Push I4.3BI + I4.3BI-bis completato dall’utente (`57c7e00..cc36c06` main → main); prima di I4.3BJ, `main`/`origin/main` allineati a `cc36c06` (verifica utente). La precedente formulazione storica «I4.3BI non pushato» / «sync I4.3BI-bis non eseguita» (e snapshot/header che ancora citavano I4.3BH-bis come ultimo governance) è quindi **risolta/verificata** (non riconciliazione silenziosa). **I4.3BJ** consolidato localmente in `e87462c` — *feat(billing): compose Stripe subscription refetch and normalization* (composer provider-authoritative refetch→normalize); I4.3BJ-F1 test-only **CHIUSO** (composer SHA-256 invariato `ce252fca09b50076ae17c5a18b40bb3f6e9d527a982258b9d590e9bed03a13ea`; nessun F2). Allo stato Git locale verificato in preflight I4.3BJ-bis: `main` ahead di `origin/main` di 1 commit — **non** dichiarare I4.3BJ già su `origin/main`; nessun `git fetch` in questo task. La freschezza server di `origin/main` **non** è stata aggiornata con `git fetch` in questo task. **I4.3A-D1** (deploy amministrativo `stripe-webhook`) è concluso. **I4.3A-T1A**–**T1E** = runtime PASS; **I4.3A-T1F** e **I4.3A-T1G** = **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (non runtime PASS; CASO 3). **I4.3A-T1** = **CHIUSO COMPLESSIVAMENTE** (evidenza mista; **non** «runtime PASS» nel complesso; nessun residuo). **I4.3BA** / **I4.3BB** / **I4.3BB-R** / **F1–F3** = ricognizioni/decisioni architetturali zero-code **completate**. **I4.3BC** / **I4.3BC-F1** / **I4.3BC-F2** / **I4.3BC-F3** = decisione prodotto zero-code **CHIUSI** (D3/D4/D5/D7/unpaid congelate; Snapshot(S) V3; H2 CAS V2; M2/R2=**R-A**). **I4.3BD** = schema M2 **CHIUSO** (migration 007 nel repo; T1 PASS locale; nessun apply remoto). **I4.3BE** / **I4.3BE-F1** / **I4.3BE-T1** / **I4.3BE-bis** / **I4.3BE-D1** = normalizzatore puro **CHIUSO** e documentato (F1 chiuso; T1 re-run 28/28 PASS; sync+push verificati). **I4.3BF** / **I4.3BF-bis** / **I4.3BF-D1** = resolver tenant read-only **CHIUSO** e documentato (sync+push verificati). **I4.3BG** / **I4.3BG-bis** / **I4.3BG-D1** = provider re-fetch primitive **CHIUSO** e documentato (sync+push verificati). **I4.3BH** / **I4.3BH-bis** / **I4.3BH-D1** = pure admission classifier W_sub **CHIUSO** e documentato (sync+push verificati). **I4.3BI** / **I4.3BI-F1** / **I4.3BI-bis** / **I4.3BI-D1** = row observation reader read-only **CHIUSO** e documentato (sync+push verificati; helper **NON WIRED**). **I4.3BJ** / **I4.3BJ-F1** = composer provider-authoritative refetch→normalize **CHIUSO**; I4.3BJ-bis consolidato in `e673840` (su `origin/main` nel preflight I4.3BL-bis). **I4.3BL** = orchestrator read-only pre-admission **CHIUSO** in `2d9a639` (helper **NON WIRED**; non pushato al momento del commit applicativo; poi HEAD locale avanzato con GOVERNANCE-9/`a86e773` + GOVERNANCE-9-F2/`c9d9f1f` — verificare Git). **I4.3BL-bis / I4.3BL-bis-F1** = fatto storico di aggiornamento locale + decisione «locale/non-commit» (**SUPERATA / RISOLTA** da GOVERNANCE-9-F2). **GOVERNANCE-9** (include F1) **CHIUSO / CONSOLIDATO** in `a86e773`. **GOVERNANCE-9-F2** **CHIUSO / CONSOLIDATO** in `c9d9f1f`. **GOVERNANCE-9-bis** = questo consolidamento documentale (commit futuro **non** inventato). **GOVERNANCE-8B** = **NON IMPLEMENTATO / DA RIVALUTARE** post clean tree. **I4.3B** resta **NON COMPLETO** (schema M2 + BE/BF/BG/BH/BI/BJ + orchestrator BL presenti; restano BH runtime / processed_at / persistence / CAS / 23505 / Snapshot V3 / H2 / TenantGuard / webhook wiring / deploy / apply remoto 007). Nessuna sincronizzazione subscription runtime, nessun aggiornamento dello snapshot `tenants`. Filone applicativo: **I4.3B**; ripresa solo dopo chiusura ciclo governance (review → commit GOVERNANCE-9-bis → WT pulita → rivalutazione 8B → eventuale sync HOT) — **non** anticipare slice applicativi.

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
| Governance operativa (GOVERNANCE-1/2/3-bis/4/`1e83f19`/4-bis/`14a8575`/5-bis/`063cbf7`/6-bis/`253affa`/I4.3A-bis/`99dc1f6`/7/`8ff556d`/7-bis/`a380ce9`/I4.3A-D1-bis/`751852b`/I4.3A-T1-bis/`b4da681`/I4.3A-T1C-bis/`2c0c060`/I4.3A-T1D-bis/`87d410c`/I4.3A-T1E-bis/`8615cda`/I4.3A-T1F-bis/`d4a2889`/I4.3A-T1G-bis/`30da6a5`/I4.3BA-bis/`436d587`/I4.3BB-bis/`169dfa4`/I4.3BC-bis/`83fbf24`/I4.3BD-bis/`aa2b1e7`/I4.3BE-bis/`613f3ed`/I4.3BF-bis/`a16eeb8`/I4.3BG-bis/`bb0f775`/I4.3BH-bis/`57c7e00`) | Modello Supervisor/Executor; numerazione prompt e workflow `-bis`; fonti canoniche in `1e83f19`; GOVERNANCE-4-bis in `14a8575`; GOVERNANCE-5-bis in `063cbf7`; GOVERNANCE-6-bis in `253affa`; I4.3A-bis in `99dc1f6`; GOVERNANCE-7 in `8ff556d`; GOVERNANCE-7-bis in `a380ce9`; I4.3A-D1-bis in `751852b`; I4.3A-T1-bis in `b4da681`; I4.3A-T1C-bis in `2c0c060`; I4.3A-T1D-bis in `87d410c`; I4.3A-T1E-bis in `8615cda`; I4.3A-T1F-bis in `d4a2889`; I4.3A-T1G-bis in `30da6a5`; I4.3BA-bis in `436d587`; I4.3BB-bis in `169dfa4`; I4.3BC-bis in `83fbf24`; I4.3BD-bis in `aa2b1e7`; I4.3BE-bis in `613f3ed`; I4.3BF-bis in `a16eeb8`; I4.3BG-bis in `bb0f775`; I4.3BH-bis in `57c7e00` |
| **GOVERNANCE-7 — sync controllata mirror** | Commit `8ff556d`: script `scripts/sync-ai-context-mirror.sh`; delega post-commit a Cursor (dopo conferma utente); dry-run → apply; apply solo con working tree pulita; perimetro Git tracciato (`docs/**/*.md`, `.cursor/rules/**/*.mdc`); privacy-safe (no percorsi personali); no `--delete` / no sync inversa; verifica byte-per-byte; **prima sync controllata completata su 15 file** |
| **GOVERNANCE-7-bis** | Commit `a380ce9` — stato operativo aggiornato dopo GOVERNANCE-7 / sync controllata mirror |
| **GOVERNANCE-9** (include GOVERNANCE-9-F1) | **CHIUSO / CONSOLIDATO** in `a86e773` — *chore(governance): restructure AI context workflow*. Introduzione `docs/chatgpt-handoff.md` (HOT), `docs/ai-context-index.md` (indice HOT/WARM/COLD); rule `000` compatta sugli invarianti; `docs/ai-context-mirror.md` policy HOT/FULL; script sync: HOT default, FULL esplicito, `--status`, checksum, manifest; README navigazione documentale; Drive = mirror one-way; nessuna sync automatica/background; nessun `--delete`; nessuna sync inversa |
| **GOVERNANCE-9-F2** | **CHIUSO / CONSOLIDATO** in `c9d9f1f` — *docs(governance): align AI context lifecycle*. Handoff post GOVERNANCE-9; stato-operativo **non** permanentemente locale/non-commit; lifecycle Git normale via task `-bis`; obiettivo ordinario = working tree pulita |
| **GOVERNANCE-9-bis** | In corso — consolidamento di questo file (HOT/WARM/COLD, SoT, lifecycle `-bis`, GOVERNANCE-8B da rivalutare); **hash commit futuro non inventato**; **nessuna** sync in questo task |
| **GOVERNANCE-8B** | **NON IMPLEMENTATO / DA RIVALUTARE** dopo WT pulita post-commit GOVERNANCE-9-bis — **non** necessario/chiuso/cancellato in anticipo |
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
| **I4.3BB — ricognizione/decisione anti-stale** | **Completata** (ZERO-CODE / ZERO-DIFF). Nessuna modifica repository; nessuna migration; nessun runtime Stripe/Supabase; nessun deploy. Conclusioni: (1) Event payload e provider state sono concetti distinti; (2) `event.created` = timestamp dell’Event, utilizzabile come admission watermark per-subscription, **NON** versione nativa dello snapshot Subscription re-fetched; (3) `event.id` = identificatore univoco, **NON** clock cronologico, **NON** ordinare lessicograficamente per freshness; (4) strategia anti-stale scelta: **provider re-fetch + admission watermark + CAS/readback/re-fetch**; (5) il solo provider re-fetch **non** elimina le race concorrenti; (6) Event stale non deve sovrascrivere stato più recente; (7) Provider API temporaneamente indisponibile → nessun fallback al payload webhook; failure ritentabile; `processed_at` resta NULL; HTTP candidato 502; `processing_error` sanitizzato; (8) `customer.subscription.deleted`: retrieve post-cancel supportato; non è più capacità fondamentale da validare prima del design; restano failure transient/ownership/CAS. Decisioni prodotto D3/D4/D5/D7/unpaid erano ancora aperte al momento di BB (chiuse poi in I4.3BC) |
| **I4.3BB-R — correzione K2** | **Completata** (ZERO-CODE). Classificazione **K2**: provider re-fetch + Event watermark è corretto **solo** con CAS sull’osservazione W0, conditional update, readback, nuovo provider re-fetch dopo CAS failure se l’Event resta candidato, retry locale limitato, fail/retry se contention non converge. **W_sub** = (`last_applied_provider_event_created_at`, `last_applied_provider_event_id`). Semantica: `last_applied_provider_event_created_at` = admission watermark dell’Event applicato (**NON** versione/freshness dello stato Stripe re-fetched); `last_applied_provider_event_id` = identificatore dell’ultimo Event applicato e CAS token locale (**NON** clock cronologico). Equal timestamp: stesso ts + stesso event id → distinguere billing_event completed da partial retry; stesso ts + event id diverso → re-fetch provider, CAS sulla coppia W osservata, CAS failure → readback, non riusare snapshot provider vecchio, nuovo re-fetch se ancora candidato. **NON** registrare `event.id` come tie-break cronologico |
| **I4.3BB-R-F1 — partial retry** | **Completata** (ZERO-CODE). Invariante: `billing_events.processed_at` = **UNICO** commit marker dell’intero processing applicativo dell’Event; W_sub = prova esclusivamente dello stato dell’effetto per-subscription. Quindi W_sub == Event corrente **AND** `processed_at IS NULL` **NON** significa completed: significa subscription effect già applicato, downstream effects ancora da completare. Retry: non riscrivere ciecamente la subscription; rileggere/riclassificare W_sub; recompute snapshot dal set locale corrente; completare effetti downstream; solo dopo successo impostare `processed_at`. Se snapshot o mark falliscono: `processed_at` resta NULL; failure ritentabile; HTTP candidato 502. **ROW_ABSENT** ≠ **ROW_PRESENT con W NULL/NULL**. ROW_ABSENT: provider re-fetch → INSERT `tenant_subscriptions`; UNIQUE(`provider`,`provider_subscription_id`) gestisce race; **23505 non è automaticamente fatal** → re-lookup, tenant ownership check, riclassificazione W, eventuale CAS/re-fetch. Se re-lookup mostra tenant diverso: **FAIL-CLOSED**; nessun remap `tenant_id`; `processed_at` NULL; `processing_error` sanitizzato; HTTP candidato 502 |
| **I4.3BB-R-F2 — race snapshot cross-subscription** | **Completata** (ZERO-CODE). Il semplice «read tutte `tenant_subscriptions` → derive Snapshot(S) → UPDATE `tenants`» è **INSUFFICIENTE** sotto concorrenza: due handler su subscription diverse possono leggere generazioni differenti del set e invertire l’ordine delle snapshot write, lasciando uno snapshot tenant stale. Il CAS W_sub protegge la singola subscription ma **NON** lo snapshot aggregato cross-subscription. F2 individuò correttamente la necessità di una revision tenant-side; la **prima proposta F2** (revision incrementata dallo snapshot writer) era **INCOMPLETA** ed è **superseded** da F3. Non usare F2 come design corrente della revision |
| **I4.3BB-R-F3 — design tecnico approvato (R2 / A2 → R-A)** | **Completata** (ZERO-CODE). Classificazione intermedia **R2**; **M2** resta classificazione schema; classificazione finale consolidata in I4.3BC: **M2/R2 = R-A**. Semantica approvata: `tenants.billing_state_revision` = generazione **LOCALE** monotona del SET `tenant_subscriptions` del tenant — **NON** event watermark, **NON** Stripe timestamp, **NON** snapshot-write counter, **NON** provider ordering token. La revision deve avanzare **atomicamente** con le mutation committed di `tenant_subscriptions`. Soluzione architetturale approvata **G1**: trigger DB locale + K2 mantenuto nella Edge Function (accoppiamento atomico mutation+bump nella stessa transazione PostgreSQL; preferito a RPC ampia). **Regola bump conservativa**: ogni INSERT/UPDATE/DELETE committed su `tenant_subscriptions` fa avanzare `billing_state_revision` del tenant interessato (UPDATE no-op può produrre bump extra: inefficiente ma corretto/safe). Ownership `tenant_id` immutabile/fail-closed; trigger futuro da progettare correttamente rispetto a OLD/NEW se mutazione `tenant_id` fosse tecnicamente possibile. **Snapshot CAS H2**: lo snapshot write **NON** incrementa `billing_state_revision`. Flusso base: (1) read revision = expected; (2) read `tenant_subscriptions` del tenant; (3) derive Snapshot(S); (4) UPDATE `tenants` snapshot WHERE tenant id AND `billing_state_revision = expected` (+ predicate D4); (5) CAS 0 row → readback/recompute/retry limitato; (6) solo dopo snapshot CAS accettato → mark `billing_event` processed. Double-read della revision: **non obbligatorio** (eventuale fail-fast; CAS finale = correctness boundary). **NON** introdurre ora `billing_snapshot_revision`. Forma M2 architetturale candidata (NON implementata): colonne W_sub su `tenant_subscriptions` (bigint NULL + text NULL); `tenants.billing_state_revision bigint NOT NULL DEFAULT 0`; funzione trigger locale + trigger sulle mutation. Migration futura additiva da `007_*`; nessun backfill remoto automatico; righe esistenti: revision default 0; W_sub nullable. **SECURITY DEFINER NON congelato** come requisito: security mode da verificare in migration; preferire least privilege; DEFINER solo se tecnicamente necessario (search_path fisso, privilegi minimi, review RLS). **Guardrail determinismo**: H2 presuppone Snapshot(S) deterministica rispetto agli input DB catturati/protetti; non dipendere da ordering Event, `event.id`, wall-clock, input esterno non versionato. **D4 technical guard**: `billing_state_revision` non protegge automaticamente `is_demo` / `plan_code` internal/demo / altri flag esterni al set subscription → snapshot CAS deve includere predicate/readback fail-closed; nessuna seconda revision per D4; `is_demo` **NON** scritto automaticamente dal billing webhook. I4.3B **NON IMPLEMENTATO** |
| **I4.3BB-bis** | Commit `169dfa4` — *docs(context): record subscription sync concurrency architecture*. Sync repository → mirror post-commit completata: dry-run OK; apply OK; verifica byte/hash **15/15**; cloud mirror verificato da ChatGPT; push `origin/main` completato; `main` e `origin/main` allineati; nessuna sync inversa; nessun `--delete`; nessuna modifica repository durante la sync |
| **I4.3BC — decisione prodotto subscription sync** | **CHIUSO** (ZERO-CODE / ZERO-DIFF). Decisione prodotto principale pre-implementazione. D3/D4/D5/D7/unpaid **non** più aperte. Congelati in questo task: **D5-B** (deterministic reducer sul set S; nessun physical winner / `current_subscription_id` / tie-break cronologico; rank `active > trialing > past_due > suspended-family > terminal-only > S vuoto`); semantica `plan_code`=tier commerciale/contratto vs `subscription_status`=lifecycle/accesso (es. `paid`+`suspended` intenzionale); entitlement futuro (`active`/`trialing` entitled; `past_due` entitled-with-warning/grace; `unpaid`/`paused`/`suspended`/`incomplete` no entitlement; `canceled`/`incomplete_expired` terminal/no entitlement; unknown FailClosed); **D3** nessun grace wall-clock post-terminale; `cancel_at_period_end=true` su active resta entitled finché provider non termina; non revocare via `current_period_end < now()`; **D4-A** demo/internal coerenti = ProtectedNoOp (subscription persistibile via K2; revision può avanzare; snapshot ProtectedNoOp; `is_demo` non scritto dal webhook; nessuna promozione automatica; incoerenze → FailClosed); **D7** Stripe trialing su prodotto paid → snapshot `plan_code=paid` + `subscription_status=trialing` + `trial_ends_at` (`plan_code=trial` resta trial manuale distinto, non alias); **unpaid** = no entitlement. M2/R2=**R-A** confermato. Feature gating ancora non implementato. Il package I4.3BC complessivo culmina in Snapshot(S) V3 / H2 CAS V2 (dettagli e correzioni in F1–F3). I4.3B **NON IMPLEMENTATO** |
| **I4.3BC-F1 — TM-A / IE-B / DP-A / TE-B / normalization boundary** | **CHIUSO** (ZERO-CODE / ZERO-DIFF). Congelati: **TM-A** trial manuale (se Guard.`plan_code=trial`: hard-fail prima; poi Preserve se S senza commercial-contract-assumed; altrimenti cede a D5); **IE-B** set-based canceled vs `incomplete_expired` (solo `incomplete_expired` → free/active/NULL; se presente `canceled` tra soli terminali → free/canceled/NULL; nessuna cronologia); unsupported Price/Product spostato nel **normalization boundary** (non entra come riga normale in Snapshot(S)); **DP-A** de-protection futura con reconciliation/recompute Snapshot(S) esplicita nello stesso workflow (H2/revision/predicate/readback), non attendere webhook; **TE-B** trialing con `trial_ends_at` NULL → FailClosed; più trialing validi → `MAX(trial_ends_at)`; se active domina → `trial_ends_at` snapshot = NULL |
| **I4.3BC-F2 — H2 CAS V2 / TenantGuard / suspended / SV-B / NP-A / sequencing** | **CHIUSO** (ZERO-CODE / ZERO-DIFF). **H2 CAS V2** + TenantGuard optimistic concurrency (**F2-A**): `billing_state_revision` non protegge da sola i campi Guard; expected predicates null-safe su `plan_code`/`subscription_status`/`is_demo`/`trial_ends_at` + tenant id + revision expected + predicate D4; CAS=0 → readback/recompute/retry limitato (`processed_at` NULL). Mapping esplicito `status=suspended` nella **suspended-family** (`unpaid`/`paused`/`suspended`/`incomplete`); `tenant_subscriptions.status=suspended` persistibile interno (non Stripe nativo); **NON** collassare unpaid/paused/incomplete → suspended in persistenza — lo snapshot ridotto mappa la famiglia a `suspended` quando domina. **SV-B** S vuoto ≠ solo-terminali (free/active+S vuoto OK; trial+S vuoto → TM-A Preserve; demo/internal ProtectedNoOp; altri Guard commerciali + S vuoto → FailClosed). Sequencing: **normalization prima** della mutation W_sub; **NormalizationFailClosed** non avanza W_sub / non muta business state / non sovrascrive snapshot / `processed_at` NULL; ROW_ABSENT INSERT solo post-normalization; 23505 → relookup/ownership/reclassify. **NP-A**: Stripe persisted `plan_code=paid` only nel reducer (`pro_monthly`→`paid`; free/trial/demo/internal su riga Stripe → FailClosed). Snapshot intermedia **V2** in F2, poi corretta a V3 in F3 |
| **I4.3BC-F3 — TM-A ordering / incomplete dual-role / Snapshot V3** | **CHIUSO** (ZERO-CODE / ZERO-DIFF). Correzione ordine: **TM-A prima** di D5/IE-B. **commercial-contract-assumed** = `active`/`trialing`/`past_due`/`unpaid`/`paused`/`suspended` (`suspended` incluso ai fini TM-A). **incomplete dual-role**: PRE-CONTRACT per overlay TM-A (non fa cedere trial); membro suspended-family nel reducer commerciale (tenant non preservato → no entitlement, snapshot paid/suspended). Snapshot(S) **V3** ordine finale congelato: PHASE 0 hard-fail → PHASE 1 ProtectedNoOp demo/internal → PHASE 2 TM-A → PHASE 3 D5 commercial reducer → PHASE 4 terminal/empty (IE-B / SV-B) solo se TM-A non ha Preserve. Rischio residuo D5-B accettato: riga non-terminale storica può dominare terminale (no chronology). Nessun blocker finale |
| **I4.3BC-bis** | Commit `83fbf24` — *docs(context): record subscription snapshot policy* |
| **I4.3BD — schema M2 additive migration** | **CHIUSO**. Commit `8246000` — *feat(billing): add subscription sync concurrency schema*. File: `supabase/migrations/007_billing_subscription_sync_concurrency.sql` (additiva su baseline `000`; archive 001–006 non richieste). Introduce esclusivamente: su `tenant_subscriptions` — `last_applied_provider_event_created_at bigint NULL`, `last_applied_provider_event_id text NULL` (W_sub); su `tenants` — `billing_state_revision bigint NOT NULL DEFAULT 0`; funzione `public.bump_tenant_billing_state_revision()`; trigger `trg_tenant_subscriptions_billing_state_revision` (AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW, SECURITY INVOKER, **nessun** SECURITY DEFINER). Bump: INSERT/DELETE un tenant; UPDATE stesso tenant un bump; UPDATE `tenant_id` A→B bump entrambi; over-invalidation su UPDATE logicamente no-op **intenzionale**. Fuori scope I4.3BD: Snapshot H2, mapper, webhook wiring, RLS/GRANT/indici/FK collaterali, apply remoto, deploy. Baseline `000` invariata. I4.3BD-F1 **non** necessario |
| **I4.3BD-T1 — test locale schema M2** | **PASS** (Supabase locale). Docker locale operativo; Supabase CLI 2.98.2; stack locale avviato; migration applicata **solo** in locale con `npx supabase migration up --local`; history locale 000+007; T1–T11 PASS (W_sub e `billing_state_revision` conformi; G1 metadata conforme; INSERT/UPDATE/DELETE bump; rollback transazionale; A→B bump entrambi; **T11** DELETE tenant + ON DELETE CASCADE PASS; nessun trigger preesistente su `public.tenants`; nessun RLS/GRANT/indice/FK collaterale; fixture rollbackate, nessun residuo). Nessun ambiente remoto toccato; nessun `supabase db push`; nessun deploy Edge Function; nessun test runtime Stripe/webhook. `git diff --check` PASS; nessun file repository modificato dal task di test |
| **I4.3BD-bis** | Commit `aa2b1e7` — *docs(context): record subscription concurrency schema*. Sync repository → mirror post-commit successivamente **completata e verificata**: dry-run PASS; apply PASS; verifica byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessuna sync inversa; nessun `--delete`. La precedente attestazione storica di sync «non attestata» è **risolta/verificata** (non riconciliazione silenziosa) |
| **I4.3BE — normalizzatore Stripe Subscription puro** | **CHIUSO**. Commit `0e42dd5` — *feat(billing): add Stripe subscription normalizer*. File: `supabase/functions/_shared/normalizeStripeSubscription.ts`, `supabase/functions/_shared/normalizeStripeSubscription_test.ts`. Mapper puro: **nessun** DB, Supabase client, Deno.env, Stripe API, HTTP, tenant resolver, persistence, W_sub nel mapper, Snapshot, H2, webhook wiring, `processed_at` completion, deploy, apply remoto migration 007. Contratto normalizzato: `provider_subscription_id`, `provider_customer_id`, `plan_code`, status dettagliato, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `trial_ends_at`. Decisioni: NP-A (`pro_monthly`→`paid`; Stripe trialing resta `plan_code=paid`); status dettagliati preservati (active/trialing/past_due/canceled/unpaid/incomplete/incomplete_expired/paused); unpaid/paused/incomplete **non** collassati a suspended; status inattesi fail-closed; metadata provider `plan_code` se presente deve essere esattamente `pro_monthly` (alias checkout `pro` rifiutato); metadata assente + Price ID configurato accettabile; mono-item (multi-item fail-closed); customer string o expanded object con `id`; timestamp Unix deterministici senza now/wall-clock; trialing senza `trial_end` valido fail-closed; timestamp fuori range Date fail-closed senza throw. Quality gate applicativi: `npm run lint` PASS; `npm run build` PASS; `git diff --check` PASS |
| **I4.3BE-F1** | **CHIUSO**. Corretti: (1) metadata `plan_code` troppo permissivo; (2) multi-item inizialmente accettato; (3) Date fuori range potenzialmente throwable. Nessun F2 necessario |
| **I4.3BE-T1 — test Deno del normalizzatore** | **PASS** (re-run finale). Primo tentativo **NON ESEGUITO** / bloccato da toolchain (Deno CLI non presente sull’host e non esposta dal container Supabase Edge Runtime) — **non** failure applicativa. Dopo installazione Deno via Homebrew: deno **2.9.5** host; `deno check` PASS; `deno test` PASS; **28** test eseguiti; **28 PASS**; **0 FAIL**; nessuna capability sensibile; repository invariato. Gap minore non bloccante: host 2.9.5 vs runtime Edge embedded osservato in precedenza 2.1.4 (senza CLI esposta) |
| **I4.3BE-bis** | Commit `613f3ed` — *docs(context): record Stripe subscription normalizer* |
| **I4.3BE-D1 — sync mirror post I4.3BE-bis** | **Completata e verificata**. Preflight conforme; dry-run PASS; apply PASS; **15** file; byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repository invariato. La precedente attestazione storica «sync I4.3BE-bis non eseguita» è **risolta/verificata** (non riconciliazione silenziosa). Push I4.3BE + I4.3BE-bis completato dall’utente; prima di I4.3BF, `main`/`origin/main` allineati a `613f3ed` |
| **I4.3BF — resolver tenant billing customer read-only** | **CHIUSO**. Commit `48782cd` — *feat(billing): add billing customer tenant resolver*. File: `supabase/functions/_shared/resolveBillingCustomerTenant.ts`, `supabase/functions/_shared/resolveBillingCustomerTenant_test.ts`. Funzione `resolveBillingCustomerTenant`: `provider` + `provider_customer_id` → SELECT-only su `public.tenant_billing_customers` → `tenant_id`. Trust boundary: `tenant_id` esclusivamente dalla mapping server-side; **nessun** fallback da `subscription.metadata.tenant_id`, event/customer metadata, frontend o payload provider come ownership. Read-only; provider-aware; nessun Stripe API / network proprio / Deno.env / write / webhook wiring / W_sub / persistence `tenant_subscriptions` / Snapshot / H2 / `processed_at` completion. Fail-closed: mapping unica valida → success; zero → `tenant_mapping_not_found`; più mapping → `tenant_mapping_ambiguous` (**non** sceglie la prima riga); errore query/throw → `tenant_mapping_lookup_failed`; mapping strutturalmente invalida → `tenant_mapping_invalid`; provider/customer id invalidi → `invalid_provider` / `invalid_provider_customer_id`. Identità esatta degli input (nessuna normalizzazione lower-case/trim silenziosa). Quality: `npm run lint` PASS; `npm run build` PASS; `deno check` PASS; `deno test` **11/11 PASS**; 0 FAIL; whitespace review Supervisor via `git diff --no-index --check` PASS; nessun I4.3BF-F1. Rischio minore non bloccante: interfaccia strutturale `BillingCustomerTenantLookupClient` non ancora compilata contro client Supabase reale (modulo non wired) |
| **I4.3BF-bis** | Commit `a16eeb8` — *docs(context): record billing customer tenant resolver* |
| **I4.3BF-D1 — sync mirror post I4.3BF-bis** | **Completata e verificata**. Preflight conforme; dry-run PASS; apply PASS; **15** file; byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repository invariato. La precedente attestazione storica «I4.3BF non pushato» / «sync I4.3BF-bis non eseguita» è **risolta/verificata** (non riconciliazione silenziosa). Push I4.3BF + I4.3BF-bis completato dall’utente; prima di I4.3BG, `main`/`origin/main` allineati a `a16eeb8` |
| **I4.3BG — Stripe Subscription refetch primitive (K2)** | **CHIUSO**. Commit `dc5cbcf` — *feat(billing): add Stripe subscription refetch primitive*. File: `supabase/functions/_shared/refetchStripeSubscription.ts`, `supabase/functions/_shared/refetchStripeSubscription_test.ts`. Funzione `refetchStripeSubscription`: `provider_subscription_id` → Stripe `subscriptions.retrieve(...)` → raw provider subscription result. Primo primitive applicativo provider-authoritative della strategia K2. Trust boundary: stato Subscription solo da nuova retrieve via dependency server-side; **nessun** fallback da `event.data.object`, subscription object webhook, `billing_events.payload`, metadata, snapshot locale precedente, cache/memoization. Ogni invocazione esegue una retrieve indipendente. Dependency injection strutturale `StripeSubscriptionRetrieveClient`; helper **non** importa Stripe SDK, **non** costruisce client, **non** legge Deno.env/secret, **non** usa rete propria oltre alla dependency, **non** usa DB/Supabase/tenant resolver/normalizer/W_sub/Snapshot/H2/`billing_events`/webhook wiring. Success `{ ok: true, subscription }`; fail-closed `invalid_provider_subscription_id` / `stripe_subscription_refetch_failed` / `stripe_subscription_refetch_invalid`; raw provider error non esposto. Input exact identity (stringa non vuota, non whitespace-only; nessun lower-case/trim sull’identità). null/undefined response → `stripe_subscription_refetch_invalid`. Validazione semantica Subscription resta di `normalizeStripeSubscription` (non duplicata nel primitive). **Non** implementa ancora CAS K2 / W_sub / orchestration. Quality: `npm run lint` PASS; `npm run build` PASS; `deno check` PASS; `deno test` **12/12 PASS**; 0 FAIL; nessuna capability `--allow-net`/`--allow-env`/`--allow-write`/`--allow-run`; whitespace review Supervisor via `git diff --no-index --check` sui due file untracked PASS; nessun I4.3BG-F1. Rischio minore non bloccante: compatibilità strutturale del vero client Stripe non ancora provata dal wiring reale (verificare compatibilità diretta senza cast artificiali `as StripeSubscriptionRetrieveClient`) |
| **I4.3BG-bis** | Commit `bb0f775` — *docs(context): record Stripe subscription refetch primitive* |
| **I4.3BG-D1 — sync mirror post I4.3BG-bis** | **Completata e verificata**. Preflight conforme; dry-run PASS; apply PASS; **15** file; byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repository invariato. La precedente attestazione storica «I4.3BG non pushato» / «sync I4.3BG-bis non eseguita» è **risolta/verificata** (non riconciliazione silenziosa). Push I4.3BG + I4.3BG-bis completato dall’utente; prima di I4.3BH, `main`/`origin/main` allineati a `bb0f775` |
| **I4.3BH — subscription event admission classifier (W_sub)** | **CHIUSO**. Commit `38e4280` — *feat(billing): add subscription event admission classifier*. File: `supabase/functions/_shared/classifySubscriptionEventAdmission.ts`, `supabase/functions/_shared/classifySubscriptionEventAdmission_test.ts`. Funzione `classifySubscriptionEventAdmission`: classificatore puro/deterministico del ramo di admission K2/W_sub. Input: `provider_event_created_at` (Event.created integer safe ≥ 0; **non** Subscription timestamp / snapshot freshness / wall-clock / `Date.now` / coercizione stringa); `provider_event_id` (exact identity; **nessun** trim/lower-case; **non** clock; **non** chronological/lessicographic tie-break); `billing_event_processed` (boolean); osservazione `tenant_subscriptions` = `ROW_ABSENT` **oppure** `ROW_PRESENT` con W_sub. **Non** esegue INSERT/UPDATE/CAS né il ramo classificato. Distinzione obbligatoria: `ROW_ABSENT` (futura INSERT) ≠ `ROW_PRESENT` con W NULL/NULL (futura conditional UPDATE/CAS). Classificazioni positive: `candidate_row_absent`; `candidate_row_present_uninitialized` (ROW_PRESENT W NULL/NULL); `candidate_newer_event` (Event.created > W.created); `stale_event` (Event.created < W.created); `candidate_equal_timestamp_distinct_event` (stesso created, ID diversi — indipendente dall’ordine lessicografico); `partial_retry` (W == Event AND `billing_event_processed=false` — guardrail I4.3BB-R-F1: **non** completed); `already_applied` (W == Event AND processed). Failure: `invalid_provider_event_created_at`; `invalid_provider_event_id`; `invalid_watermark` (half-null o W invalida; authority semantica del classifier — I4.3BI preserva half-null type-valid senza duplicarla); `inconsistent_same_event` (stesso event ID, created diverso). Puro: zero DB/Supabase/Stripe SDK/provider I/O/Deno.env/fetch/`Date.now`/wall-clock/mutable global/cache/memoization/webhook wiring/persistence/CAS/Snapshot/H2. Stesso input → stesso output. Quality: `npm run lint` PASS; `npm run build` PASS; warning Vite chunk size preesistente/non bloccante; `deno check` PASS; `deno test` **18/18 PASS**; 0 FAIL; nessuna capability `--allow-net`/`--allow-env`/`--allow-write`/`--allow-run`; whitespace review Supervisor via `git diff --no-index --check` sui due file untracked PASS; nessun I4.3BH-F1. Rischio minore non bloccante: `billing_event_processed` boolean non validato runtime nel classifier — futuro wiring deve convertire esplicitamente `processed_at` NULL/NOT NULL |
| **I4.3BH-bis** | Commit `57c7e00` — *docs(context): record subscription event admission classifier* |
| **I4.3BH-D1 — sync mirror post I4.3BH-bis** | **Completata e verificata**. Preflight conforme; dry-run PASS; apply PASS; **15** file; byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repository invariato. La precedente attestazione storica «I4.3BH non pushato» / «sync I4.3BH-bis non eseguita» è **risolta/verificata** (non riconciliazione silenziosa). Push I4.3BH + I4.3BH-bis completato dall’utente; prima di I4.3BI, `main`/`origin/main` allineati a `57c7e00` |
| **I4.3BI — tenant_subscriptions row observation reader** | **CHIUSO**. Commit `92fb6dd` — *feat(billing): add subscription observation reader*. File: `supabase/functions/_shared/readTenantSubscriptionObservation.ts`, `supabase/functions/_shared/readTenantSubscriptionObservation_test.ts`. Funzione `readTenantSubscriptionObservation`: reader server-side READ-ONLY della row observation `tenant_subscriptions` per K2. Input: `provider` + `provider_subscription_id` + client strutturale minimale. SELECT-only; filtri exact identity; campi letti `tenant_id` / `last_applied_provider_event_created_at` / `last_applied_provider_event_id`. Output: `ROW_ABSENT` (`kind=row_absent`, solo da zero righe) oppure `ROW_PRESENT` (`kind=row_present` + `tenant_id` + W_sub). **ROW_PRESENT** con W NULL/NULL resta present (**non** collassare in absent). Half-null strategy **A — preservation** (type-valid preserved; `invalid_watermark` resta di I4.3BH). `tenant_id` osservato; ownership finale **non** decisa (futuro confronto vs I4.3BF; mismatch fail-closed / no remap). Cardinalità: 0 ABSENT / 1 PRESENT / >1 `subscription_observation_ambiguous` fail-closed. Failures: `invalid_provider` / `invalid_provider_subscription_id` / `subscription_observation_lookup_failed` / `subscription_observation_ambiguous` / `subscription_observation_invalid`. Error sanitization senza raw detail. Zero write / Stripe / env / wall-clock / classifier / wiring / persistence / CAS / Snapshot / H2. Client strutturale `TenantSubscriptionObservationLookupClient` (from→select→eq→eq→PromiseLike). Quality: `npm run lint` PASS; `npm run build` PASS; warning Vite chunk size preesistente/non bloccante; `deno check` PASS; `deno test` **20/20 PASS**; 0 FAIL; nessuna capability sensibile; whitespace `git diff --no-index --check` PASS; review Supervisor PASS. Rischio minore non bloccante: compatibilità strutturale col client Supabase server-side reale non ancora provata dal wiring. Helper **NON WIRED** |
| **I4.3BI-F1** | **CHIUSO** — repository hygiene esclusivamente nel test: marker sintetici credential/token/path-like sostituiti da sentinel neutri `RAW_*`; reader applicativo byte-identico (SHA-256 `7bed5e5ea86c8ea184fd889a5f91aedeb2657515166735701d93763601d36614`); hygiene grep PASS; nessun I4.3BI-F2 |
| **I4.3BI-bis** | Commit `cc36c06` — *docs(context): record subscription observation reader* |
| **I4.3BI-D1 — sync mirror post I4.3BI-bis** | **Completata e verificata**. Preflight conforme; dry-run PASS; apply PASS; **15** file; byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repository invariato. La precedente attestazione storica «I4.3BI non pushato» / «sync I4.3BI-bis non eseguita» è **risolta/verificata** (non riconciliazione silenziosa). Push I4.3BI + I4.3BI-bis completato dall’utente; prima di I4.3BJ, `main`/`origin/main` allineati a `cc36c06` |
| **I4.3BJ — Stripe Subscription refetch→normalize composer** | **CHIUSO** (applicativo `e87462c`; documentale I4.3BJ-bis `e673840` su `origin/main` nel preflight I4.3BL-bis). Commit `e87462c` — *feat(billing): compose Stripe subscription refetch and normalization*. File: `supabase/functions/_shared/fetchNormalizedStripeSubscription.ts`, `supabase/functions/_shared/fetchNormalizedStripeSubscription_test.ts`. Funzione `fetchNormalizedStripeSubscription`: composer provider-authoritative che compone direttamente `refetchStripeSubscription` (I4.3BG) seguito da `normalizeStripeSubscription` (I4.3BE). Sequenza non negoziabile: `provider_subscription_id` → fresh Stripe retrieve via BG → normalize via BE → normalized subscription. Su failure BG: STOP; `stage=refetch`; reason originaria preservata; BE non eseguito. Su failure BE: STOP; `stage=normalize`; reason originaria preservata. Su success: normalized result di BE. Nessun fallback da `event.data.object` / `billing_events.payload` / snapshot/cache / payload webhook; nessuna duplicate normalization; nessuna seconda business interpretation; `provider_subscription_id` affidato a BG; config esplicita inoltrata a BE; nessun Deno.env / DB / Supabase / tenant resolution / ownership / row observation / classifier / W_sub / persistence / CAS / 23505 / Snapshot / H2 / `processed_at` / `billing_events` mutation / webhook wiring / deploy / apply remoto 007. Boundary TypeScript: BG success `subscription: unknown` → cast locale `unknown`→`StripeSubscriptionLike` → BE (accettato: non rimappa; non duplica validazione; semantica resta di BE; non finge compatibilità SDK). Descrizione corretta: composizione runtime interna BG→BE verificata; boundary TypeScript esplicito; compatibilità vero Stripe SDK **non** verificata fino al wiring reale. Quality: `npm run lint` PASS; `npm run build` PASS; warning Vite chunk size preesistente/non bloccante; `deno check` PASS; `deno test` **12/12 PASS**; 0 FAIL; regressione BG 12/12; regressione BE 28/28; nessuna capability sensibile; whitespace PASS; review Supervisor PASS dopo F1. Composer **NON WIRED** |
| **I4.3BJ-F1** | **CHIUSO** — esclusivamente test-only; composer byte-identico SHA-256 `ce252fca09b50076ae17c5a18b40bb3f6e9d527a982258b9d590e9bed03a13ea`; nessun F2. Corretti: (1) hygiene — rimossi marker sintetici credential/raw-detail-like problematici; hygiene check PASS; (2) test config — rimossa assertion sempre-vera; config corretta → success; config differente → `unsupported_price`; (3) test no-fallback — rimosso fake webhook/event inutilizzato; retrieve failure → `stage=refetch`; contratto pubblico failure = `ok`/`stage`/`reason` |
| **I4.3BJ-bis** | Commit `e673840` — *docs(context): record Stripe subscription composition*. Storia operativa: sync mirror post I4.3BJ-bis **non attestata** in I4.3BL-bis (non inventare). Osservazione Supervisor 10/08/2026: mirror Drive **stale** (snapshot pre-I4.3BJ-bis; vedi § Mirror). *Nota storica (SUPERATA):* al momento di I4.3BJ-bis/BL-bis era stata annotata la decisione «da I4.3BL-bis lo stato operativo non si committa più» — **SUPERATA / RISOLTA** da GOVERNANCE-9-F2 |
| **I4.3BL — Stripe Subscription pre-admission context orchestrator** | **CHIUSO**. Commit `2d9a639` — *feat(billing): add Stripe subscription pre-admission context*. File: `supabase/functions/_shared/resolveStripeSubscriptionPreAdmissionContext.ts`, `supabase/functions/_shared/resolveStripeSubscriptionPreAdmissionContext_test.ts` (solo questi due nel commit). Orchestrator read-only: **BJ → exact identity continuity → BF → BI → ownership fail-closed**. Bootstrap `provider_subscription_id` = unico input identità; BJ = stato provider fresh normalizzato; identity esatta bootstrap===normalized (prima di BF/BI); mismatch → `subscription_identity_mismatch`. Provenance: BF ← `normalized.provider_customer_id`; BI ← `normalized.provider_subscription_id`. BF solo da `tenant_billing_customers`; nessun metadata tenant fallback. `ROW_ABSENT` success; `ROW_PRESENT` same tenant success; different tenant → `subscription_ownership_mismatch`; W NULL/NULL resta PRESENT; half-null preservati senza semantica BH. Success → normalized + tenant BF + observation BI; failure BJ/BF/BI preservate. Nessun raw error esposto; nessun remap/upsert/first-row-wins; nessuna write/CAS/`processed_at`/BH/Event/webhook/Snapshot/H2/TenantGuard/Deno.env/Stripe SDK/wiring webhook. Quality: BL **12/12**; BJ **12/12**; BF **11/11**; BI **20/20**; `deno check` PASS; lint PASS; build PASS; warning chunk-size preesistente/non bloccante. Review Supervisor: diff reale completo; **39/39**; nessun F1. Helper **NON WIRED**. Post-commit applicativo: HEAD `2d9a639`; `origin/main` `e673840`; ahead 1; WT pulita; nessun push |
| **I4.3BL-bis / I4.3BL-bis-F1** | **Fatto storico** — aggiornamento locale di `docs/stato-operativo.md` con decisione «locale/non-commit» + sync BLOCCATA per incompatibilità clean-tree dello script; vietato `-bis-bis`. La policy «permanente non-commit / dirty intenzionale» è **SUPERATA / RISOLTA** da GOVERNANCE-9-F2; il contenuto applicativo I4.3BL registrato resta valido |

### In corso / incompleto

| Voce | Dettaglio |
|------|-----------|
| **I4.3A-T1 (test post-deploy)** | **CHIUSO COMPLESSIVAMENTE** — evidenza mista: T1A–T1E runtime PASS; T1F e T1G **CHIUSO SU EVIDENZA STATICA SUFFICIENTE** (non runtime PASS). Nessun residuo I4.3A-T1. **Non** dichiarare «I4.3A-T1 runtime PASS» nel complesso |
| **I4.3BA / I4.3BA-bis** | **Completate** — ricognizione + consolidamento documentale in `436d587`; sync mirror post-commit OK |
| **I4.3BB / I4.3BB-R / F1–F3 / I4.3BB-bis** | **Completate** (ZERO-CODE) — architettura anti-stale K2 + snapshot R2/A2; classificazione finale M2/R2=**R-A**; consolidamento documentale in `169dfa4`; sync mirror post-commit OK (15/15; push origin/main) |
| **I4.3BC / I4.3BC-F1 / I4.3BC-F2 / I4.3BC-F3 / I4.3BC-bis** | **CHIUSI** (ZERO-CODE / ZERO-DIFF + consolidamento) — policy prodotto congelate (D3/D4/D5/D7/unpaid); Snapshot(S) V3; H2 CAS V2; TM-A/IE-B/TE-B/DP-A/SV-B/NP-A. **Non** più nel backlog aperto. Consolidamento documentale in `83fbf24` |
| **I4.3BD / I4.3BD-T1 / I4.3BD-bis** | **CHIUSI** — schema M2 in repo (`007_billing_subscription_sync_concurrency.sql`, commit `8246000`); T1 PASS locale; apply **solo** locale; nessun apply remoto / deploy; I4.3BD-F1 non necessario. Consolidamento documentale in `aa2b1e7`; sync mirror post-commit completata e verificata (15/15; cloud OK) |
| **I4.3BE / I4.3BE-F1 / I4.3BE-T1 / I4.3BE-bis / I4.3BE-D1** | **CHIUSI** — normalizzatore puro Stripe Subscription (`0e42dd5`); F1 chiuso; T1 re-run `deno check` + `deno test` 28/28 PASS. Consolidamento documentale in `613f3ed`; sync mirror I4.3BE-D1 completata e verificata (15/15; cloud OK); push I4.3BE + I4.3BE-bis completato; `main`/`origin/main` allineati a `613f3ed` prima di I4.3BF |
| **I4.3BF / I4.3BF-bis / I4.3BF-D1** | **CHIUSI** — resolver tenant read-only (`48782cd`); 11/11 Deno PASS; consolidamento documentale in `a16eeb8`; sync mirror I4.3BF-D1 completata e verificata (15/15; cloud OK); push I4.3BF + I4.3BF-bis completato; `main`/`origin/main` allineati a `a16eeb8` prima di I4.3BG |
| **I4.3BG / I4.3BG-bis / I4.3BG-D1** | **CHIUSI** — provider re-fetch primitive (`dc5cbcf`); 12/12 Deno PASS; consolidamento documentale in `bb0f775`; sync mirror I4.3BG-D1 completata e verificata (15/15; cloud OK); push I4.3BG + I4.3BG-bis completato; `main`/`origin/main` allineati a `bb0f775` prima di I4.3BH. La precedente attestazione storica «I4.3BG non pushato» / «sync I4.3BG-bis non eseguita» è **risolta/verificata** |
| **I4.3BH / I4.3BH-bis / I4.3BH-D1** | **CHIUSI** — pure admission classifier W_sub (`38e4280`); 18/18 Deno PASS; consolidamento documentale in `57c7e00`; sync mirror I4.3BH-D1 completata e verificata (15/15; cloud OK); push I4.3BH + I4.3BH-bis completato; `main`/`origin/main` allineati a `57c7e00` prima di I4.3BI. La precedente attestazione storica «I4.3BH non pushato» / «sync I4.3BH-bis non eseguita» è **risolta/verificata** |
| **I4.3BI / I4.3BI-F1 / I4.3BI-bis / I4.3BI-D1** | **CHIUSI** — row observation reader read-only (`92fb6dd`); F1 hygiene test chiuso; 20/20 Deno PASS; consolidamento documentale in `cc36c06`; sync mirror I4.3BI-D1 completata e verificata (15/15; cloud OK); push I4.3BI + I4.3BI-bis completato; `main`/`origin/main` allineati a `cc36c06` prima di I4.3BJ. La precedente attestazione storica «I4.3BI non pushato» / «sync I4.3BI-bis non eseguita» è **risolta/verificata**. Helper **NON WIRED** |
| **I4.3BJ / I4.3BJ-F1 / I4.3BJ-bis** | **CHIUSI** — composer refetch→normalize (`e87462c`); F1 chiuso; I4.3BJ-bis `e673840` su `origin/main` (preflight I4.3BL-bis); storia: sync BJ-bis **non attestata**; osservazione Supervisor 10/08/2026: mirror Drive **stale** (pre-I4.3BJ-bis). Helper **NON WIRED** |
| **I4.3BL / I4.3BL-bis / I4.3BL-bis-F1** | **I4.3BL CHIUSO** applicativamente (`2d9a639`); **I4.3BL-bis / F1** = fatto storico documentale (decisione «locale/non-commit» **SUPERATA / RISOLTA** da GOVERNANCE-9-F2). Orchestrator read-only pre-admission **NON WIRED**. K2 complessivo ancora **NON** implementato |
| **GOVERNANCE-9 / F1 / F2 / 9-bis** | GOVERNANCE-9 + F1 consolidati in `a86e773`; F2 in `c9d9f1f`; **9-bis** = questo consolidamento (pending commit utente; hash non inventato) |
| **GOVERNANCE-8B** | **NON IMPLEMENTATO / DA RIVALUTARE** solo dopo WT pulita |
| **I4.3B (filone corrente)** | Sync `customer.subscription.*` → `tenant_subscriptions` + snapshot `tenants` — **NON COMPLETO** complessivamente. Completati: I4.3BD schema M2; I4.3BE normalizer; I4.3BF tenant resolver; I4.3BG refetch; I4.3BH classifier puro; I4.3BI observation reader (**NON WIRED**); I4.3BJ composer (**NON WIRED**); I4.3BL pre-admission orchestrator BJ→identity→BF→BI→ownership (**NON WIRED**). Restano **non** implementati: BH runtime; mapping/completion `processed_at`; persistence `tenant_subscriptions` (INSERT/conditional UPDATE/CAS/23505); Snapshot(S) V3 applicativa; H2 CAS V2 / TenantGuard; wiring webhook `customer.subscription.*`; deploy; apply remoto migration 007. Policy Snapshot V3 **congelate** ma **non** coded nel runtime. Invoice fuori scope del primo I4.3B. Eventi `customer.subscription.*` restano differiti (`processed_at` nullo). **Punto di ripresa:** chiudere ciclo governance (review GOVERNANCE-9-bis → commit utente → WT pulita → rivalutazione 8B → eventuale sync HOT) **prima** di riprendere I4.3B — non scegliere autonomamente |
| **Sync subscription** | Eventi `customer.subscription.*` / invoice: **solo persistiti** in `billing_events` con `processed_at` nullo; **non** risolvono `tenant_id` a runtime; **non** eseguono handler business; **non** aggiornano `tenant_subscriptions` né lo snapshot su `tenants`; rispondono HTTP 200 deferred. Architettura anti-stale/snapshot + policy prodotto progettate (K2+R-A+Snapshot V3+H2 V2); schema M2 presente in locale; normalizzatore puro presente; resolver helper read-only presente; provider re-fetch primitive presente; pure admission classifier presente; row observation reader presente (**NON WIRED**); composer refetch→normalize presente (**NON WIRED**); orchestrator pre-admission I4.3BL presente (**NON WIRED**); **non** wired a runtime |
| **Billing portal** | `create-billing-portal-session` → ancora `501 Not Implemented` |
| **Frontend checkout** | UI mostra “Gestione abbonamento in arrivo”; **non** invoca l’Edge Function |
| **Feature gating** | Non implementato |
| **Tenant switcher / inviti** | Non implementati da UI |
| **Smoke test post-H4** | Checklist produzione da chiudere manualmente se non già fatto |
| **Staging dedicato** | Spesso assente: lavoro fatto su produzione con cautela |
| **Docs drift** | Drift storico **ancora presente e non corretto**: `docs/production-readiness.md` e `docs/billing-data-model.md` (sezioni storiche; drift su unpaid/status). `docs/demo-tenant.md` de-protection/rollback dovrà allinearsi a DP-A prima di una futura promotion reale. Fuori scope di GOVERNANCE-9-bis |
| **Prerequisiti / limiti operativi mirror** | Config locale necessaria per ogni clone/macchina; `scripts/sync-ai-context-mirror.sh --apply` richiede WT **completamente pulita** (fail-closed). HOT/FULL = perimetro, non bypass. GOVERNANCE-8B **non** implementato. Con `M docs/stato-operativo.md` (ciclo 9-bis in corso) sync **BLOCCATA**; dopo commit → WT pulita → rivalutare sync HOT e 8B. Nessun workaround; Google Drive Desktop può richiedere tempo per propagare; lo script è versionato ma **non** nel perimetro mirror docs/rules |
| **Debito operativo `processed_at=NULL`** | Oggi significa sia deferred intenzionale sia evento incompleto — da affrontare separatamente; non in GOVERNANCE-9-bis |

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
  migrations/007_billing_subscription_sync_concurrency.sql  # I4.3BD / M2 (W_sub + billing_state_revision + G1); apply solo locale finora
  migrations_archive/001..006                  # storia; non replayare da zero
  functions/
    create-checkout-session/   # Stripe Checkout mode=subscription (test)
    create-billing-portal-session/  # 501
    stripe-webhook/            # firma + billing_events + correlazione tenant_billing_customers (I4.3A)
    _shared/auth.ts, http.ts
    _shared/normalizeStripeSubscription.ts       # I4.3BE mapper puro Stripe Subscription
    _shared/normalizeStripeSubscription_test.ts  # I4.3BE Deno tests (28)
    _shared/resolveBillingCustomerTenant.ts      # I4.3BF resolver tenant read-only
    _shared/resolveBillingCustomerTenant_test.ts # I4.3BF Deno tests (11)
    _shared/refetchStripeSubscription.ts         # I4.3BG provider-authoritative refetch primitive
    _shared/refetchStripeSubscription_test.ts    # I4.3BG Deno tests (12)
    _shared/classifySubscriptionEventAdmission.ts      # I4.3BH pure W_sub admission classifier
    _shared/classifySubscriptionEventAdmission_test.ts # I4.3BH Deno tests (18)
    _shared/readTenantSubscriptionObservation.ts       # I4.3BI read-only row observation reader
    _shared/readTenantSubscriptionObservation_test.ts  # I4.3BI Deno tests (20)
    _shared/fetchNormalizedStripeSubscription.ts       # I4.3BJ provider-authoritative refetch→normalize composer
    _shared/fetchNormalizedStripeSubscription_test.ts  # I4.3BJ Deno tests (12)
    _shared/resolveStripeSubscriptionPreAdmissionContext.ts       # I4.3BL read-only pre-admission orchestrator
    _shared/resolveStripeSubscriptionPreAdmissionContext_test.ts  # I4.3BL Deno tests (12)
  snippets/demo/, snippets/drafts/

scripts/
  sync-ai-context-mirror.sh    # sync controllata mirror (GOVERNANCE-7; HOT/FULL da GOVERNANCE-9)
```

**Vincolo migration:** dopo M8, nuove migration **additive**. `007_*` (I4.3BD/M2) è presente nel repository. Prossime additive da `008_*` o timestamp. **Non** editare la baseline `000_` per evoluzioni.

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
45. **I4.3BB-bis** — aggiornamento stato operativo dopo I4.3BB/R/F1–F3, consolidato in `169dfa4` — *docs(context): record subscription sync concurrency architecture*; sync mirror post-commit (dry-run/apply/byte-hash 15/15; cloud mirror verificato; push origin/main)
46. **I4.3BC** — decisione prodotto ZERO-CODE core: D5-B reducer set-based; plan_code vs subscription_status; entitlement; D3; D4-A; D7; unpaid; M2/R2=R-A. D3/D4/D5/D7/unpaid chiuse. Package complessivo culmina in Snapshot V3 (finale in F3)
47. **I4.3BC-F1** — TM-A trial manuale; IE-B canceled vs incomplete_expired; unsupported→normalization boundary; DP-A de-protection con recompute; TE-B trial_ends_at NULL FailClosed / MAX sui trial validi
48. **I4.3BC-F2** — H2 CAS V2 + TenantGuard predicates; suspended-family / status=suspended; SV-B; sequencing normalization-before-W_sub; NormalizationFailClosed; NP-A; Snapshot V2 intermedia
49. **I4.3BC-F3** — TM-A ordering prima di D5/IE-B; commercial-contract-assumed; incomplete dual-role; Snapshot(S) V3 PHASE 0–4; rischio storico D5-B accettato; nessun blocker finale
50. **I4.3BC-bis** — consolidamento documentale policy prodotto, consolidato in `83fbf24` — *docs(context): record subscription snapshot policy*
51. **I4.3BD** — schema M2 additive migration `007_billing_subscription_sync_concurrency.sql` (W_sub + `billing_state_revision` + trigger G1 SECURITY INVOKER), consolidato in `8246000` — *feat(billing): add subscription sync concurrency schema*; nessun wiring/deploy/apply remoto
52. **I4.3BD-T1** — test locale schema M2 **PASS** (`npx supabase migration up --local`; T1–T11 incluso CASCADE; fixture rollbackate; nessun remoto)
53. **I4.3BD-bis** — consolidamento documentale schema M2 + T1, consolidato in `aa2b1e7` — *docs(context): record subscription concurrency schema*; sync mirror post-commit successivamente completata e verificata (dry-run/apply/byte-hash 15/15; cloud OK)
54. **I4.3BE** — mapper puro Stripe Subscription (`normalizeStripeSubscription.ts` + test), consolidato in `0e42dd5` — *feat(billing): add Stripe subscription normalizer*; nessun DB/wiring/Snapshot/deploy
55. **I4.3BE-F1** — fix metadata/multi-item/Date-range fail-closed; **CHIUSO**; nessun F2
56. **I4.3BE-T1** — test Deno: primo tentativo bloccato toolchain (non failure); re-run PASS (`deno check`; `deno test` 28/28)
57. **I4.3BE-bis** — consolidamento documentale normalizzatore, consolidato in `613f3ed` — *docs(context): record Stripe subscription normalizer*
58. **I4.3BE-D1** — sync mirror controllata post I4.3BE-bis **completata e verificata** (dry-run/apply/byte-hash 15/15; cloud OK); push I4.3BE + I4.3BE-bis completato; `main`/`origin/main` allineati a `613f3ed` prima di I4.3BF
59. **I4.3BF** — resolver tenant billing customer read-only (`resolveBillingCustomerTenant.ts` + test), consolidato in `48782cd` — *feat(billing): add billing customer tenant resolver*; SELECT-only; trust boundary `tenant_billing_customers`; fail-closed; nessun wiring/K2/W_sub/Snapshot/H2
60. **I4.3BF-bis** — consolidamento documentale resolver, consolidato in `a16eeb8` — *docs(context): record billing customer tenant resolver*
61. **I4.3BF-D1** — sync mirror controllata post I4.3BF-bis **completata e verificata** (dry-run/apply/byte-hash 15/15; cloud OK); push I4.3BF + I4.3BF-bis completato; `main`/`origin/main` allineati a `a16eeb8` prima di I4.3BG. La precedente attestazione storica «I4.3BF non pushato» / «sync I4.3BF-bis non eseguita» è **risolta/verificata**
62. **I4.3BG** — provider-authoritative Stripe Subscription refetch primitive (`refetchStripeSubscription.ts` + test), consolidato in `dc5cbcf` — *feat(billing): add Stripe subscription refetch primitive*; DI strutturale; zero fallback/cache; zero wiring/W_sub/CAS
63. **I4.3BG-bis** — consolidamento documentale refetch primitive, consolidato in `bb0f775` — *docs(context): record Stripe subscription refetch primitive*
64. **I4.3BG-D1** — sync mirror controllata post I4.3BG-bis **completata e verificata** (dry-run/apply/byte-hash 15/15; cloud OK); push I4.3BG + I4.3BG-bis completato; `main`/`origin/main` allineati a `bb0f775` prima di I4.3BH. La precedente attestazione storica «I4.3BG non pushato» / «sync I4.3BG-bis non eseguita» è **risolta/verificata**
65. **I4.3BH** — pure W_sub admission classifier (`classifySubscriptionEventAdmission.ts` + test), consolidato in `38e4280` — *feat(billing): add subscription event admission classifier*; ROW_ABSENT ≠ present NULL/NULL; exact Event ID identity; nessun Event ID tie-break; partial_retry ≠ already_applied; zero I/O/persistence/CAS/Snapshot/H2/wiring
66. **I4.3BH-bis** — consolidamento documentale admission classifier, consolidato in `57c7e00` — *docs(context): record subscription event admission classifier*
67. **I4.3BH-D1** — sync mirror controllata post I4.3BH-bis **completata e verificata** (dry-run/apply/byte-hash 15/15; cloud OK); push I4.3BH + I4.3BH-bis completato; `main`/`origin/main` allineati a `57c7e00` prima di I4.3BI. La precedente attestazione storica «I4.3BH non pushato» / «sync I4.3BH-bis non eseguita» è **risolta/verificata**
68. **I4.3BI** — read-only tenant_subscriptions row observation reader (`readTenantSubscriptionObservation.ts` + test), consolidato in `92fb6dd` — *feat(billing): add subscription observation reader*; SELECT-only; ROW_ABSENT da zero righe; ROW_PRESENT NULL/NULL resta present; half-null strategy A; ambiguity fail-closed; zero write/classifier/wiring/CAS/Snapshot/H2
69. **I4.3BI-F1** — hygiene test-only (sentinel neutri `RAW_*`; reader SHA-256 invariato); **CHIUSO**; nessun F2
70. **I4.3BI-bis** — consolidamento documentale subscription observation reader, consolidato in `cc36c06` — *docs(context): record subscription observation reader*
71. **I4.3BI-D1** — sync mirror controllata post I4.3BI-bis **completata e verificata** (dry-run/apply/byte-hash 15/15; cloud OK); push I4.3BI + I4.3BI-bis completato; `main`/`origin/main` allineati a `cc36c06` prima di I4.3BJ. La precedente attestazione storica «I4.3BI non pushato» / «sync I4.3BI-bis non eseguita» è **risolta/verificata**
72. **I4.3BJ** — provider-authoritative refetch→normalize composer (`fetchNormalizedStripeSubscription.ts` + test), consolidato in `e87462c` — *feat(billing): compose Stripe subscription refetch and normalization*; BG→BE; fail-closed per stage; zero fallback/webhook/DB/wiring; boundary `unknown`→`StripeSubscriptionLike`
73. **I4.3BJ-F1** — test-only (hygiene + config forwarding + no-fallback); composer SHA-256 invariato; **CHIUSO**; nessun F2
74. **I4.3BJ-bis** — consolidamento documentale composition refetch→normalize, consolidato in `e673840` — *docs(context): record Stripe subscription composition* (ultimo commit `docs(context)` storico; su `origin/main` nel preflight I4.3BL-bis; storia: sync mirror **non attestata**; osservazione Supervisor 10/08/2026: mirror Drive **stale** pre-I4.3BJ-bis)
75. **I4.3BL** — orchestrator read-only pre-admission (`resolveStripeSubscriptionPreAdmissionContext.ts` + test), consolidato in `2d9a639` — *feat(billing): add Stripe subscription pre-admission context*; BJ→exact identity→BF→BI→ownership fail-closed; reasons `subscription_identity_mismatch` / `subscription_ownership_mismatch`; zero write/CAS/BH/Snapshot/H2/wiring; review Supervisor 39/39; nessun F1; **NON WIRED**; non pushato (ahead 1)
76. **I4.3BL-bis** — aggiornamento locale di `docs/stato-operativo.md`; **nessuna** sync Drive; *decisione storica* «stato operativo locale/non committato da questo checkpoint» — **SUPERATA / RISOLTA** da GOVERNANCE-9-F2 (non più normativa)
77. **I4.3BL-bis-F1** — fix documentale storico: esplicitata incompatibilità sync con working tree dirty (`docs/stato-operativo.md` tracked-modified); review DIFF necessaria ma non sufficiente; sync BLOCCATA; candidatura micro-task governance su workflow/script (poi **GOVERNANCE-8B**, ancora non implementato); mirror Drive verificato stale dal Supervisor il 10/08/2026
78. **GOVERNANCE-9** (include F1) — **CHIUSO / CONSOLIDATO** in `a86e773` — *chore(governance): restructure AI context workflow*: handoff HOT, context index, rule 000 compatta, mirror HOT/FULL, script HOT/FULL/`--status`/checksum/manifest, README; Drive mirror one-way; no sync auto; no `--delete`; no sync inversa
79. **GOVERNANCE-9-F2** — **CHIUSO / CONSOLIDATO** in `c9d9f1f` — *docs(governance): align AI context lifecycle*: handoff post-9; stato-operativo torna al lifecycle Git via `-bis`; obiettivo WT pulita; elimina modello «permanentemente locale/non-commit»
80. **GOVERNANCE-9-bis** — consolidamento di `docs/stato-operativo.md` (questo task): registra 9/F1/F2, modello HOT/WARM/COLD, SoT, lifecycle `-bis`, GOVERNANCE-8B da rivalutare, punto di ripresa; **hash commit futuro non inventato**; **nessuna** sync

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

### Punto di ripresa (sequenza governance → applicativo)

Sequenza successiva **decisa dal Supervisor** (non aprire automaticamente questi task):

1. Review Supervisor del DIFF **GOVERNANCE-9-bis**
2. Commit utente del **solo** `docs/stato-operativo.md` (hash futuro **non** inventato qui; **vietato** `-bis-bis`)
3. Verifica **working tree pulita**
4. Rivalutazione **GOVERNANCE-8B** (utilità reale sì/no — oggi **NON implementato**)
5. Solo successivamente eventuale **sync HOT** Drive (script ufficiale; WT pulita)
6. Successivamente ripresa del filone applicativo **I4.3B** dal punto corretto (helper fino a I4.3BL presenti e **NON WIRED**)

**Sync Drive:** **NON** eseguita in GOVERNANCE-9-bis. Mirror Drive più vecchio del repository = divergenza **attesa**. Nessuna riconciliazione inversa.

### Contesto filone I4.3B (subscription sync e tenant snapshot)

**I4.3A applicativo:** completato e consolidato in `18a4bf9`.

**I4.3A-D1:** deploy amministrativamente verificato — Edge Function `stripe-webhook` remota versione **4** su project ref `dormvfiwgzyzslxybetb` (da v3; `ACTIVE`; function ID invariato; comando nominativo eseguito una sola volta con exit code 0). Nessuna modifica locale durante D1. Nessun secret ruotato; nessuna altra funzione/DB/frontend toccati. Documentato in I4.3A-D1-bis (`751852b`).

**I4.3A-T1 complessivo:** **CHIUSO COMPLESSIVAMENTE** con evidenza mista. T1A–T1E = runtime PASS; T1F = chiusura statica; T1G = chiusura statica. **Non** dichiarare «I4.3A-T1 runtime PASS» nel complesso. **Nessun residuo** I4.3A-T1. I4.3A-T1G-bis consolidato in `30da6a5` — *docs(context): record webhook race static closure*.

**I4.3BA:** **completata** — ricognizione architetturale **zero-code**. I4.3BA-bis consolidato in `436d587` — *docs(context): record subscription sync architecture findings*; sync mirror post-commit: dry-run OK, apply OK, verifica byte/hash OK su 15 file; cloud mirror verificato da ChatGPT; nessuna sync inversa; nessun `--delete`.

**I4.3BB / I4.3BB-R / F1–F3:** **completati** (ZERO-CODE / ZERO-DIFF). I4.3BB-bis consolidato in `169dfa4` — *docs(context): record subscription sync concurrency architecture*; sync mirror post-commit: dry-run OK, apply OK, verifica byte/hash 15/15; cloud mirror verificato da ChatGPT; push `origin/main` completato; `main`/`origin/main` allineati; nessuna sync inversa; nessun `--delete`. Sintesi decisioni architetturali:

- **Anti-stale (I4.3BB + K2):** Event payload ≠ provider state; `event.created` = admission watermark per-subscription (non versione Subscription); `event.id` = id univoco (**non** clock; **non** ordinare lessicograficamente); strategia = provider re-fetch + admission watermark + CAS/readback/re-fetch; re-fetch da solo non elimina race; Event stale non sovrascrive; API Stripe down → no fallback payload webhook, `processed_at` NULL, HTTP 502 candidato; `customer.subscription.deleted` retrieve post-cancel supportato.
- **W_sub:** (`last_applied_provider_event_created_at`, `last_applied_provider_event_id`) — watermark di admission + CAS token; **non** freshness Stripe; **non** clock.
- **Partial retry (F1):** `processed_at` = unico commit marker Event; W_sub = prova effetto per-subscription; W_sub==Event AND `processed_at` NULL = partial (non completed); ROW_ABSENT ≠ ROW_PRESENT W NULL; INSERT + 23505 → re-lookup/ownership/riclassificazione; tenant diverso → fail-closed no remap.
- **Snapshot race (F2→F3):** read-all→derive→UPDATE insufficiente sotto concorrenza; CAS W_sub non protegge aggregato cross-sub; proposta F2 revision-on-snapshot writer = **superseded**.
- **R2 / A2 → R-A (F3 + I4.3BC):** `tenants.billing_state_revision` = generazione locale monotona del SET `tenant_subscriptions`; bump atomico via **trigger G1** su ogni INSERT/UPDATE/DELETE committed; K2 resta in Edge Function; snapshot CAS **H2** non incrementa revision; double-read non obbligatorio; `billing_snapshot_revision` non richiesta; forma M2 (colonne W_sub + revision + trigger) **implementata** in I4.3BD; SECURITY INVOKER scelto in migration (nessun SECURITY DEFINER); classificazione finale **M2/R2 = R-A**.

**I4.3BC / I4.3BC-F1 / I4.3BC-F2 / I4.3BC-F3:** **CHIUSI** (ZERO-CODE / ZERO-DIFF) — decisione prodotto pre-implementazione. D3/D4/D5/D7/unpaid **congelate** (non più backlog aperto). I4.3BC-bis consolidato in `83fbf24` — *docs(context): record subscription snapshot policy*.

**I4.3BD:** **CHIUSO**. Commit `8246000` — *feat(billing): add subscription sync concurrency schema*. Migration `supabase/migrations/007_billing_subscription_sync_concurrency.sql` presente nel repository. I4.3BD-T1 **PASS** su Supabase locale (`npx supabase migration up --local`; history 000+007; T1–T11 PASS; T11 CASCADE PASS; fixture rollbackate). Apply **solo** locale; **nessun** `supabase db push`; **nessun** apply remoto; **nessun** deploy Edge Function; **nessun** test runtime Stripe/webhook in I4.3BD. Produzione/remoto invariati. I4.3BD-F1 **non** necessario. I4.3BD-bis consolidato in `aa2b1e7` — *docs(context): record subscription concurrency schema*; sync mirror post-commit **completata e verificata**.

**I4.3BE:** **CHIUSO**. Commit `0e42dd5` — *feat(billing): add Stripe subscription normalizer*. Mapper puro Stripe Subscription (NP-A; NormalizationFailClosed; status dettagliati; mono-item; metadata canonicale; trial handling; timestamp deterministico). **Nessuna** persistence / wiring / Snapshot / H2 / tenant resolver / deploy. I4.3BE-F1 **CHIUSO**. I4.3BE-T1 **PASS** (re-run: `deno check` PASS; `deno test` 28/28 PASS; primo tentativo bloccato toolchain, non failure). I4.3BE-bis consolidato in `613f3ed` — *docs(context): record Stripe subscription normalizer*. Sync I4.3BE-D1 **completata e verificata**. Push I4.3BE + I4.3BE-bis completato dall’utente; prima di I4.3BF, `main`/`origin/main` allineati a `613f3ed`. La precedente formulazione storica «sync I4.3BE-bis non eseguita» / «push I4.3BE non attestato» è **risolta/verificata**.

**I4.3BF:** **CHIUSO**. Commit `48782cd` — *feat(billing): add billing customer tenant resolver*. Resolver read-only fail-closed: `provider` + `provider_customer_id` → SELECT su `tenant_billing_customers` → `tenant_id`. Trust boundary server-side esclusiva; zero metadata fallback; zero canonicalizzazione silenziosa; ambiguous non sceglie la prima riga; reasons sintetiche. **Nessun** webhook wiring / K2 / persistence / W_sub / Snapshot / H2 / `processed_at` completion. Quality: `npm run lint` PASS; `npm run build` PASS; `deno check` PASS; `deno test` 11/11 PASS; review Supervisor PASS (whitespace `git diff --no-index --check`); nessun I4.3BF-F1. Rischio minore non bloccante: `BillingCustomerTenantLookupClient` strutturale non ancora verificato contro client Supabase reale. I4.3BF-bis consolidato in `a16eeb8` — *docs(context): record billing customer tenant resolver*. Sync I4.3BF-D1 **completata e verificata**. Push I4.3BF + I4.3BF-bis completato dall’utente; prima di I4.3BG, `main`/`origin/main` allineati a `a16eeb8`. La precedente formulazione storica «I4.3BF non pushato» / «sync I4.3BF-bis non eseguita» è **risolta/verificata**.

**I4.3BG:** **CHIUSO**. Commit `dc5cbcf` — *feat(billing): add Stripe subscription refetch primitive*. Primitive K2 provider-authoritative: `provider_subscription_id` → Stripe `subscriptions.retrieve(...)` → raw provider result. DI strutturale `StripeSubscriptionRetrieveClient`; zero import SDK nel helper; una retrieve per invocazione; zero fallback payload/webhook/metadata/snapshot/cache; zero DB/Supabase/normalizer/resolver/W_sub/CAS/Snapshot/H2/webhook wiring; errori sanitizzati; input exact identity; null/undefined fail-closed. **Non** implementa CAS K2. Quality: `npm run lint` PASS; `npm run build` PASS; `deno check` PASS; `deno test` 12/12 PASS; review Supervisor PASS (whitespace `git diff --no-index --check` sui due file untracked); nessun I4.3BG-F1. Rischio minore non bloccante: compatibilità strutturale del vero client Stripe non ancora provata dal wiring reale (verificare diretta, senza cast artificiali). I4.3BG-bis consolidato in `bb0f775` — *docs(context): record Stripe subscription refetch primitive*. Sync I4.3BG-D1 **completata e verificata**. Push I4.3BG + I4.3BG-bis completato dall’utente; prima di I4.3BH, `main`/`origin/main` allineati a `bb0f775`. La precedente formulazione storica «I4.3BG non pushato» / «sync I4.3BG-bis non eseguita» è **risolta/verificata**.

**I4.3BH:** **CHIUSO**. Commit `38e4280` — *feat(billing): add subscription event admission classifier*. Classificatore puro/deterministico admission W_sub: input Event.created + Event.id + `billing_event_processed` + row observation (`ROW_ABSENT` vs `ROW_PRESENT`+W_sub); **non** esegue il ramo. Distinzioni: ROW_ABSENT ≠ present NULL/NULL; half-null → `invalid_watermark` (authority semantica del classifier); newer/stale solo da Event.created; equal ts + ID distinti → candidate (nessun tie-break lessicografico su event.id); same Event + not processed → `partial_retry` (**non** completed); same Event + processed → `already_applied`; same Event ID + ts diverso → `inconsistent_same_event`. Zero DB/Supabase/Stripe/I/O/persistence/CAS/Snapshot/H2/wiring. Quality: `npm run lint` PASS; `npm run build` PASS; warning Vite chunk size preesistente/non bloccante; `deno check` PASS; `deno test` 18/18 PASS; review Supervisor PASS (whitespace `git diff --no-index --check` sui due file untracked); nessun I4.3BH-F1. Rischio minore non bloccante: `billing_event_processed` boolean non validato runtime — futuro wiring da `processed_at` NULL/NOT NULL. I4.3BH-bis consolidato in `57c7e00` — *docs(context): record subscription event admission classifier*. Sync I4.3BH-D1 **completata e verificata**. Push I4.3BH + I4.3BH-bis completato dall’utente; prima di I4.3BI, `main`/`origin/main` allineati a `57c7e00`. La precedente formulazione storica «I4.3BH non pushato» / «sync I4.3BH-bis non eseguita» è **risolta/verificata**.

**I4.3BI:** **CHIUSO**. Commit `92fb6dd` — *feat(billing): add subscription observation reader*. Reader server-side READ-ONLY: `provider` + `provider_subscription_id` + client strutturale minimale → SELECT-only su `tenant_subscriptions` → `ROW_ABSENT` (zero righe) oppure `ROW_PRESENT` (`tenant_id` + W_sub). Exact identity input; nessun trim/lower-case. **ROW_PRESENT** NULL/NULL resta present. Half-null strategy **A — preservation** (type-valid; semantica `invalid_watermark` resta di I4.3BH). `tenant_id` osservato; ownership finale non decisa (futuro vs I4.3BF; mismatch fail-closed). Ambiguity >1 riga fail-closed. Error sanitization. Zero write/Stripe/env/classifier/wiring/persistence/CAS/Snapshot/H2. I4.3BI-F1 **CHIUSO** (hygiene test-only; reader SHA-256 invariato `7bed5e5ea86c8ea184fd889a5f91aedeb2657515166735701d93763601d36614`; nessun F2). Quality: `npm run lint` PASS; `npm run build` PASS; warning Vite chunk size preesistente/non bloccante; `deno check` PASS; `deno test` 20/20 PASS; review Supervisor PASS (whitespace `git diff --no-index --check` sui due nuovi file); rischio minore non bloccante: `TenantSubscriptionObservationLookupClient` non ancora verificato contro client Supabase reale. I4.3BI-bis consolidato in `cc36c06` — *docs(context): record subscription observation reader*. Sync I4.3BI-D1 **completata e verificata**. Push I4.3BI + I4.3BI-bis completato dall’utente; prima di I4.3BJ, `main`/`origin/main` allineati a `cc36c06`. La precedente formulazione storica «I4.3BI non pushato» / «sync I4.3BI-bis non eseguita» è **risolta/verificata**. Helper **NON WIRED**.

**I4.3BJ:** **CHIUSO**. Commit `e87462c` — *feat(billing): compose Stripe subscription refetch and normalization*. Composer provider-authoritative: `refetchStripeSubscription` (I4.3BG) → `normalizeStripeSubscription` (I4.3BE). Sequenza non negoziabile; fail-closed per stage (`refetch` / `normalize`) con reason originaria preservata; su failure BG, BE non eseguito. Nessun fallback webhook/payload/snapshot/cache; nessuna duplicate normalization; config esplicita inoltrata a BE; nessun Deno.env/DB/Supabase/tenant/ownership/observation/classifier/W_sub/persistence/CAS/Snapshot/H2/wiring/deploy. Boundary TypeScript: BG `subscription: unknown` → cast locale `unknown`→`StripeSubscriptionLike` → BE (accettato: non rimappa; validazione semantica resta di BE; non prova compatibilità SDK). I4.3BJ-F1 **CHIUSO** (test-only; composer SHA-256 invariato `ce252fca09b50076ae17c5a18b40bb3f6e9d527a982258b9d590e9bed03a13ea`; nessun F2). Quality: lint/build PASS; warning chunk-size preesistente/non bloccante; `deno check` PASS; BJ 12/12; regressione BG 12/12; BE 28/28; review Supervisor PASS dopo F1. Composer **NON WIRED**.

**I4.3BJ-bis:** consolidato in `e673840` — *docs(context): record Stripe subscription composition*. Ultimo commit `docs(context)` storico su Git; presente su `origin/main` nel preflight I4.3BL-bis. Storia operativa: sync mirror post I4.3BJ-bis **non attestata** in I4.3BL-bis (non inventare). Osservazione Supervisor 10/08/2026: mirror Drive verificato **stale** (snapshot ancora pre-I4.3BJ-bis).

**I4.3BL:** **CHIUSO**. Commit `2d9a639` — *feat(billing): add Stripe subscription pre-admission context*. File: `resolveStripeSubscriptionPreAdmissionContext.ts` + `_test.ts` (unicamente questi due nel commit). Orchestrator read-only pre-admission: **BJ → exact identity continuity → BF → BI → ownership fail-closed**. Contratto essenziale: bootstrap `provider_subscription_id` = unico input identità subscription; BJ produce stato provider fresh normalizzato; `normalized.provider_subscription_id` deve essere esattamente uguale al bootstrap; mismatch → `subscription_identity_mismatch` **prima** di BF e BI; BF usa `normalized.provider_customer_id` (solo mapping `tenant_billing_customers`; nessun metadata tenant fallback); BI usa `normalized.provider_subscription_id`; `ROW_ABSENT` = success read-only; `ROW_PRESENT` stesso tenant = success; `ROW_PRESENT` tenant differente → `subscription_ownership_mismatch`; `ROW_PRESENT` W NULL/NULL resta PRESENT; half-null preservati **senza** semantica BH; success restituisce normalized + tenant BF + observation BI; failure BJ/BF/BI preservate senza reinterpretazione; nessun raw provider/DB error esposto; nessun remap/upsert/first-row-wins; nessuna write; nessun CAS; nessun `processed_at`; nessun classifier BH; nessun Event/event.data/webhook payload; nessun Snapshot V3; nessun H2/TenantGuard; nessun Deno.env; nessun nuovo import Stripe SDK; nessun wiring in `stripe-webhook/index.ts`. Quality: BL **12/12** PASS; regressione BJ **12/12**; BF **11/11**; BI **20/20**; `deno check` PASS; `npm run lint` PASS; `npm run build` PASS; warning Vite chunk-size preesistente/non bloccante; whitespace nuovi file OK. Review Supervisor: diff reale completo revisionato; **39/39** check obbligatori; nessun I4.3BL-F1. Stato Git post-commit applicativo (prima di questo documentale): `main`; HEAD `2d9a639`; `origin/main` `e673840`; ahead 1; working tree pulita; **nessun push**. Helper **NON WIRED**.

**I4.3BL-bis / I4.3BL-bis-F1 (fatto storico):** aggiornamento locale di `docs/stato-operativo.md` con decisione «locale/non Git / non commit `docs(context)`» e sync BLOCCATA per incompatibilità clean-tree. Quella policy è **SUPERATA / RISOLTA** da **GOVERNANCE-9-F2** (`c9d9f1f`): lo stato operativo torna al lifecycle Git tramite task `-bis` → review → commit utente → obiettivo WT pulita. Il contenuto applicativo I4.3BL registrato resta valido. **GOVERNANCE-8B** (eccezione dirty-state allo script) resta **NON IMPLEMENTATO / DA RIVALUTARE** post clean tree.

**GOVERNANCE-9 (include F1):** **CHIUSO / CONSOLIDATO** in `a86e773` — *chore(governance): restructure AI context workflow*. Handoff HOT; context index; rule 000; mirror HOT/FULL; script HOT/FULL/`--status`/checksum/manifest; README; Drive one-way; no sync auto/`--delete`/inversa.

**GOVERNANCE-9-F2:** **CHIUSO / CONSOLIDATO** in `c9d9f1f` — *docs(governance): align AI context lifecycle*.

**GOVERNANCE-9-bis:** questo consolidamento di `docs/stato-operativo.md` (pending review+commit; hash **non** inventato).

**I4.3B:** **NON COMPLETO** complessivamente. Completati: I4.3BD schema M2; I4.3BE normalizer; I4.3BF tenant resolver; I4.3BG refetch; I4.3BH classifier puro; I4.3BI observation reader (**NON WIRED**); I4.3BJ composer (**NON WIRED**); I4.3BL pre-admission orchestrator BJ→identity→BF→BI→ownership (**NON WIRED**). Restano **non** implementati: BH runtime; mapping/completion `processed_at`; persistence `tenant_subscriptions` (INSERT/conditional UPDATE/CAS/23505/CAS failure readback); nuovo provider re-fetch dopo CAS failure; bounded retry; partial_retry downstream; Snapshot(S) V3 applicativa; H2 CAS V2 / TenantGuard; wiring `customer.subscription.created|updated|deleted`; valorizzazione `billing_events.tenant_id` nel path subscription; runtime/deploy; apply remoto migration 007. Invoice fuori scope del primo I4.3B. Eventi `customer.subscription.*` restano differiti. K2 congelato resta: provider re-fetch + admission watermark W_sub + CAS/readback + re-fetch post-CAS + retry limitato — I4.3BG/BH/BI/BJ/BL sono helper; runtime wiring / persistence / CAS / admission execution restano assenti.

**Filone corrente: I4.3B** — subscription sync e tenant snapshot (**NON COMPLETO**). Helper fino a I4.3BL presenti e **NON WIRED**. Restano fuori: BH runtime, processed_at, persistence, CAS, 23505, Snapshot V3, H2, TenantGuard, webhook wiring, deploy, migration 007 remota. **Ripresa applicativa solo dopo** chiusura ciclo governance (vedi punto di ripresa sopra); **NON** scegliere autonomamente il prossimo slice; **NON** anticipare BH/persistence/CAS/Snapshot/webhook.

#### Decisioni prodotto congelate (I4.3BC)

| ID | Decisione | Sintesi congelata |
|----|-----------|-------------------|
| **D5-B** | Reducer set-based | Snapshot commerciale derivato dall’intero set S persistito/normalizzato. Nessun physical winner / `current_subscription_id` / tie-break cronologico. Non usare per ranking: `event.created`, `event.id`, W_sub, `updated_at`, ordine fisico righe, `provider_subscription_id` lessicografico, `current_period_end`, `now()`. Righe equivalenti con stesso output → nessun winner |
| **plan_code vs status** | Semantica campi | `plan_code` = tier commerciale/contratto; `subscription_status` = lifecycle/accesso corrente. Combinazioni come `paid`+`suspended` intenzionali. Feature gating ancora non implementato |
| **Entitlement** | Semantica futura | `active`/`trialing` = entitled; `past_due` = entitled-with-warning/grace; `unpaid`/`paused`/`suspended`/`incomplete` = no entitlement; `canceled`/`incomplete_expired` = terminal/no entitlement; unknown = FailClosed |
| **D7** | Stripe trialing | Stripe trialing su prodotto commerciale paid → snapshot `plan_code=paid`, `subscription_status=trialing`, `trial_ends_at` derivato. `plan_code=trial` = trial manuale/readiness interno — **non** alias di Stripe trialing |
| **TE-B** | trial_ends_at | Trialing che richiede `trial_ends_at` ma ha NULL → FailClosed. Più trialing validi → `MAX(trial_ends_at)`. Se active domina → `trial_ends_at` snapshot = NULL |
| **D3** | Terminali / grace | Nessun grace applicativo wall-clock dopo status provider terminale. `cancel_at_period_end=true` su `active` resta entitled finché provider non porta a terminale. Non revocare via `current_period_end < now()` |
| **IE-B** | Solo terminali | Se TM-A non Preserve: solo `incomplete_expired` → free/active/NULL; se tra soli terminali è presente `canceled` → free/canceled/NULL; `canceled`+`incomplete_expired` → free/canceled/NULL. Set-based; nessuna cronologia |
| **D4-A** | Demo/internal | Coerenti: subscription provider persistibile via K2; `billing_state_revision` può avanzare; snapshot = ProtectedNoOp; `is_demo` non scritto dal webhook; nessuna promozione automatica; Event può diventare processed. Incoerenze (`is_demo=true`+plan≠demo; `is_demo=false`+plan=demo; `internal`+`is_demo=true`) → FailClosed. Demo coerente / internal coerente → ProtectedNoOp |
| **DP-A** | De-protection | Futura operazione controllata che rimuove protezione demo/internal deve includere reconciliation/recompute Snapshot(S) nello stesso workflow (o subito dopo) con H2/revision/predicate/readback, **prima** di considerare completata la de-protection. Non attendere webhook. **Non** implementa oggi la promozione |
| **TM-A** | Trial manuale | Se Guard.`plan_code=trial`: hard-fail prima; poi se S senza commercial-contract-assumed (`active`/`trialing`/`past_due`/`unpaid`/`paused`/`suspended`) → Preserve trial (anche S vuoto / incomplete / terminal-only); se almeno una commercial-contract-assumed → cede a D5. incomplete = pre-contract per TM-A ma suspended-family per D5 |
| **SV-B** | S vuoto | S vuoto ≠ solo-terminali. Guard free/active/`is_demo=false` + S vuoto → free/active/NULL. Guard trial + S vuoto → TM-A Preserve. Demo/internal coerenti → ProtectedNoOp. Altri Guard commerciali (paid/*, free/canceled, free/suspended, …) + S vuoto → FailClosed/DataInconsistency. Non degradare silenziosamente paid→free |
| **NP-A** | Stripe plan | Primo I4.3B: solo prodotto Stripe `pro_monthly` → tier interno `paid`. Riga Stripe nel reducer con `plan_code` free/trial/demo/internal → FailClosed/DataInconsistency (no rinormalizzazione silenziosa). Non riguarda TenantGuard.plan_code trial/demo/internal |
| **Normalization** | Boundary pre-W_sub | Unsupported/ambiguous non entra in Snapshot(S). Solo dopo normalization valida: INSERT/CAS W_sub + G1 + Snapshot + H2 + `processed_at`. NormalizationFailClosed: non muta business state, non avanza W_sub, non sovrascrive snapshot, `processed_at` NULL |
| **Suspended** | Persistito vs ridotto | `tenant_subscriptions.status=suspended` = valore persistibile interno (non Stripe nativo). **NON** collassare unpaid/paused/incomplete → suspended in persistenza. Lo **snapshot** su `tenants.subscription_status` mappa suspended-family → `suspended` quando domina |

#### Snapshot(S) V3 — ordine finale congelato

1. **PHASE 0 — Input validity / hard fail:** Guard demo/internal incoerente; NP-A violation; unknown; trialing con `trial_ends_at` NULL; altre incoerenze strutturali → FailClosed.
2. **PHASE 1 — Protected operational tenants:** demo coerente / internal coerente → ProtectedNoOp.
3. **PHASE 2 — Manual trial overlay TM-A:** se Guard.`plan_code=trial` e nessuna commercial-contract-assumed in S → Preserve e STOP; altrimenti proseguire.
4. **PHASE 3 — Commercial reducer D5:** rank `active > trialing > past_due > suspended-family > terminal-only > S-empty`; suspended-family = `unpaid`/`paused`/`suspended`/`incomplete` (incomplete qui in family, ma **non** commercial-contract-assumed in PHASE 2).
5. **PHASE 4 — terminal / empty:** solo se TM-A non ha Preserve — IE-B / SV-B. Nessuna chronology/timestamp/order.

#### H2 CAS V2 — TenantGuard concurrency (congelato)

`billing_state_revision` protegge mutation del set `tenant_subscriptions`, non da sola i campi TenantGuard. H2 usa optimistic-concurrency predicates null-safe su set minimo: `plan_code`, `subscription_status`, `is_demo`, `trial_ends_at` + tenant id + revision expected + predicate D4. CAS=0 → readback Guard/revision → reread/recompute S → retry limitato → altrimenti fail/retry Event (`processed_at` NULL). Nessuna nuova tenant-wide revision.

#### M2 / R2 = R-A (schema implementato in I4.3BD; runtime I4.3B ancora assente)

- `tenant_subscriptions`: `last_applied_provider_event_created_at bigint NULL`; `last_applied_provider_event_id text NULL` — **presenti** in migration `007`
- `tenants`: `billing_state_revision bigint NOT NULL DEFAULT 0` — **presente** in migration `007`
- Trigger G1: `trg_tenant_subscriptions_billing_state_revision` → `public.bump_tenant_billing_state_revision()` (AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW, **SECURITY INVOKER**); bump anche su UPDATE logicamente no-op (intenzionale); UPDATE `tenant_id` A→B bump entrambi
- Snapshot H2 **non** incrementa revision (H2 resta da implementare in I4.3B)
- Nessun: `billing_snapshot_revision`, `current_subscription_id`, job temporale obbligatorio, nuova tenant revision
- SECURITY DEFINER: **non** introdotto; INVOKER sufficiente per writer server-side
- Apply: **solo locale** (I4.3BD-T1); remoto/produzione **non** aggiornati

#### Determinismo Snapshot V3 (sintesi invarianti)

Stesso Guard + stesso S → stesso output; ordine righe irrilevante; `event.created`/`event.id`/`updated_at`/`provider_subscription_id`/`now()` non nel business rank; `cancel_at_period_end` senza timer; trialing→active e canceled effettivo via stato provider; righe equivalenti senza tie arbitrario; TM-A preserva trial con S vuoto/incomplete/terminal-only; unsupported fallisce pre-Snapshot; de-protection non attende webhook; invalid trial_end non mascherato; TenantGuard CAS evita lost update manuali; suspended output deterministico; paid + S vuoto non degrada a free; NormalizationFailClosed non avanza W_sub; Stripe plan incompatibile non reinterpretato; partial retry non riapplica mutation; TM-A precede IE-B; hard-fail precede Preserve.

**I4.3B:** **NON COMPLETO** complessivamente. Completati: I4.3BD schema M2; I4.3BE normalizer; I4.3BF tenant resolver; I4.3BG refetch; I4.3BH classifier puro; I4.3BI observation reader (**NON WIRED**); I4.3BJ composer (**NON WIRED**); I4.3BL pre-admission orchestrator BJ→identity→BF→BI→ownership (**NON WIRED**). Restano **non** implementati: BH runtime; mapping/completion `processed_at`; persistence `tenant_subscriptions` (INSERT/conditional UPDATE/CAS/23505/CAS failure readback); nuovo provider re-fetch dopo CAS failure; bounded retry; partial_retry downstream; Snapshot(S) V3 applicativa; H2 CAS V2 / TenantGuard; wiring `customer.subscription.created|updated|deleted`; valorizzazione `billing_events.tenant_id` nel path subscription; runtime/deploy; apply remoto migration 007. Invoice fuori scope del primo I4.3B. Eventi `customer.subscription.*` restano differiti. K2 congelato resta: provider re-fetch + admission watermark W_sub + CAS/readback + re-fetch post-CAS + retry limitato — I4.3BG/BH/BI/BJ/BL sono helper; runtime wiring / persistence / CAS / admission execution restano assenti.

**Filone corrente: I4.3B** — subscription sync e tenant snapshot (**NON COMPLETO**). Helper fino a I4.3BL presenti e **NON WIRED**. Restano fuori: BH runtime, processed_at, persistence, CAS, 23505, Snapshot V3, H2, TenantGuard, webhook wiring, deploy, migration 007 remota. **Ripresa applicativa solo dopo** chiusura ciclo governance (review GOVERNANCE-9-bis → commit → WT pulita → rivalutazione 8B → eventuale sync HOT); **NON** scegliere autonomamente il prossimo slice; **NON** anticipare BH/persistence/CAS/Snapshot/webhook.

Vincoli permanenti da mantenere:

- Stripe esclusivamente in **test mode**
- Billing **tenant-first**
- Secrets e `service_role` esclusivamente **server-side**; nessun secret in `VITE_*`
- `billing_events` **non** leggibile direttamente dal frontend; nessuna scrittura billing privilegiata dal frontend
- Nessun avvio della sincronizzazione `tenant_subscriptions` o snapshot `tenants` senza task esplicito I4.3B + approvazione wiring
- Protezione `is_demo` / `plan_code=demo|internal` da sovrascritture commerciali automatiche (fail-closed; D4-A / DP-A)
- Nessun uso di Stripe **live**
- Nessuna modifica della baseline `supabase/migrations/000_baseline_current_schema.sql`
- Future migration soltanto **additive** da `008_*` o timestamp equivalente — **non** creare migration finché non autorizzata
- Nessun `supabase db push` come scorciatoia operativa; eventuali operazioni DB remote richiedono task dedicato e autorizzazione esplicita
- Migration `007` già nel repo: apply remoto **non** autorizzato finché non deciso esplicitamente

### I4.3B (fase corrente del filone, non completa)

**I4.3B — subscription sync e tenant snapshot** (schema M2 + BE/BF/BG/BH/BI/BJ + orchestrator pre-admission BL già in repo; runtime wiring/persistence ancora da implementare in micro-task successivi)

Punti ancora da implementare (non trasformare in implementazione in questo consolidamento documentale; **non** scegliere il prossimo slice qui):

- Runtime wiring dell’orchestrator I4.3BL / path subscription/webhook (helper BL già presente; **non** wired)
- BH runtime / classifier invocation runtime (classifier puro già in I4.3BH; ramo classificato non eseguito)
- Conversione `processed_at` NULL/NOT NULL → `billing_event_processed` boolean per il classifier
- Admission branch execution
- Persistence / CAS di `tenant_subscriptions` con protezione K2 (INSERT; conditional UPDATE; 23505 relookup/ownership/reclassification; CAS failure readback)
- Nuovo provider re-fetch dopo CAS failure se l’Event resta candidato; bounded retry; partial_retry downstream
- Eventi `customer.subscription.created|updated|deleted` (oggi solo persistiti, `processed_at` nullo) — wiring handler
- Gestione partial/incomplete downstream (guardrail F1: W_sub==Event AND `processed_at` NULL = partial, **non** completed; non riscrivere ciecamente subscription; I4.3BI osserva soltanto W_sub e **non** cambia questa semantica)
- Snapshot CAS H2 V2 (TenantGuard predicates) — G1/`billing_state_revision` già nello schema; reducer Snapshot(S) V3 ancora da coded
- Mapping esplicito degli stati normalizzati verso `tenants.subscription_status` secondo Snapshot V3 / D5-B (il mapper puro preserva già status dettagliati e NP-A `plan_code=paid`)
- Protezione dei tenant `demo` e `internal` (D4-A / DP-A) nel path runtime
- Gestione di `trial_ends_at` e semantica trialing a livello Snapshot (D7 / TE-B / TM-A; il mapper puro già fail-closed su trial_end invalido)
- Piano interno dopo canceled / incomplete_expired (D3 / IE-B) a livello Snapshot
- Mapping snapshot `unpaid` / suspended-family (persistenza **non** collassa; riduttore Snapshot sì)
- Valorizzazione `billing_events.tenant_id` nel path subscription
- `processed_at` completion del path subscription
- Runtime/deploy; apply remoto migration 007
- Eventi invoice inizialmente fuori scope, salvo decisione esplicita

**Già implementato nel filone (non ripetere come assente):** schema M2/W_sub/revision/G1 (I4.3BD); normalizzatore puro Stripe Subscription con NP-A / NormalizationFailClosed / mono-item / metadata canonicale (I4.3BE); resolver tenant read-only fail-closed su `tenant_billing_customers` (I4.3BF); provider-authoritative Stripe Subscription refetch primitive `refetchStripeSubscription` (I4.3BG); pure W_sub admission classifier `classifySubscriptionEventAdmission` (I4.3BH); read-only row observation reader `readTenantSubscriptionObservation` (I4.3BI); composer provider-authoritative refetch→normalize `fetchNormalizedStripeSubscription` (I4.3BJ) — **non** elencare più la composition helper refetch→normalize come totalmente assente; distinguere: helper/composer **implementato**, runtime wiring/orchestration del composer **ancora assente**; restano assenti runtime wiring del composer / del reader / del resolver / ownership check / persistence / CAS / orchestration K2.

### Altri passi (dopo I4.3B o in parallelo se priorità diversa)

1. **I5** — implementare `create-billing-portal-session` (authz già presente).
2. **UI** — CTA checkout/portal solo per ruolo `admin`/`billing`, chiamando le EF (senza secret client).
3. **Doc sync** — aggiornare `docs/billing-data-model.md` e `docs/production-readiness.md` (drift storico ancora aperto; drift unpaid/status) e sezione “prossimi passi” di `docs/saas-refactor-plan.md` allo stato post-I4.3; allineare `docs/demo-tenant.md` a DP-A prima di promotion reale.
4. **Prodotto SaaS non-billing**: tenant switcher, inviti, test RLS cross-tenant (`docs/saas-rls-test-plan.md`).
5. **Debito operativo** — distinguere semanticamente `processed_at=NULL` deferred vs incompleto (separato da I4.3B); lifecycle temporale del trial manuale fuori I4.3B.

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
| Decisioni aperte (al momento BA) | D3/D4/D5/D7/unpaid; **D5 bloccante** — **chiuse** successivamente in I4.3BC |
| Invoice | Fuori scope primo I4.3B |
| I4.3B | **NON IMPLEMENTATO** |
| Sync mirror post I4.3BA-bis | dry-run OK; apply OK; byte/hash OK su 15 file; cloud mirror verificato ChatGPT |
| `npm run lint` / `npm run build` / `deno check` | **Non necessari** (task documentale/ricognizione) |

### I4.3BB / I4.3BB-R / F1–F3 (architettura anti-stale + snapshot)

Registrati dai report ZERO-CODE / ZERO-DIFF (nessuna modifica repository) e dalla chiusura documentale I4.3BB-bis (`169dfa4`):

| Gate | Esito |
|------|--------|
| Modalità | Ricognizione/decisione architetturale **zero-code**; **nessuna** implementazione |
| Runtime / migration / deploy / secret | **Non** eseguiti |
| Strategia anti-stale | Provider re-fetch + admission watermark + CAS/readback/re-fetch (**K2**) |
| W_sub | Due colonne; `event.id` **non** clock / **non** tie-break cronologico |
| Partial retry F1 | `processed_at` unico commit marker; ROW_ABSENT/23505/ownership fail-closed |
| Race snapshot F2 | Individuata; design revision-on-snapshot writer **superseded** |
| Design F3 / R2 → R-A | `billing_state_revision` A2; trigger G1 obbligatorio; snapshot H2 senza bump; double-read non obbligatorio; `billing_snapshot_revision` non richiesta; classificazione finale **M2/R2 = R-A** (congelata in I4.3BC) |
| Forma M2 | Candidata architetturale approvata; SQL/migration **non** creati |
| SECURITY DEFINER | **Non** congelato come requisito |
| Determinismo Snapshot(S) | Guardrail registrato |
| D4 technical guard | Predicate/readback; `is_demo` non auto-scritto |
| Decisioni prodotto (al momento BB) | D3/D4/D5/D7/unpaid erano aperte; **chiuse** in I4.3BC |
| I4.3B | **NON IMPLEMENTATO** |
| Sync mirror post I4.3BB-bis | dry-run OK; apply OK; byte/hash 15/15; cloud mirror verificato ChatGPT; push origin/main |
| `npm run lint` / `npm run build` / `deno check` | **Non necessari** (task documentale/ricognizione) |

### I4.3BC / I4.3BC-F1 / I4.3BC-F2 / I4.3BC-F3 (policy prodotto + Snapshot V3)

Registrati dai report ZERO-CODE / ZERO-DIFF (nessuna modifica repository) e dalla chiusura documentale I4.3BC-bis:

| Gate | Esito |
|------|--------|
| Modalità | Decisione prodotto **zero-code**; **nessuna** implementazione |
| Runtime / migration / deploy / secret | **Non** eseguiti |
| D5-B | Reducer set-based congelato; nessun physical winner / chronology |
| D3 / IE-B / D4-A / DP-A / D7 / TE-B / unpaid | **Congelate** — non più backlog aperto |
| Snapshot(S) | **V3** PHASE 0–4 congelato |
| H2 CAS | **V2** + TenantGuard optimistic concurrency congelato |
| TM-A / SV-B / NP-A / NormalizationFailClosed | Congelati |
| Suspended | Distinzione persistito vs snapshot ridotto documentata |
| M2/R2 | **R-A** |
| Rischio residuo D5-B | Noto e accettato (non-terminale storica può dominare terminale) |
| I4.3B | **NON COMPLETO** complessivamente |
| Prossimo filone (post-I4.3BE) | **I4.3B** subscription sync / snapshot (schema M2 poi completato in I4.3BD) |
| Sync mirror post I4.3BC-bis | Commit `83fbf24` registrato in repository; la sync successiva a I4.3BD-bis (`aa2b1e7`) ha portato il mirror allineato e verificato (15/15; cloud OK) — vedi stato mirror sotto |
| `npm run lint` / `npm run build` / `deno check` | **Non necessari** (task documentale) |

### I4.3BD / I4.3BD-T1 (schema M2 + test locale)

Registrati dal commit applicativo I4.3BD (`8246000`) e dal report I4.3BD-T1:

| Gate | Esito |
|------|--------|
| Migration | `supabase/migrations/007_billing_subscription_sync_concurrency.sql` presente nel repository |
| Commit | `8246000` — *feat(billing): add subscription sync concurrency schema* |
| Apply remoto / `supabase db push` / deploy EF / Stripe runtime | **Non** eseguiti |
| Apply locale | `npx supabase migration up --local` — history 000+007 |
| Baseline `000` | Invariata |
| Archive 001–006 | Non richieste |
| T1–T11 | **PASS** (W_sub, revision, G1 metadata, INSERT/UPDATE/DELETE bump, rollback, A→B, T11 CASCADE) |
| Trigger su `public.tenants` preesistenti | Nessuno |
| RLS / GRANT / indici / FK collaterali | Nessuno introdotto |
| Fixture | Rollbackate; nessun residuo |
| Over-invalidation UPDATE no-op | Intenzionale e testata |
| I4.3BD-F1 | **Non** necessario |
| I4.3B runtime | **NON** implementato / **NON** PASS |
| Sync mirror post I4.3BD-bis | Commit `aa2b1e7`; sync repository → mirror **completata e verificata** (dry-run PASS; apply PASS; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessuna sync inversa; nessun `--delete`) |
| `git diff --check` (T1) | PASS; nessun file repo modificato dal test |
| `npm run lint` / `npm run build` | **Non necessari** per T1 schema-only / per I4.3BD-bis documentale |

### I4.3BE / I4.3BE-F1 / I4.3BE-T1 (normalizzatore puro + fix + test Deno)

Registrati dal commit applicativo I4.3BE (`0e42dd5`), dalla chiusura F1 e dal re-run T1:

| Gate | Esito |
|------|--------|
| Commit | `0e42dd5` — *feat(billing): add Stripe subscription normalizer* |
| File | `normalizeStripeSubscription.ts` + `normalizeStripeSubscription_test.ts` |
| Scope | Mapper puro; nessun DB/Supabase/Deno.env/Stripe API/HTTP/tenant/persistence/W_sub/Snapshot/H2/wiring/deploy |
| NP-A / NormalizationFailClosed / mono-item / metadata canonicale | Rispettati |
| I4.3BE-F1 | **CHIUSO** (metadata; multi-item; Date-range); nessun F2 |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| I4.3BE-T1 primo tentativo | **NON ESEGUITO** / bloccato toolchain (Deno CLI assente) — **non** failure applicativa |
| I4.3BE-T1 re-run | deno 2.9.5 host; `deno check` PASS; `deno test` **28/28 PASS**; 0 FAIL; repo invariato |
| Gap Deno host/runtime | 2.9.5 host vs Edge embedded 2.1.4 osservato — minore, non bloccante |
| Push `origin/main` di I4.3BE + I4.3BE-bis | **Completato** dall’utente (`aa2b1e7..613f3ed`); prima di I4.3BF, `main`/`origin/main` allineati a `613f3ed` |
| Sync mirror post I4.3BE-bis (I4.3BE-D1) | **Completata e verificata** (dry-run PASS; apply PASS; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). La precedente attestazione storica «non ancora eseguita» è **risolta/verificata** |
| Apply remoto 007 / deploy / Stripe runtime | **Non** eseguiti |

### I4.3BF (resolver tenant billing customer read-only)

Registrati dal commit applicativo I4.3BF (`48782cd`) e dalla review Supervisor:

| Gate | Esito |
|------|--------|
| Commit | `48782cd` — *feat(billing): add billing customer tenant resolver* |
| File | `resolveBillingCustomerTenant.ts` + `resolveBillingCustomerTenant_test.ts` |
| Scope | Resolver read-only SELECT-only; trust boundary `tenant_billing_customers`; nessun Stripe API/Deno.env/write/wiring/K2/W_sub/persistence/Snapshot/H2/`processed_at` |
| Fail-closed / ambiguous / identità esatta input | Rispettati (ambiguous **non** sceglie la prima riga; nessuna lower-case/trim silenziosa) |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `deno check` | PASS |
| `deno test` | **11/11 PASS**; 0 FAIL; nessuna capability sensibile |
| Whitespace review | PASS — Supervisor: `git diff --no-index --check` su entrambi i file (il `git diff --check` sul working tree iniziale non includeva untracked; precisazione probatoria, non failure) |
| I4.3BF-F1 | **Non** necessario |
| Rischio client strutturale | Minore/non bloccante: `BillingCustomerTenantLookupClient` non ancora compilato contro client Supabase reale (modulo non wired) |
| Push `origin/main` di I4.3BF + I4.3BF-bis | **Completato** dall’utente (`613f3ed..a16eeb8`); prima di I4.3BG, `main`/`origin/main` allineati a `a16eeb8` |
| Sync mirror post I4.3BF-bis (I4.3BF-D1) | **Completata e verificata** (dry-run PASS; apply PASS; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). La precedente attestazione storica «non ancora eseguita» / «BF non pushato» è **risolta/verificata** |
| Apply remoto 007 / deploy / Stripe runtime / webhook wiring | **Non** eseguiti |

### I4.3BG (Stripe Subscription refetch primitive)

Registrati dal commit applicativo I4.3BG (`dc5cbcf`) e dalla review Supervisor:

| Gate | Esito |
|------|--------|
| Commit | `dc5cbcf` — *feat(billing): add Stripe subscription refetch primitive* |
| File | `refetchStripeSubscription.ts` + `refetchStripeSubscription_test.ts` |
| Scope | Provider-authoritative refetch; DI strutturale; zero SDK import nel helper; zero fallback/cache; zero DB/Supabase/normalizer/resolver/W_sub/CAS/Snapshot/H2/webhook wiring |
| Trust boundary / exact identity / error sanitize | Rispettati (una retrieve per invocazione; raw error non esposto; null/undefined → invalid; whitespace identity non canonicalizzata) |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `deno check` | PASS |
| `deno test` | **12/12 PASS**; 0 FAIL; nessuna capability `--allow-net`/`--allow-env`/`--allow-write`/`--allow-run` |
| Whitespace review | PASS — Supervisor: `git diff --no-index --check` su entrambi i file quando erano untracked (il normale `git diff --check` sul working tree non li includeva; precisazione probatoria, non failure) |
| I4.3BG-F1 | **Non** necessario |
| Rischio client strutturale | Minore/non bloccante: `StripeSubscriptionRetrieveClient` non ancora verificato contro client Stripe reale (modulo non wired); futuro wiring = compatibilità diretta, senza cast artificiali |
| Push `origin/main` di I4.3BG + I4.3BG-bis | **Completato** dall’utente (`a16eeb8..bb0f775`); prima di I4.3BH, `main`/`origin/main` allineati a `bb0f775` |
| Sync mirror post I4.3BG-bis (I4.3BG-D1) | **Completata e verificata** (dry-run PASS; apply PASS; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). La precedente attestazione storica «non ancora eseguita» / «BG non pushato» è **risolta/verificata** |
| K2 complessivo / CAS / W_sub runtime | **Non** implementati in I4.3BG (solo primitive refetch; admission classifier puro = I4.3BH) |
| Apply remoto 007 / deploy / Stripe runtime / webhook wiring | **Non** eseguiti |

### I4.3BH (subscription event admission classifier W_sub)

Registrati dal commit applicativo I4.3BH (`38e4280`) e dalla review Supervisor:

| Gate | Esito |
|------|--------|
| Commit | `38e4280` — *feat(billing): add subscription event admission classifier* |
| File | `classifySubscriptionEventAdmission.ts` + `classifySubscriptionEventAdmission_test.ts` |
| Scope | Classificatore puro/deterministico admission W_sub; zero DB/Supabase/Stripe SDK/provider I/O/Deno.env/fetch/`Date.now`/wall-clock/cache/memoization/webhook wiring/persistence/CAS/Snapshot/H2 |
| ROW_ABSENT vs ROW_PRESENT NULL/NULL | Distinti (INSERT vs conditional UPDATE/CAS); half-null → `invalid_watermark` |
| Classificazioni positive | `candidate_row_absent` / `candidate_row_present_uninitialized` / `candidate_newer_event` / `candidate_equal_timestamp_distinct_event` / `stale_event` / `partial_retry` / `already_applied` |
| Failure reasons | `invalid_provider_event_created_at` / `invalid_provider_event_id` / `invalid_watermark` / `inconsistent_same_event` |
| Event ID / Event.created | Exact identity; **non** clock/tie-break; newer/stale solo da Event.created; equal ts + ID distinti = candidate |
| Partial retry vs already applied | W==Event + not processed = `partial_retry` (**non** completed); W==Event + processed = `already_applied` |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Warning Vite chunk size | Preesistente / non bloccante |
| `deno check` | PASS |
| `deno test` | **18/18 PASS**; 0 FAIL; nessuna capability `--allow-net`/`--allow-env`/`--allow-write`/`--allow-run` |
| Whitespace review | PASS — Supervisor: `git diff --no-index --check` su entrambi i file quando erano untracked (il normale `git diff --check` sul working tree non li includeva; precisazione probatoria, non failure) |
| I4.3BH-F1 | **Non** necessario |
| Rischio `billing_event_processed` boolean | Minore/non bloccante: tipizzato boolean, non validato runtime nel classifier; futuro wiring deve derivarlo esplicitamente da `processed_at` NULL/NOT NULL |
| Push `origin/main` di I4.3BH + I4.3BH-bis | **Completato** dall’utente (`bb0f775..57c7e00`); prima di I4.3BI, `main`/`origin/main` allineati a `57c7e00` |
| Sync mirror post I4.3BH-bis (I4.3BH-D1) | **Completata e verificata** (dry-run PASS; apply PASS; byte/hash 15/15 PASS; cloud verificato dal Supervisor; nessun `--delete`; nessuna sync inversa; repo invariato). La precedente attestazione storica «non ancora eseguita» / «BH non pushato» è **risolta/verificata** |
| K2 complessivo / persistence / CAS / runtime admission / Snapshot / H2 / wiring | **Non** implementati in I4.3BH (solo classificatore puro; row observation reader = I4.3BI) |
| Apply remoto 007 / deploy / Stripe runtime / webhook wiring | **Non** eseguiti |

### I4.3BI (tenant_subscriptions row observation reader)

Registrati dal commit applicativo I4.3BI (`92fb6dd`), dalla review Supervisor e da I4.3BI-F1:

| Gate | Esito |
|------|--------|
| Commit | `92fb6dd` — *feat(billing): add subscription observation reader* |
| File | `readTenantSubscriptionObservation.ts` + `readTenantSubscriptionObservation_test.ts` |
| Scope | Reader SELECT-only row observation; exact identity; ROW_ABSENT vs ROW_PRESENT NULL/NULL distinti; half-null strategy A; ambiguity fail-closed; zero write/Stripe/env/classifier/wiring/persistence/CAS/Snapshot/H2 |
| SELECT / filtri | `tenant_subscriptions` SELECT-only; `provider` + `provider_subscription_id` exact |
| ROW_ABSENT | Solo da zero righe DB |
| ROW_PRESENT | Incluso W NULL/NULL; `tenant_id` + W_sub osservati |
| Half-null | Preservation type-valid; `invalid_watermark` resta di I4.3BH |
| Ownership | `tenant_id` osservato; decisione ownership finale **non** implementata |
| Failure reasons | `invalid_provider` / `invalid_provider_subscription_id` / `subscription_observation_lookup_failed` / `subscription_observation_ambiguous` / `subscription_observation_invalid` |
| Error sanitization | Query/throw → lookup_failed senza raw DB/message/code/token/path |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Warning Vite chunk size | Preesistente / non bloccante |
| `deno check` | PASS |
| `deno test` | **20/20 PASS**; 0 FAIL; nessuna capability `--allow-net`/`--allow-env`/`--allow-write`/`--allow-run` |
| Whitespace review | PASS — `git diff --no-index --check` su entrambi i nuovi file; `git diff --check` PASS |
| I4.3BI-F1 | **CHIUSO** — hygiene solo test; reader byte-identico SHA-256 `7bed5e5ea86c8ea184fd889a5f91aedeb2657515166735701d93763601d36614`; marker sintetici sostituiti da sentinel neutri `RAW_*`; hygiene grep PASS; nessun F2 |
| Rischio client strutturale | Minore/non bloccante: `TenantSubscriptionObservationLookupClient` non ancora verificato contro client Supabase server-side reale (modulo non wired); futuro wiring = compatibilità diretta, senza cast artificiali/adapter superflui |
| Push `origin/main` di I4.3BI + I4.3BI-bis | **Completato** dall’utente (`57c7e00..cc36c06`); prima di I4.3BJ, `main`/`origin/main` allineati a `cc36c06` |
| Sync mirror post I4.3BI-bis (I4.3BI-D1) | **Completata e verificata** (dry-run PASS; apply PASS; 15 file; byte/hash 15/15 PASS; cloud OK; nessun `--delete`; nessuna sync inversa) |
| K2 complessivo / persistence / CAS / runtime admission / Snapshot / H2 / wiring | **Non** implementati (solo helper read-only **NON WIRED**) |
| Apply remoto 007 / deploy / Stripe runtime / webhook wiring | **Non** eseguiti |

### I4.3BJ (Stripe Subscription refetch→normalize composer)

Registrati dal commit applicativo I4.3BJ (`e87462c`), dalla review Supervisor e da I4.3BJ-F1:

| Gate | Esito |
|------|--------|
| Commit | `e87462c` — *feat(billing): compose Stripe subscription refetch and normalization* |
| File | `fetchNormalizedStripeSubscription.ts` + `fetchNormalizedStripeSubscription_test.ts` |
| Scope | Composer provider-authoritative BG→BE; sequenza non negoziabile; fail-closed per stage; zero fallback/webhook/DB/tenant/ownership/classifier/W_sub/persistence/CAS/Snapshot/H2/wiring |
| Sequenza | `provider_subscription_id` → refetch BG → normalize BE → normalized subscription |
| Failure BG | STOP; `stage=refetch`; reason originaria; BE non eseguito |
| Failure BE | STOP; `stage=normalize`; reason originaria |
| Boundary TypeScript | BG success `subscription: unknown` → cast locale `unknown`→`StripeSubscriptionLike` → BE (accettato; non prova compatibilità SDK) |
| Composer SHA-256 (post-F1) | `ce252fca09b50076ae17c5a18b40bb3f6e9d527a982258b9d590e9bed03a13ea` (byte-identico in F1) |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Warning Vite chunk size | Preesistente / non bloccante |
| `deno check fetchNormalizedStripeSubscription.ts` | PASS |
| `deno test` I4.3BJ | **12/12 PASS**; 0 FAIL; nessuna capability `--allow-net`/`--allow-env`/`--allow-write`/`--allow-run` |
| Regressione I4.3BG | **12/12 PASS** |
| Regressione I4.3BE | **28/28 PASS** |
| Whitespace | PASS |
| I4.3BJ-F1 | **CHIUSO** — test-only; hygiene marker problematici rimossi (hygiene PASS); config forwarding reale; no-fallback; composer invariato; nessun F2 |
| Review Supervisor | PASS dopo I4.3BJ-F1 |
| Rischio client strutturale Stripe | Residuo: `StripeSubscriptionRetrieveClient` di BG non verificato contro vero client Stripe nel wiring reale; I4.3BJ prova composizione interna BG+BE, **non** compatibilità SDK diretta |
| Push `origin/main` di I4.3BJ + I4.3BJ-bis | Presenti su `origin/main` `e673840` nel preflight I4.3BL-bis (nessun `git fetch` in BL-bis) |
| Sync mirror post I4.3BJ-bis | **Non attestata** in I4.3BL-bis (non inventare) |
| K2 complessivo / persistence / CAS / runtime admission / Snapshot / H2 / wiring | **Non** implementati (solo composer helper **NON WIRED**) |
| Apply remoto 007 / deploy / Stripe runtime / webhook wiring | **Non** eseguiti |

### I4.3BL (Stripe Subscription pre-admission context orchestrator)

Registrati dal commit applicativo I4.3BL (`2d9a639`) e dalla review Supervisor:

| Gate | Esito |
|------|--------|
| Commit | `2d9a639` — *feat(billing): add Stripe subscription pre-admission context* |
| File | `resolveStripeSubscriptionPreAdmissionContext.ts` + `_test.ts` (solo questi due) |
| Composizione | BJ → exact identity continuity → BF → BI → ownership fail-closed |
| Provenance | BF ← `normalized.provider_customer_id`; BI ← `normalized.provider_subscription_id` |
| Reasons orchestrator-only | `subscription_identity_mismatch`; `subscription_ownership_mismatch` |
| Ownership | ROW_ABSENT success; ROW_PRESENT same tenant success; different tenant fail-closed; W NULL/NULL preservato; half-null senza semantica BH |
| Failure preservation | BJ/BF/BI failures preservate; nessun raw provider/DB error esposto |
| Fuori scope BL | write / CAS / processed_at / BH / Event / Snapshot V3 / H2 / TenantGuard / Deno.env / Stripe SDK / webhook wiring |
| `deno test` I4.3BL | **12/12 PASS** |
| Regressione I4.3BJ | **12/12 PASS** |
| Regressione I4.3BF | **11/11 PASS** |
| Regressione I4.3BI | **20/20 PASS** |
| `deno check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Warning Vite chunk size | Preesistente / non bloccante |
| Whitespace | Nessun errore sui nuovi file |
| Review Supervisor | Diff reale completo; **39/39** check; nessun I4.3BL-F1 |
| Git post-commit applicativo | `main`; HEAD `2d9a639`; `origin/main` `e673840`; ahead 1; WT pulita; nessun push |
| I4.3BL-bis / F1 | Fatto storico documentale; policy «locale/non-commit» **SUPERATA / RISOLTA** da GOVERNANCE-9-F2; **nessuna** sync Drive in quel ciclo |
| GOVERNANCE-9 / F2 | Consolidati in `a86e773` / `c9d9f1f` (verificare Git) |
| GOVERNANCE-9-bis | Questo consolidamento; hash commit futuro **non** inventato |
| I4.3B complessivo | **NON COMPLETO** |

### GOVERNANCE-9 / GOVERNANCE-9-F2

| Gate | Esito |
|------|--------|
| GOVERNANCE-9 (include F1) | **CHIUSO / CONSOLIDATO** `a86e773` — *chore(governance): restructure AI context workflow* |
| GOVERNANCE-9-F2 | **CHIUSO / CONSOLIDATO** `c9d9f1f` — *docs(governance): align AI context lifecycle* |
| Contenuto 9 | Handoff HOT; context index; rule 000; mirror HOT/FULL; script HOT/FULL/`--status`/checksum/manifest; README; Drive one-way; no sync auto/`--delete`/inversa |
| Decisioni F2 | Handoff post-9; stato-operativo **non** permanentemente locale/non-commit; lifecycle Git via `-bis`; obiettivo WT pulita |
| GOVERNANCE-9-bis | Questo file; pending review+commit utente; hash **non** inventato |
| GOVERNANCE-8B | **NON IMPLEMENTATO / DA RIVALUTARE** post clean tree |
| `npm run lint` / `npm run build` | **Non eseguiti** (task documentale; gate non richiesto dal prompt) |
| Sync Drive / `--apply` | **Non eseguiti** in 9-bis |

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
- `deno check` sul normalizzatore I4.3BE eseguito in I4.3BE-T1 re-run (PASS); resta utile per altri moduli Edge non ancora verificati con Deno host.
- Eventi `customer.subscription.*` / `invoice.*` persistiti con `processed_at` nullo attendono i slice residui di **I4.3B** (**NON COMPLETO**); T1B ha confermato `tenant_subscriptions` = 0 per la subscription target; T1C/T1D hanno confermato `tenant_subscriptions` demo = 0 e snapshot demo invariato (`plan_code` = `demo`, `subscription_status` = `active`); T1E ha riconfermato `tenant_subscriptions` = 0 e snapshot commerciale `tenants` invariato.
- **I4.3BB+ — architettura anti-stale consolidata (schema M2 implementato; runtime I4.3B non wired):** rischio out-of-order/stale overwrite resta concreto finché I4.3B non è wired. Strategia approvata **K2**: provider re-fetch + admission watermark Event (`event.created`) + CAS/readback/re-fetch su **W_sub**; `event.id` **non** è clock né tie-break cronologico. Provider API down → no fallback payload; `processed_at` NULL; HTTP 502 candidato.
- **I4.3BB-R-F1 — partial retry:** `processed_at` è l’unico commit marker dell’Event; W_sub prova solo l’effetto per-subscription. Stati parziali (W_sub aggiornato, `processed_at` NULL) sono ritentabili e non equivalgono a completed. ROW_ABSENT / INSERT / 23505 richiedono re-lookup + ownership fail-closed (nessun remap tenant).
- **I4.3BB-R-F2/F3 — snapshot cross-subscription:** CAS W_sub non protegge lo snapshot aggregato. F2 individuò la race; la proposta «revision incrementata dallo snapshot writer» è **superseded**. Design corrente **R-A** (ex R2/A2): `billing_state_revision` monotona locale del SET, bump atomico via trigger G1 su mutation `tenant_subscriptions` (**implementato** in I4.3BD); snapshot CAS H2 **non** incrementa revision (H2 da implementare). Double-read non obbligatorio. `billing_snapshot_revision` non richiesta. Trigger G1 = **SECURITY INVOKER** (nessun DEFINER).
- **I4.3BC — H2 CAS V2:** `billing_state_revision` non basta contro modifiche manuali concorrenti ai TenantGuard fields → optimistic concurrency predicates su `plan_code`/`subscription_status`/`is_demo`/`trial_ends_at` (+ D4).
- **Guardrail determinismo Snapshot(S) V3:** derivazione deterministica rispetto a Guard + S; non dipendere da ordering Event / `event.id` / wall-clock / input esterno non versionato. Policy prodotto D3/D4/D5/D7/unpaid **congelate** in I4.3BC (non più aperte).
- **Rischio residuo D5-B (accettato):** poiché il reducer è set-based e non usa cronologia, una riga non-terminale storica ancora presente come non-terminale può dominare una riga terminale. **Non** risolvere ora con `event.created`/`updated_at`/`provider_subscription_id` ordering/`current_period_end`/`now()`/`current_subscription_id`. Se in futuro serve nozione esplicita di current row → nuova decisione architetturale. Non blocker per I4.3BC.
- **D4-A / DP-A:** ProtectedNoOp su demo/internal coerenti; de-protection futura richiede recompute Snapshot(S) nello stesso workflow (non attendere webhook). `is_demo` non auto-scritto dal webhook.
- **Schema M2/R-A implementato in I4.3BD** (`007` nel repo; T1 PASS locale; apply remoto **non** eseguito). **Normalizzatore puro implementato in I4.3BE** (`0e42dd5`; F1 chiuso; T1 28/28 PASS; I4.3BE-bis `613f3ed`; sync D1 + push verificati). **Resolver tenant read-only implementato in I4.3BF** (`48782cd`; 11/11 PASS; I4.3BF-bis `a16eeb8`; sync D1 + push verificati). **Provider re-fetch primitive implementato in I4.3BG** (`dc5cbcf`; 12/12 PASS; I4.3BG-bis `bb0f775`; sync D1 + push verificati). **Pure admission classifier W_sub implementato in I4.3BH** (`38e4280`; 18/18 PASS; I4.3BH-bis `57c7e00`; sync D1 + push verificati). **Row observation reader read-only implementato in I4.3BI** (`92fb6dd`; F1 chiuso; 20/20 PASS; I4.3BI-bis `cc36c06`; sync D1 + push verificati; **NON WIRED**). **Composer provider-authoritative refetch→normalize implementato in I4.3BJ** (`e87462c`; F1 chiuso; 12/12 PASS; **NON WIRED**). **Orchestrator read-only pre-admission implementato in I4.3BL** (`2d9a639`; 12/12 PASS; regressioni BJ/BF/BI PASS; review 39/39; **NON WIRED**; non pushato). Restano mancanti BH runtime / processed_at mapping/completion / persistence/CAS / Snapshot H2 / wiring eventi / `billing_events.tenant_id` subscription path / runtime/deploy remoto I4.3B. K2 complessivo ancora **NON** implementato. Invoice fuori scope del primo I4.3B. Debito: `processed_at=NULL` oggi = deferred intenzionale **oppure** incompleto; lifecycle temporale del trial manuale fuori I4.3B; nessun runtime race test aggiuntivo richiesto ora. Gap Deno host 2.9.5 vs Edge embedded 2.1.4 = minore, non bloccante per i moduli puri/helper. **Rischio minore non bloccante I4.3BF:** `BillingCustomerTenantLookupClient` è interfaccia strutturale minima; al futuro wiring verificare compatibilità diretta del client server-side Supabase reale senza cast artificiosi/adapter superflui. **Rischio minore non bloccante I4.3BG / I4.3BJ:** `StripeSubscriptionRetrieveClient` di BG non è ancora stato verificato contro il vero client Stripe nel wiring reale; I4.3BJ dimostra che i primitive BG e BE compongono internamente, **non** che il vero Stripe SDK/client runtime soddisfi direttamente il structural contract senza adattamenti — al futuro wiring verificare compatibilità diretta; **non** usare cast artificiosi come scorciatoia sul client reale. Boundary composer `unknown`→`StripeSubscriptionLike` accettato e confinato (non rimappa; validazione resta di BE). **Rischio minore non bloccante I4.3BH:** `billing_event_processed` è tipizzato boolean e non viene runtime-validato dal classificatore; il futuro mapper/wiring deve convertire esplicitamente `processed_at` NULL/NOT NULL in boolean — non passare valori ambigui; **non** aprire fix sul classifier oggi. **Rischio minore non bloccante I4.3BI:** `TenantSubscriptionObservationLookupClient` è interfaccia strutturale minima; al futuro wiring verificare compatibilità diretta del client Supabase server-side reale senza cast artificiali (`as TenantSubscriptionObservationLookupClient`) o adapter superflui. Ownership fail-closed è nel helper I4.3BL (**NON WIRED**); persistence / CAS / Snapshot / H2 / webhook wiring ancora assenti — non elevare a falsi blocker aggiuntivi. Drift docs `production-readiness` / `billing-data-model` resta fuori scope.
- **I4.3BD rischi residui (non bloccanti, nessun F1):** (1) rischio teorico di lock ordering/deadlock su UPDATE concorrenti anomali `tenant_id` A→B e B→A — `tenant_id` resta concettualmente non destinato a mutazione applicativa ordinaria; (2) over-invalidation su UPDATE SQL logicamente no-op è intenzionale e testata. **Non** elevati a blocker.
- Fixture T1B: eventi non-allowlist sandbox generati dalla fixture restano fuori scope di cleanup in questo ciclo; nessun evento live.
- Fixture failed diagnostica T1C/T1E (`evt_1U1o48FOUoE38beB2KuEcYKQ`): HTTP 502 fail-closed su fixture default non rappresentativa; distinta dal path positivo; non trasformata in bug applicativo; non ripulita manualmente; retry controllato in T1E ha mantenuto fail-closed senza correlazione/subscription.
- Lacuna T1D minore: attempt di delivery non serializzato dalla UI Workbench nel report; HTTP 200 da log Edge Function — non eleva a failure (Supervisor: T1D PASS).
- Lacuna T1E minore: due POST 502 post-resend nei log Edge Function senza event ID — non eleva a failure; nessun ulteriore resend necessario (Supervisor: T1E PASS).
- Drift storico di `docs/production-readiness.md` e `docs/billing-data-model.md` **ancora presente e non corretto** (fuori scope di questo task; drift su unpaid/status e sezioni storiche). `docs/demo-tenant.md` de-protection/rollback dovrà allinearsi a DP-A prima di promotion reale.

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
- I4.3BB-bis consolidato in `169dfa4` — *docs(context): record subscription sync concurrency architecture*; sync repository → mirror post-commit completata (dry-run OK; apply OK; verifica byte/hash **15/15**; cloud mirror verificato da ChatGPT; push `origin/main` completato; `main`/`origin/main` allineati; nessuna sync inversa; nessun `--delete`).
- I4.3BC-bis consolidato in `83fbf24` — *docs(context): record subscription snapshot policy*.
- I4.3BD-bis consolidato in `aa2b1e7` — *docs(context): record subscription concurrency schema*; sync repository → mirror post-commit **completata e verificata** (dry-run PASS; apply PASS; verifica byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessuna sync inversa; nessun `--delete`). La precedente attestazione storica di sync I4.3BD-bis «non attestata» / mirror stale pre-I4.3BC-bis+I4.3BD-bis è quindi **risolta/verificata** esplicitamente (non riconciliazione silenziosa).
- I4.3BE-bis consolidato in `613f3ed` — *docs(context): record Stripe subscription normalizer*; sync repository → mirror post-commit I4.3BE-D1 **completata e verificata** (dry-run PASS; apply PASS; verifica byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessuna sync inversa; nessun `--delete`; repository invariato). Push I4.3BE + I4.3BE-bis completato; prima di I4.3BF, `main`/`origin/main` allineati a `613f3ed`. La precedente attestazione storica «sync I4.3BE-bis non eseguita» / «push I4.3BE non attestato» è quindi **risolta/verificata** esplicitamente (non riconciliazione silenziosa).
- I4.3BF-bis consolidato in `a16eeb8` — *docs(context): record billing customer tenant resolver*; sync repository → mirror post-commit I4.3BF-D1 **completata e verificata** (dry-run PASS; apply PASS; verifica byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessuna sync inversa; nessun `--delete`; repository invariato). Push I4.3BF + I4.3BF-bis completato; prima di I4.3BG, `main`/`origin/main` allineati a `a16eeb8`. La precedente attestazione storica «sync I4.3BF-bis non eseguita» / «I4.3BF non pushato» è quindi **risolta/verificata** esplicitamente (non riconciliazione silenziosa).
- I4.3BG-bis consolidato in `bb0f775` — *docs(context): record Stripe subscription refetch primitive*; sync repository → mirror post-commit I4.3BG-D1 **completata e verificata** (dry-run PASS; apply PASS; verifica byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessuna sync inversa; nessun `--delete`; repository invariato). Push I4.3BG + I4.3BG-bis completato; prima di I4.3BH, `main`/`origin/main` allineati a `bb0f775`. La precedente attestazione storica «sync I4.3BG-bis non eseguita» / «I4.3BG non pushato» (e snapshot/header che ancora citavano I4.3BF-bis come ultimo governance) è quindi **risolta/verificata** esplicitamente (non riconciliazione silenziosa).
- I4.3BH-bis consolidato in `57c7e00` — *docs(context): record subscription event admission classifier*; sync repository → mirror post-commit I4.3BH-D1 **completata e verificata** (dry-run PASS; apply PASS; verifica byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessuna sync inversa; nessun `--delete`; repository invariato). Push I4.3BH + I4.3BH-bis completato; prima di I4.3BI, `main`/`origin/main` allineati a `57c7e00`. La precedente attestazione storica «sync I4.3BH-bis non eseguita» / «I4.3BH non pushato» (e snapshot Drive/header che ancora citavano I4.3BG-bis come ultimo governance) è quindi **risolta/verificata** esplicitamente (non riconciliazione silenziosa).
- I4.3BI-bis consolidato in `cc36c06` — *docs(context): record subscription observation reader*; sync repository → mirror post-commit I4.3BI-D1 **completata e verificata** (dry-run PASS; apply PASS; verifica byte/hash **15/15** PASS; cloud Drive verificato dal Supervisor; nessuna sync inversa; nessun `--delete`; repository invariato). Push I4.3BI + I4.3BI-bis completato; prima di I4.3BJ, `main`/`origin/main` allineati a `cc36c06`. La precedente attestazione storica «sync I4.3BI-bis non eseguita» / «I4.3BI non pushato» (e snapshot Drive/header che ancora citavano I4.3BH-bis come ultimo governance) è quindi **risolta/verificata** esplicitamente (non riconciliazione silenziosa).
- **Stato mirror corrente:** ultimo sync attestato = post I4.3BI-D1 / `cc36c06`. Storia: sync post I4.3BJ-bis (`e673840`) **non attestata** (non inventare). Osservazione Supervisor 10/08/2026: mirror Drive **stale** (pre-I4.3BJ-bis). Successivamente HEAD locale ha avanzato con I4.3BL + GOVERNANCE-9 + GOVERNANCE-9-F2 — Drive resta **più vecchio** del repository (**atteso** finché ciclo governance non chiuso). Git/repository = SoT. Nessuna riconciliazione Drive → repository.
- I4.3BJ-bis consolidato in `e673840` — *docs(context): record Stripe subscription composition*.
- **I4.3BL-bis / I4.3BL-bis-F1 (fatto storico):** aggiornamento locale + decisione «locale/non-commit» + sync BLOCCATA; candidatura GOVERNANCE-8B per eccezione dirty-state. Policy «permanente non-commit» **SUPERATA / RISOLTA** da GOVERNANCE-9-F2.
- **GOVERNANCE-9** `a86e773` / **GOVERNANCE-9-F2** `c9d9f1f`: modello HOT/WARM/COLD + lifecycle `-bis` allineati (script HOT/FULL già in repo; safety clean-tree invariata).
- **GOVERNANCE-9-bis:** consolidamento di questo file; **nessuna** sync; dopo review+commit utente → WT pulita → rivalutare GOVERNANCE-8B e sync HOT.
- Nessuna riconciliazione Drive → repository è consentita.

---

## 9. Guardrail non negoziabili

- Tenant-first: ogni operazione dati con `activeTenantId` / `tenant_id` tracciabile.
- RLS sempre on; scritture billing **solo** server-side.
- `billing_events` **non** leggibile dal client (no GRANT SELECT authenticated).
- Baseline `000_*` immutabile per cambi futuri; niente rewrite storia produzione.
- `npm run lint` (= `tsc --noEmit`) e `npm run build` dopo modifiche rilevanti.
- Nessun commit di `.env` / chiavi reali.
- Cursor esegue solo il micro-task assegnato; non anticipa i prossimi slice I4.3B o altre fasi dai “Consigli a ChatGPT”.

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
# Mirror AI context (solo post-commit, working tree pulita; HOT default):
# scripts/sync-ai-context-mirror.sh --status
# scripts/sync-ai-context-mirror.sh --dry-run
# scripts/sync-ai-context-mirror.sh --apply
# scripts/sync-ai-context-mirror.sh --full --dry-run   # FULL solo se richiesto
```

---

## 11. Documenti di riferimento

| Documento | Contenuto |
|-----------|-----------|
| `docs/chatgpt-handoff.md` | Snapshot HOT continuità ordinaria ChatGPT |
| `docs/ai-context-index.md` | Indice HOT/WARM/COLD (routing fonti) |
| `docs/stato-operativo.md` | Dettaglio/storico operativo (**WARM**); aggiornamento via task `-bis` + lifecycle Git; **non** obbligatorio intero a ogni prompt |
| `.cursor/rules/000-project-context.mdc` | Invarianti processo, ruoli, SoT, micro-task, report |
| `docs/ai-context-mirror.md` | Policy mirror Drive HOT/FULL + workflow script |
| `scripts/sync-ai-context-mirror.sh` | Script ufficiale sync controllata (GOVERNANCE-7 + HOT/FULL GOVERNANCE-9) |
| `docs/saas-refactor-plan.md` | Storia fasi A–M e decisioni (**COLD**/storico) |
| `docs/billing-data-model.md` | Design billing + note I1–I4.0 (parziale drift post I4.1/I4.3A) |
| `docs/supabase-cli-baseline.md` | Come creare migration post-baseline |
| `docs/production-readiness.md` | Deploy / smoke / rollback |
| `docs/demo-tenant.md` | Runbook demo |
| `docs/saas-rls-test-plan.md` | Checklist RLS |
| `README.md` | Setup locale e Render |

---

*Aggiornare questo file alla fine di ogni micro-fase billing, governance o migration rilevante (commit applicativo di riferimento, cosa fatto, prossima azione) tramite task `-bis` separato. Dopo review Supervisor e autorizzazione utente: lifecycle Git/commit normale; registrare il commit del `-bis` nel successivo aggiornamento significativo; **vietato** `-bis-bis`; obiettivo ordinario = working tree pulita. Sync Drive solo con WT pulita via script ufficiale (HOT default / FULL esplicito); HOT/FULL non bypassa clean-tree; GOVERNANCE-8B non implementato. Nessuna sync in GOVERNANCE-9-bis. Non pretendere che l’HEAD Git corrente coincida stabilmente con i valori storici di questo documento; verificarlo sempre con `git rev-parse HEAD`.*
