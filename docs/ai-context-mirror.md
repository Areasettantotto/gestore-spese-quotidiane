# Mirror AI Context su Google Drive

## A. Scopo

Il mirror Google Drive consente a ChatGPT (e ad altri agenti di consultazione) di leggere versioni aggiornate dei file di contesto **senza upload manuale a ogni modifica**.

Principi:

- **Contesto locale = source of truth** (repository Git + `docs/` + `.cursor/rules/`)
- **Google Drive = mirror derivato** one-way (**LOCALE → Drive**); **mai** Drive → repository automatico
- Drive **non** è la fonte da interrogare a ogni prompt; la continuità ordinaria usa `docs/chatgpt-handoff.md`
- Cursor modifica soltanto i file nel repository, non direttamente in Drive
- Nessun monitoraggio automatico, webhook, cron, Git hook o sync in background

Indice fonti: [`docs/ai-context-index.md`](ai-context-index.md). Handoff: [`docs/chatgpt-handoff.md`](chatgpt-handoff.md).

---

## B. Due livelli di sync

### HOT (default)

Sincronizza solo:

- `docs/chatgpt-handoff.md`
- `docs/ai-context-index.md`

Più un **manifest** scritto **solo nella destinazione mirror** (non versionato nel repository): timestamp UTC, branch, HEAD, mode, lista file.

Uso: ripresa ordinaria ChatGPT dopo aggiornamento materiale dell’handoff/indice.

### FULL

Sincronizza l’insieme dei file **tracciati da Git** nel perimetro:

- `docs/**/*.md`
- `.cursor/rules/**/*.mdc`

Uso: backup, ricostruzione contesto, drill-down offline da Drive. I documenti WARM/COLD restano disponibili nel FULL mirror **senza** doverli caricare a ogni prompt.

**HOT/FULL** è una policy di **selezione del perimetro** di mirror. **Non** è un bypass della safety policy dello script (clean working tree, no `--delete`, one-way).

---

## C. File da escludere (sempre)

Non sincronizzare mai verso il mirror:

- `.env`, `.env.*`, segreti, credenziali, token
- chiavi Stripe / `service_role` Supabase
- dump, backup, dati personali
- `.git/`, `node_modules/`, `dist/`
- sorgenti applicativi (`src/`, `supabase/functions/`, ecc.)
- il file locale `.git/ai-context-mirror-path`
- percorsi personali / URL Drive in log versionati

---

## D. Struttura destinazione

Basename obbligatorio della cartella mirror locale:

`Gestore-Spese-SaaS-AI-Context`

```text
Gestore-Spese-SaaS-AI-Context/
  docs/
  .cursor/
    rules/
  .ai-context-mirror-manifest.txt   # solo destinazione; generato dallo script
```

Mantenere percorsi relativi allineati al repository. Niente duplicati `(1)` / `copy` / versioni manuali.

---

## E. Configurazione locale

Ordine di risoluzione:

1. `AI_CONTEXT_MIRROR_DIR` (se valorizzata)
2. prima riga di `.git/ai-context-mirror-path` (non versionabile)

Nessun percorso personale in file versionati, report o prompt.

---

## F. Script ufficiale

`scripts/sync-ai-context-mirror.sh`

| Flag | Effetto |
|------|---------|
| *(nessuno)* o comportamento default con `--apply` / `--dry-run` | **HOT** |
| `--full` | modalità FULL |
| `--dry-run` | prova senza scrivere: rsync in dry-run con **checksum** (skip file già identici per contenuto); nessun I/O destinazione di apply |
| `--apply` | sync effettiva; richiede working tree **completamente pulita** |
| `--status` | riepilogo mode/file count/config presente (senza path assoluti); read-only |

Vincoli permanenti:

- solo **LOCALE → Drive**
- **mai** `--delete` / `--remove-source-files`
- nessuna modalità implicita di apply
- lista da `git ls-files` (file untracked esclusi)
- dopo `--apply`: verifica `cmp` byte-per-byte + scrittura manifest in destinazione
- output senza percorsi assoluti / home / email

### Safety vs HOT/FULL (stato corrente)

- `--apply` richiede **oggi** working tree pulita (fail-closed).
- HOT/FULL **non** risolve il problema GOVERNANCE-8A del solo `M docs/stato-operativo.md`: con working tree sporca `--apply` resta rifiutato anche in HOT.
- L’eccezione controllata per `stato-operativo` (es. flag dirty-state / hash atteso) appartiene a **GOVERNANCE-8B** e **non è ancora implementata**.
- Nessuna sync automatica; nessuna sync inversa.

Esempi:

```bash
scripts/sync-ai-context-mirror.sh --status
scripts/sync-ai-context-mirror.sh --dry-run
scripts/sync-ai-context-mirror.sh --apply
scripts/sync-ai-context-mirror.sh --full --dry-run
scripts/sync-ai-context-mirror.sh --full --apply
```

---

## G. Quando sincronizzare (esplicito)

La sync **non** deve essere eseguita: a ogni prompt, a ogni save, a ogni micro-task, da watcher, cron, hook Git o in background.

Aggiornare l’handoff (e poi eventualmente HOT sync) solo se cambia materialmente almeno uno tra: baseline, decisione, milestone, workstream, rischio/blocco, regola operativa, commit/release di riferimento.

Micro-fix / copy minori **non** obbligano a rigenerare tutta la documentazione né a sync.

Workflow post-commit (quando sbloccato):

1. Utente autorizza commit (e push se serve)
2. Dopo conferma in conversazione, se il commit ha toccato perimetro mirror → Cursor può sync **senza** nuovo prompt ChatGPT
3. Ordine: preflight → `--dry-run` (HOT o FULL come deciso) → validazione → `--apply` → report → stop
4. Fail-closed su working tree sporca, config assente, dry-run anomalo, rsync fallito
5. **FULL** solo se richiesto esplicitamente o per backup/ricostruzione; default **HOT**

**Nota operativa corrente:** da I4.3BL-bis la sync può risultare **BLOCCATA** finché `docs/stato-operativo.md` resta tracked-modified e non esiste un workflow governance compatibile (GOVERNANCE-8B). Non usare workaround (`cp`/`rsync` manuali fuori script).

---

## H. Accesso da ChatGPT

1. Condividere **una volta** il link stabile della cartella Drive (account Google collegato)
2. Continuità ordinaria: leggere **`docs/chatgpt-handoff.md`** (+ indice se serve)
3. Drill-down: aprire **un solo** documento WARM/COLD pertinente
4. Confrontare timestamp/HEAD dell’handoff con Git reale
5. **Non** rileggere l’intero mirror a ogni ripresa

---

## I. Divergenze

- Repository / Git verificato **prevale** sul mirror
- Copia Drive vecchia **non** sovrascrive il repository
- Segnalare divergenze; nessuna riconciliazione silenziosa

Gerarchia: istruzioni utente → Git/repo → handoff / stato-operativo locale → rules → docs → mirror Drive → report precedenti → assunzioni.

---

## J. Checklist

- [ ] Basename destinazione `Gestore-Spese-SaaS-AI-Context`
- [ ] Config locale presente (env o `.git/ai-context-mirror-path`)
- [ ] HOT di default; FULL solo se intenzionale
- [ ] Dry-run (con checksum) prima di apply
- [ ] Nessun `--delete` / `--remove-source-files`
- [ ] Verifica byte/hash OK
- [ ] Manifest aggiornato in destinazione
- [ ] Nessun percorso personale nei report
- [ ] Nessuna sync inversa
- [ ] Nessuna sync automatica
- [ ] HOT/FULL non usato come bypass clean-tree / GOVERNANCE-8B
