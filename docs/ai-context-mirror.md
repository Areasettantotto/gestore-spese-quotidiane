# Mirror AI Context su Google Drive

## A. Scopo

Il mirror Google Drive consente a ChatGPT (e ad altri agenti di consultazione) di leggere versioni aggiornate dei file di contesto del progetto **senza upload manuale a ogni modifica**.

Principi:

- il **repository Git** resta la fonte canonica;
- Drive è **solo un canale di consultazione**, non una seconda fonte di verità;
- ChatGPT deve **rileggere** i file a ogni nuova ripresa;
- il mirror **non** implica monitoraggio automatico, webhook, notifiche in background o Git hook;
- Cursor modifica soltanto i file nel repository, non direttamente in Drive.

Dettagli operativi di sincronizzazione vivono in questo documento. I principi stabili e il workflow post-commit sono in `.cursor/rules/000-project-context.mdc`. Lo stato dinamico del progetto resta in `docs/stato-operativo.md`.

---

## B. File da sincronizzare

Perimetro ufficiale (relativo alla root del repository), limitato ai **file tracciati da Git**:

- `docs/**/*.md` (inclusi i `.md` direttamente sotto `docs/`)
- `.cursor/rules/**/*.mdc` (inclusi i `.mdc` direttamente sotto `.cursor/rules/`)

La lista canonica è costruita da `git ls-files` filtrata rigorosamente; file untracked non entrano nella sincronizzazione.

---

## C. File da escludere

Non sincronizzare mai verso il mirror:

- `.env`
- `.env.*`
- segreti, credenziali, token
- chiavi Stripe (live o test)
- chiavi Supabase server-side (`service_role` e equivalenti)
- dump database
- backup
- dati personali
- `.git/`
- `node_modules/`
- `dist/`
- sorgenti applicativi non necessari al contesto AI (`src/`, `supabase/functions/`, ecc.)
- archivi ZIP completi del repository
- il file locale `.git/ai-context-mirror-path` (non versionabile; non sincronizzare)

---

## D. Struttura consigliata

Cartella Drive stabile (nome senza spazi problematici per shell):

`Gestore-Spese-SaaS-AI-Context/`

Sottocartelle allineate al repository:

```text
Gestore-Spese-SaaS-AI-Context/
  docs/
  .cursor/
    rules/
```

Mantenere nomi e percorsi relativi coerenti con il repository (es. `docs/stato-operativo.md`, `.cursor/rules/000-project-context.mdc`).

Il **basename** della destinazione locale deve essere esattamente `Gestore-Spese-SaaS-AI-Context`.

---

## E. Configurazione locale della destinazione

Il percorso locale della cartella mirror **non** è versionato e **non** deve comparire in documentazione, log, report o prompt.

Risoluzione della destinazione (ordine):

1. variabile d’ambiente `AI_CONTEXT_MIRROR_DIR`, se valorizzata;
2. altrimenti prima riga del file locale non versionabile `.git/ai-context-mirror-path`.

Il file `.git/ai-context-mirror-path` contiene un percorso personale: non committarlo, non copiarlo in file versionati, non sincronizzarlo verso Drive.

Non documentare qui percorsi assoluti del computer né account Google.

---

## F. Script ufficiale

Lo script versionato ufficiale è:

`scripts/sync-ai-context-mirror.sh`

Accetta **esclusivamente**:

- `--dry-run` — prova controllata senza scrivere (usa `rsync -avhn`)
- `--apply` — sincronizzazione effettiva (usa `rsync -avh`)

Nessuna modalità implicita. Nessuna sincronizzazione inversa (Drive → repository). **Mai** `--delete` né `--remove-source-files`.

Comportamento essenziale:

- root repository determinata tramite Git;
- destinazione da `AI_CONTEXT_MIRROR_DIR` o `.git/ai-context-mirror-path`;
- validazione fail-closed (directory esistente, basename corretto, destinazione ≠ root repository);
- lista da `git ls-files` con filtro su `docs/**/*.md` e `.cursor/rules/**/*.mdc`;
- dopo `--apply`, verifica byte-per-byte (o hash locale equivalente) di ogni file sincronizzato; fallisce se manca o differisce;
- output limitato a: modalità, numero file, percorsi relativi, basename destinazione, esito;
- nessun percorso assoluto, email o home directory nei log dello script.

---

## G. Workflow di sincronizzazione (Cursor post-commit)

