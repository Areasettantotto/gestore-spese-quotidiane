# Mirror AI Context su Google Drive

## A. Scopo

Il mirror Google Drive consente a ChatGPT (e ad altri agenti di consultazione) di leggere versioni aggiornate dei file di contesto del progetto **senza upload manuale a ogni modifica**.

Principi:

- il **repository Git** resta la fonte canonica;
- Drive è **solo un canale di consultazione**, non una seconda fonte di verità;
- ChatGPT deve **rileggere** i file a ogni nuova ripresa;
- il mirror **non** implica monitoraggio automatico, webhook o notifiche in background.

Dettagli operativi di sincronizzazione vivono in questo documento. I principi stabili sono in `.cursor/rules/000-project-context.mdc`. Lo stato dinamico del progetto resta in `docs/stato-operativo.md`.

---

## B. File da sincronizzare

Perimetro consigliato (relativo alla root del repository):

- `docs/**/*.md`
- `.cursor/rules/**/*.mdc`

L’utente può restringere il set ai soli documenti effettivamente necessari per la ripresa (ad esempio solo `docs/stato-operativo.md` e le regole `.mdc` pertinenti).

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
- sorgenti applicativi non necessari al contesto AI (`src/`, `supabase/functions/`, ecc. salvo scelta esplicita limitata)
- archivi ZIP completi del repository

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

---

## E. Principio di sincronizzazione

Aggiornare i file mantenendo:

- stesso nome;
- stesso percorso relativo;
- stesso file Drive, quando possibile;
- **niente** copie con suffissi `(1)`, `copy`, `new`, date o versioni manuali.

La sincronizzazione deve **sovrascrivere o aggiornare** il file corrispondente, non creare duplicati.

---

## F. Google Drive for Desktop

Flusso generale:

1. Installare o usare Google Drive for Desktop.
2. Creare la cartella mirror (struttura della sezione D).
3. Individuare il percorso locale della cartella sincronizzata (dipende da account e OS).
4. Copiare soltanto file `.md` e `.mdc` dal repository verso il mirror.
5. Attendere il completamento della sincronizzazione Drive.
6. Condividere con ChatGPT il **link stabile** della cartella, usando l’account Google collegato.

Non documentare qui percorsi assoluti specifici del computer dell’utente.

---

## G. Esempio rsync

Sostituire manualmente il placeholder con il percorso locale reale della cartella Drive. **Non** trasformare questo esempio in uno script versionato nel repository.

```bash
DRIVE_CONTEXT="/percorso/della/cartella/GoogleDrive/Gestore-Spese-SaaS-AI-Context"

# Preparare le directory di destinazione
mkdir -p "$DRIVE_CONTEXT/docs"
mkdir -p "$DRIVE_CONTEXT/.cursor/rules"

# Sincronizzare solo Markdown di docs/ (nessun --delete)
rsync -av \
  --include='*/' \
  --include='*.md' \
  --exclude='*' \
  docs/ "$DRIVE_CONTEXT/docs/"

# Sincronizzare solo regole .mdc (nessun --delete)
rsync -av \
  --include='*/' \
  --include='*.mdc' \
  --exclude='*' \
  .cursor/rules/ "$DRIVE_CONTEXT/.cursor/rules/"
```

Note:

- non usare `--delete`;
- non copiare file diversi da `.md` e `.mdc`;
- non leggere né copiare `.env`;
- non includere il repository completo;
- verificare a occhio che non compaiano duplicati o file sensibili nella cartella Drive.

---

## H. Accesso da ChatGPT

1. Condividere **una volta** il link stabile della cartella Drive.
2. Aggiungere il link alle istruzioni del progetto ChatGPT, quando possibile.
3. All’inizio di ogni nuova ripresa chiedere a ChatGPT di leggere:
   - la cartella mirror;
   - `docs/stato-operativo.md`;
   - le regole `.cursor/rules/*.mdc` pertinenti.
4. Verificare che data e riferimenti Git del file letto siano quelli attesi (confronto con `git rev-parse HEAD` / stato reale).
5. **Non** assumere che ChatGPT abbia ricevuto automaticamente gli aggiornamenti.

ChatGPT **non** monitora Drive in automatico.

---

## I. Risoluzione delle divergenze

- Il repository / Git verificato **prevale** sul mirror.
- Dopo un aggiornamento significativo nel repository, risincronizzare il mirror.
- Una copia Drive vecchia **non** deve sovrascrivere il repository.
- Se Drive e repository divergono, l’agente deve **segnalarlo** nel report.
- Nessuna riconciliazione silenziosa.

Gerarchia sintetica in caso di conflitto (allineata alla regola `000`): istruzioni utente correnti → repository/Git → `docs/stato-operativo.md` canonico → mirror Drive.

---

## J. Checklist di verifica

- [ ] Cartella Drive stabile e nominata in modo coerente
- [ ] Stessi percorsi relativi del repository
- [ ] Nessun duplicato (`(1)`, `copy`, versioni manuali)
- [ ] Nessun segreto / `.env` / dump / credenziali
- [ ] `docs/stato-operativo.md` aggiornato rispetto all’ultimo consolidamento rilevante
- [ ] Sincronizzazione Drive completata
- [ ] Link accessibile con l’account corretto
- [ ] Prova di lettura da ChatGPT nella ripresa corrente
