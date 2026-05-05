# Production readiness (light) — deploy e operatività

Documento operativo per **deploy ripetibili**, verifica ambiente e **smoke test** prima di fasi successive (billing Stripe/Paddle, Edge Functions, tenant switcher, ecc.). Allineato allo stato attuale del repository: frontend statico, Supabase gestito, nessun backend Node obbligatorio nell’app principale.

---

## 1. Scopo

- **Frontend:** React + Vite + TypeScript, build statica (`npm run build` → output **`dist`**, publish directory su Render).
- **Backend dati / auth:** Supabase (PostgreSQL, Auth, Realtime, RLS). Le migration SQL vivono in `supabase/migrations/` e vanno applicate nel progetto Supabase (SQL Editor o pipeline interna), **non** dal solo deploy Render.
- **Hosting statico:** es. [Render](https://render.com) Static Site (configurazione tipica documentata in `README.md`; **nessun** `render.yaml` versionato in questo repo al momento).
- **Nessun** backend Node obbligatorio per il flusso principale dell’app SaaS descritto nelle regole progetto.
- **Nessuna** Supabase Edge Function richiesta oggi.
- **Billing** (Stripe/Paddle, checkout, webhook): **non** implementato; i campi `plan_*` su `public.tenants` sono readiness leggera (migration 005), non pagamenti reali.

**Coordinamento deploy:** se una release del frontend **seleziona colonne o assume schema** non ancora presente su Supabase, la build o il runtime falliranno (`column ... does not exist`). Applicare le migration **incrementali in ordine** su Supabase **prima o in pari** al deploy che le richiede.

---

## 2. Ambienti

| Ambiente | Ruolo | Note |
|----------|--------|------|
| **Sviluppo locale** | `npm run dev` (Vite, porta predefinita 3000 in `package.json`) | Variabili in `.env` / `.env.local` (non committate). Vedi sezione 3. |
| **Progetto Supabase** | Auth, DB, Realtime, RLS | Staging vs produzione: usare due progetti se possibile; stesse migration, dati separati. |
| **Render (static site)** | Hosting della build `dist` | Build command `npm run build`, publish directory `dist`; env `VITE_*` impostate nel dashboard Render (build-time). |
| **Tenant demo** (opzionale) | Workspace marcato per demo / test controllati | Runbook: `docs/demo-tenant.md`; SQL manuali: `docs/sql/demo-tenant-*.sql`. |

Dove mancano dettagli organizzativi (nomi esatti dei servizi Render, branch di produzione), usare la checklist interna del team e annotare URL e branch nel runbook aziendale (fuori repo se contiene dati sensibili).

---

## 3. Variabili ambiente frontend

Nomi effettivi usati dal client (vedi `src/lib/supabaseClient.ts` e `src/vite-env.d.ts`):

| Variabile | Obbligatoria | Ruolo |
|-----------|--------------|--------|
| `VITE_SUPABASE_URL` | Sì | URL del progetto Supabase (es. `https://<project-ref>.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | Sì | Chiave **anon / public** del progetto. È pensata per il client: la sicurezza dipende da **RLS** e da Auth, non dal nascondere questa chiave nel bundle. |
| `GEMINI_API_KEY` | No | Opzionale: `vite.config.ts` espone `process.env.GEMINI_API_KEY` in build tramite `loadEnv`. Non è prefissata `VITE_`. Non committare valori reali; non usare per segreti che devono restare server-side. |

**Regole:**

- **Non** usare mai `service_role` o altri secret nel frontend o in variabili `VITE_*`.
- **Non** committare file `.env` con valori reali.
- Usare **solo placeholder** in `.env.example` (vedi root del repo).

---

## 4. Pre-deploy checklist

- [ ] `git status` pulito (o solo modifiche volute e revisionate).
- [ ] Branch e commit corretti (es. `main` / release tag).
- [ ] Migration nuove **lette e testate** su staging; ordine rispettato (vedi sezione 5).
- [ ] Se il frontend legge **nuove colonne** o tabelle: DB aggiornato **prima** del deploy che le usa.
- [ ] `npm run lint` (nel repo: `tsc --noEmit`) senza errori.
- [ ] `npm run build` senza errori (warning chunk size: vedi sezione 9).
- [ ] Su Render: variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` presenti e corrette per l’ambiente target.
- [ ] Nessuna chiave reale, password o email di test nei file versionati.
- [ ] Se si usa il **tenant demo** in presentazione: verificare stato con `docs/demo-tenant.md` e `docs/sql/demo-tenant-verify.sql` (se rilevante per la release).

---

## 5. Supabase — checklist migration

- [ ] Applicare migration **incrementali in ordine** (`supabase/migrations/001_expenses_user_rls.sql` baseline se necessario, poi `002`, `003`, `004`, `005` secondo lo stato del progetto — vedi `docs/saas-refactor-plan.md`).
- [ ] Controllare output ed eventuali errori SQL nel SQL Editor (o log della pipeline).
- [ ] **Non** modificare RLS o oggetti critici a mano senza migration equivalente e documentazione.
- [ ] **Non** cancellare backup in `private.backup_*` (se presenti) senza piano esplicito.
- [ ] **Non** cancellare `public.expenses_orphan_archive_002` senza piano (dati di audit/backfill).
- [ ] **Post-migration (controlli suggeriti):**
  - Spese senza tenant:  
    `select count(*) as expenses_without_tenant from public.expenses where tenant_id is null;`  
    atteso **`0`** dopo backfill coerente (come da piano 002).
  - Tenant con metadata piano (dopo 005): campi `plan_code`, `subscription_status`, `is_demo`, `trial_ends_at` popolati o con default attesi.
  - Se la migration tocca Realtime su `DELETE`: verificare `replica identity full` su `public.expenses` (migration **004**) e smoke Realtime delete (due tab).

---

## 6. Render — checklist deploy

- [ ] Branch/commit collegato al servizio Static Site è quello desiderato.
- [ ] Capire se il deploy è **automatico** al push o **manuale**; se il push non ha triggerato build, usare **Manual Deploy** dal dashboard Render.
- [ ] Aprire **build logs**: build completata, nessun errore fatale.
- [ ] Dopo pubblicazione: **hard refresh** sul browser (o finestra privata) per evitare asset/cache vecchi.
- [ ] Aprire **console** del browser: nessun errore rosso critico su bootstrap.
- [ ] Verificare che il **commit** deployato (Render mostra spesso SHA o messaggio) corrisponda alla release prevista.

---

## 7. Post-deploy — smoke test manuale

Eseguire in ordine (adattare all’account di test):

1. **Login** con utente di test.
2. **Lista expenses** caricata senza errori.
3. **Create** nuova spesa.
4. **Update** spesa esistente.
5. **Delete** spesa (verificare scomparsa dalla lista).
6. **Realtime:** due schede/browser sulla stessa sessione (o due utenti se test multi-utente): verificare eventi **insert / update / delete** propagati.
7. **Logout** e **login** di nuovo.
8. **Tenant demo** (se in uso): login con account demo dedicato; dati coerenti con runbook `docs/demo-tenant.md`.
9. **SQL (ruolo con lettura su `public.expenses`):**  
   `select count(*) as expenses_without_tenant from public.expenses where tenant_id is null;`  
   atteso **`0`**.

---

## 8. Rollback operativo

| Azione | Effetto |
|--------|---------|
| **Rollback frontend su Render** | Ripristina il sito statico al **deploy precedente** (dashboard Render → Deploys → rollback / redeploy precedente, secondo UI attuale). |
| **Database** | Il rollback del **sito non annulla** migration SQL già applicate su Supabase. Schema e dati restano come dopo l’ultima migration eseguita. |
| **Migration additive** (es. colonne opzionali con default, come pattern della 005) | Rollback frontend verso client vecchio è spesso **compatibile** se il vecchio client non seleziona colonne nuove; verificare sempre se il vecchio client è ancora supportato. |
| **Migration distruttive future** | Richiedono **piano di rollback DB** dedicato (backup, revert script, finestra di manutenzione) **prima** dell’esecuzione. |
| **Backup / archivi** | Mai eliminare `expenses_orphan_archive_002` o `private.backup_*` senza piano approvato. |

---

## 9. Warning Vite — chunk size > 500 kB

- La build di produzione può completarsi con **warning** sulla dimensione dei chunk (soglia tipica **> 500 kB**).
- Il warning **non blocca** il deploy se `npm run build` termina con successo.
- **Interventi futuri** (non obbligatori in questa fase): `dynamic import()`, `build.rollupOptions.output.manualChunks`, lazy loading delle route o di librerie pesanti (es. grafici).
- **Questa fase** non impone code splitting: evitare refactor ampi che rischiano regressioni su login, CRUD expenses o Realtime.

---

## 10. Incident — quick checks

| Sintomo | Cosa verificare |
|---------|-----------------|
| Errore SQL / client: `column ... does not exist` | Migration non applicata su Supabase, oppure deploy frontend **prima** dello schema aggiornato. Allineare ordine deploy/DB. |
| Auth / sessione instabile o redirect errati | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` su Render; URL di redirect e Site URL in **Supabase Auth** settings. |
| `permission denied` / dati mancanti (RLS) | Membership su `tenant_memberships`, `profiles.default_tenant_id`, policy RLS (nessun bypass con `service_role` nel client). |
| Realtime: delete non notificato / payload incompleto | Migration **004** (`replica identity full` su `public.expenses`); filtro canale con `tenant_id` coerente lato client. |
| Dati demo errati o sporchi | Runbook `docs/demo-tenant.md` e script in `docs/sql/` (reset/seed **manuali**, con guardie). |

---

## Riferimenti

- Piano refactor e fasi: `docs/saas-refactor-plan.md`
- Tenant demo: `docs/demo-tenant.md`
- Audit architetturale: `docs/saas-audit.md`
- Deploy Render (istruzioni minime): `README.md`