1. L’utente autorizza ed esegue `git add` / commit (e push, se necessario) — restano operazioni dell’utente.
2. Dopo conferma esplicita del commit in conversazione, se il commit ha modificato almeno un file del perimetro mirror, Cursor esegue la sincronizzazione locale controllata **senza** attendere un nuovo prompt ChatGPT.
3. La sincronizzazione è **obbligatoria** dopo il commit di ogni task `-bis`.
4. È **consentita** anche dopo commit governance o documentali che modificano `docs/**/*.md` o `.cursor/rules/**/*.mdc`.
5. Ordine obbligatorio:
   1. verifiche pre-sync (branch, HEAD, working tree pulita, commit confermato, nessuno staged, config locale presente);
   2. `scripts/sync-ai-context-mirror.sh --dry-run`;
   3. valutazione dell’output (solo percorsi ammessi);
   4. `scripts/sync-ai-context-mirror.sh --apply`;
   5. verifica uguaglianza file (inclusa nello script);
   6. report post-commit breve.
6. In caso di anomalia (working tree sporca, config assente, dry-run anomalo, rsync fallito): **fail-closed** — non apply, non auto-fix, non fallback; riportare la divergenza.
7. Questa delega **non** autorizza: push, deploy, migration, Supabase remoto, Stripe, segreti, sync inversa, `--delete`, Git hook.
8. Cursor non avvia altri task dopo la sincronizzazione.

Dettaglio normativo: `.cursor/rules/000-project-context.mdc`.

---

## H. Principio di aggiornamento dei file

Aggiornare i file mantenendo:

- stesso nome;
- stesso percorso relativo;
- stesso file Drive, quando possibile;
- **niente** copie con suffissi `(1)`, `copy`, `new`, date o versioni manuali.

La sincronizzazione deve **sovrascrivere o aggiornare** il file corrispondente, non creare duplicati. Non elimina file dal mirror (`--delete` vietato).

---

## I. Google Drive for Desktop

Flusso generale:

1. Installare o usare Google Drive for Desktop.
2. Creare la cartella mirror (struttura della sezione D).
3. Configurare localmente la destinazione (`AI_CONTEXT_MIRROR_DIR` o `.git/ai-context-mirror-path`).
4. Usare lo script ufficiale dopo i commit rilevanti (sezione G).
5. Attendere il completamento della sincronizzazione Drive Desktop verso il cloud.
6. Condividere con ChatGPT il **link stabile** della cartella, usando l’account Google collegato.

Non documentare qui percorsi assoluti specifici del computer dell’utente né l’account Google.

---

## J. Accesso da ChatGPT

1. Condividere **una volta** il link stabile della cartella Drive.
2. Aggiungere il link alle istruzioni del progetto ChatGPT, quando possibile.
3. All’inizio di ogni nuova ripresa chiedere a ChatGPT di leggere:
   - la cartella mirror;
   - `docs/stato-operativo.md`;
   - le regole `.cursor/rules/*.mdc` pertinenti.
4. Verificare che data e riferimenti Git del file letto siano quelli attesi (confronto con `git rev-parse HEAD` / stato reale).
5. **Non** assumere che ChatGPT abbia ricevuto automaticamente gli aggiornamenti.

ChatGPT **non** monitora Drive in automatico. Nessun monitoraggio in background lato Cursor o repository.

---

## K. Risoluzione delle divergenze

- Il repository / Git verificato **prevale** sul mirror.
- Dopo un aggiornamento significativo nel repository, risincronizzare il mirror con lo script ufficiale.
- Una copia Drive vecchia **non** deve sovrascrivere il repository.
- Se Drive e repository divergono, l’agente deve **segnalarlo** nel report.
- Nessuna riconciliazione silenziosa e nessuna sincronizzazione inversa.

Gerarchia sintetica in caso di conflitto (allineata alla regola `000`): istruzioni utente correnti → repository/Git → `docs/stato-operativo.md` canonico → mirror Drive.

---

## L. Checklist di verifica

- [ ] Cartella Drive stabile con basename `Gestore-Spese-SaaS-AI-Context`
- [ ] Configurazione locale presente (env o `.git/ai-context-mirror-path`)
- [ ] Stessi percorsi relativi del repository
- [ ] Nessun duplicato (`(1)`, `copy`, versioni manuali)
- [ ] Nessun segreto / `.env` / dump / credenziali
- [ ] Dry-run eseguito prima di ogni apply
- [ ] Nessun `--delete` usato
- [ ] Verifica byte/hash post-apply superata
- [ ] Sincronizzazione Drive Desktop completata verso il cloud
- [ ] Link accessibile; prova di lettura da ChatGPT nella ripresa corrente
- [ ] Nessun percorso personale nei report o nei file versionati
