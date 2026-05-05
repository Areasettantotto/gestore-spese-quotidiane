# Audit architetturale SaaS multi-tenant

Documento generato in seguito alle Project Rules del repository.  
**Ambito:** stato attuale della codebase rispetto a un obiettivo **SaaS multi-tenant production-ready** (Supabase, static deploy, RLS, billing readiness).  
**Nota:** nessuna modifica applicativa è stata introdotta durante questo audit.

**Aggiornamento fase 1:** schema tenant-first, helper SQL e RLS tenant-aware sono descritti e versionati in `supabase/migrations/002_saas_tenant_rls.sql`; le decisioni di progetto sono in [`docs/saas-refactor-plan.md`](./saas-refactor-plan.md). Il frontend legge `profiles.default_tenant_id` e invia `tenant_id` sulle mutazioni; Realtime può filtrare per `tenant_id`.

---

## 1. Stato attuale

### Stack e deploy

- **Frontend:** React 19, Vite 6, TypeScript, Tailwind CSS 4.
- **Dati remoti:** `@supabase/supabase-js` con client singleton (`src/lib/supabaseClient.ts`) usando solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (allineato alle regole: niente `service_role` nel client).
- **Deploy atteso:** sito statico (`vite build` → `dist`), documentato in `README.md` (es. Render).

### Modello dati e migrazioni

- Le migration SQL versionate sono in `supabase/migrations/` e seguono naming incrementale (`001` ... `006`).
- Lo script:
  - aggiunge `user_id uuid` su `public.expenses` con FK verso `auth.users` e `on delete cascade`;
  - abilita **RLS** su `expenses`;
  - definisce quattro policy CRUD basate su **`auth.uid() = user_id`**.

### Supabase Auth

- `src/main.tsx` avvolge l’app in `AuthGate`.
- `src/AuthGate.tsx`: `getSession`, `onAuthStateChange`, login con `signInWithPassword`; messaggio “Contatta l’amministratore” per la registrazione (flusso **invitation-only** implicito).
- `src/App.tsx` legge sessione/utente per caricare spese e per `signOut`.
- Non compaiono OAuth, magic link, reset password in UI, MFA o gestione profilo tenant.

### Policy RLS

- Documentate e implementate nella catena `supabase/migrations/*.sql` per la tabella `expenses`, con evoluzione da modello single-user a tenant-aware.

### Accesso dati dal frontend

- Tutta la logica CRUD su `expenses` è in **`src/App.tsx`**: `select('*')`, `insert`, `update`, `delete` chiamati direttamente sul client Supabase.
- Non esistono layer dedicati (repository, servizi, mapper DTO ↔ dominio) come richiesto dalle regole di architettura del workspace.

### Campi `user_id` / `owner_id`

- **Migration SQL:** definisce e protegge solo **`user_id`** nelle policy RLS.
- **`src/App.tsx`:** in insert imposta sia `user_id` che `owner_id`; in update imposta `owner_id`.
- **`src/features/expenses/useExpensesRealtime.ts`:** filtro Realtime opzionale su **`owner_id=eq.<uuid>`**.
- **`README.md`** menziona entrambe le colonne come prerequisito operativo.
- **Rischio di inconsistenza:** se nel database esiste solo `user_id` (come da migration), filtri e update su `owner_id` possono fallire o restare ignorati a seconda dello schema reale; se esistono entrambe ma divergono, RLS e Realtime possono comportarsi in modo non allineato.

### Realtime

- Hook `useExpensesRealtime` sottoscrive `postgres_changes` sulla tabella `public.expenses` con evento `*`.
- Filtro applicato solo quando `opts.scopeUserId` è valorizzato (in `App.tsx` coincide con `user.id`), su colonna **`owner_id`**, non **`tenant_id`** (inesistente nel modello attuale).

### Struttura `src/features`

- Presente solo `src/features/expenses/useExpensesRealtime.ts`.
- Non c’è partizione per dominio (tenancy, auth, billing, categorie, ecc.): la feature “spese” è sostanzialmente tutta in `App.tsx`.

### `package.json` e dipendenze

- Dipendenze **effettivamente usate** nel codice TypeScript/React tracciato: React, Vite plugin, Tailwind, Supabase, lucide-react, motion, recharts, date-fns, clsx, tailwind-merge.
- Dipendenze **presenti ma non referenziate** negli sorgenti `.ts`/`.tsx` del progetto:
  - `@google/genai` (in `package.json`; `.env.example` cita `GEMINI_API_KEY` ma le variabili esposte sono principalmente Supabase);
  - `better-sqlite3`, `express`, `dotenv` — coerenti con uno **storico prototipo locale** o script non inclusi nel glob analizzato, ma **non** integrati nel flusso principale Vite/React descritto in README.
- `vite.config.ts` definisce `process.env.GEMINI_API_KEY` nel bundle; al momento nessun file sorgente nel repo importa `@google/genai` (dead path / preparazione futura).

### Billing (Stripe / Paddle)

- Nessuna dipendenza Stripe/Paddle, nessuna tabella subscription/invoice, nessun Edge Function o webhook documentato nel repo.

### Logiche sincrone vs job in background

- Operazioni utente (load, insert, update, delete) sono **tutte inline** nell’handler React / effetti; delete con **ottimismo** lato UI poi reconcile su errore.
- Non ci sono code, cron Supabase, Edge Functions o worker per operazioni pesanti (export, aggregazioni bulk, notifiche, sync esterne).

---

## 2. Lacune SaaS

| Area | Lacuna |
|------|--------|
| **Multi-tenancy** | Assenza di `tenant_id` (o workspace), tabelle `tenants` / `tenant_memberships`, contesto `activeTenantId` e switch tenant. |
| **RLS tenant-aware** | Policy attuali = isolamento **per utente** su `user_id`, non per membership su tenant. |
| **Dominio condiviso** | Nessun modello per più utenti sullo stesso workspace con ruoli (admin, member, billing). |
| **Accesso dati** | Nessun repository centralizzato; impossibile garantire in un solo punto filtri `tenant_id` e mapping errori. |
| **Migrazioni** | Un solo file SQL manuale; niente versioning Supabase CLI / CI per schema e policy. |
| **Auth prodotto** | Self-service signup, reset password, inviti, email templates e collegamento tenant mancanti o solo accennati. |
| **Realtime** | Nessun filtro per `tenant_id`; dipendenza da colonna `owner_id` non allineata alla migration versionata. |
| **Tipi di dominio** | `src/types.ts` (`Expense`) non include `user_id` / `tenant_id`; mapping ad hoc con `any` in `App.tsx`. |
| **Billing** | Nessuna astrazione provider, nessun webhook server-side, nessun legame subscription → tenant. |
| **Osservabilità e audit** | Nessuna tabella audit log, tracciamento “chi ha modificato cosa” per tenant. |
| **Qualità gate** | Script `lint` = solo `tsc --noEmit`; assenza di test automatici, ESLint, o check SQL in CI. |

---

## 3. Rischi di sicurezza / isolamento dati

1. **Isolamento “tenant” inesistente:** con RLS solo su `user_id`, un eventuale secondo modello (es. condivisione spese) richiede redesign completo; dati di organizzazioni diverse non sono separabili per workspace.
2. **Doppio campo owner (`user_id` vs `owner_id`):** se le policy usano solo `user_id` ma il client o Realtime usano `owner_id`, si possono avere **insert/update che violano le aspettative**, eventi Realtime persi, o righe visibili in modo incoerente.
3. **Carico iniziale senza filtro utente/tenant in query:** `select('*').order(...)` si affida interamente a RLS; è corretto se RLS è stretto, ma **qualsiasi errore di policy** (policy mancante, tabella senza RLS in un branch DB) espone tutte le righe.
4. **Realtime senza `tenant_id`:** in un futuro multi-tenant, sottoscrivere per tabella senza filtro tenant adeguato aumenta superficie di leakage se le policy Realtime non sono configurate con la stessa granularità delle query.
5. **Segreti e chiavi:** il client è conforme (solo anon). Resta il rischio operativo di **chiavi AI o altre** iniettate via `define` in Vite se un domani il codice client chiamasse API con segreto: le chiavi sensibili non devono mai finire in `VITE_*` o in `define` lato bundle pubblico.
6. **Dipendenze server (`express`, `better-sqlite3`):** se in futuro fossero usate in uno script con credenziali, andrebbero tenute fuori dal percorso “static + Supabase” salvo decisione architetturale documentata (regola progetto).

---

## 4. Refactor prioritario in fasi

### Fase 0 — Allineamento e baseline (prima del multi-tenant)

- Allineare **schema documentato**, **migration.sql** e **codice** su un solo modello di ownership (`user_id` **oppure** `owner_id`, o entrambi con vincoli e trigger di sincronizzazione).
- Aggiornare filtro Realtime e policy in modo coerente.
- Introdurre accesso dati tramite un modulo **repository** (anche minimo) per `expenses`.

### Fase 1 — Fondamenta multi-tenant + RLS

- Introdurre tabelle `tenants` (o `workspaces`) e `tenant_members` (user ↔ tenant, ruolo).
- Aggiungere `tenant_id` a `expenses` (e indici composti); migrare dati esistenti (es. un tenant default per utente).
- Funzioni SQL helper (`is_tenant_member`, eventualmente `has_tenant_role`) e **policy RLS** che usano membership, non solo `auth.uid() = user_id`.
- Contesto applicativo: `activeTenantId` risolto dopo login (e UI per switch, se previsto).

### Fase 2 — Frontend e Realtime

- Spostare query/mapping in `src/features/expenses/` (repository + tipi row/ dominio).
- Realtime filtrato per **`tenant_id`** coerente con `activeTenantId`.
- Ridurre `App.tsx` a orchestrazione UI.

### Fase 3 — Billing readiness

- Tabelle `subscriptions` (o equivalente) con `tenant_id` e RLS.
- Edge Function (o backend dedicato) per webhook Stripe/Paddle, idempotenza eventi.
- Porte TypeScript provider-agnostic e feature flag per piano.

### Fase 4 — Operazioni asincrone e prodotto

- Job per export CSV/PDF, ricalcoli, digest email: Supabase **Edge Functions** + **pg_cron** / queue, senza introdurre un backend Node obbligatorio nel path principale salvo decisione esplicita.
- Audit log per tenant.
- Hardening Auth (reset password, inviti, MFA se richiesto).

---

## 5. File da modificare nella fase 1

Ordine indicativo; i primi sono i più impattati per sicurezza e modello dati.

| File / percorso | Motivo |
|-----------------|--------|
| `supabase/migrations/001_expenses_user_rls.sql` (e successive) | Schema `tenants` / `tenant_members`, `tenant_id` su `expenses`, funzioni helper, policy RLS tenant-aware; allineamento `user_id`/`owner_id`. |
| `src/lib/supabaseClient.ts` | Eventuali factory per client per test; invariato per chiavi se resta solo anon. |
| `src/types.ts` | Estendere tipi dominio / row DB (`tenant_id`, ownership coerente). |
| `src/features/expenses/useExpensesRealtime.ts` | Filtro `tenant_id`; rimuovere dipendenza incoerente da `owner_id` se si unifica il modello. |
| `src/features/expenses/*` (nuovi: repository, mapper) | Centralizzare query e `tenant_id` / error mapping. |
| `src/App.tsx` | Delegare CRUD al repository; inject `activeTenantId`; ridurre `any`. |
| `src/AuthGate.tsx` / nuovo `src/features/tenancy/*` o `src/contexts/*` | Propagare sessione + tenant attivo dopo login (lettura memberships). |
| `README.md` | Schema atteso, variabili env, istruzioni migrazioni e RLS. |
| `.env.example` | Documentare solo variabili usate dal path statico; evitare ambiguità con chiavi server-only. |

---

## 6. Criteri di accettazione

- **Dati:** ogni riga di `expenses` ha `tenant_id` non nullo; FK e indici verificati; migrazioni riproducibili (CLI o script documentato ed eseguibile in CI o checklist release).
- **RLS:** nessun accesso cross-tenant con utente autenticato membro di un solo tenant; utente con membership su più tenant vede solo i dati del tenant attivo (o secondo regole ruolo documentate).
- **Client:** nessun secret o `service_role` nel repo frontend o in variabili `VITE_*`; solo anon key.
- **Repository:** tutte le query `expenses` passano da un modulo che accetta esplicitamente `tenantId` (o contesto derivato tracciabile).
- **Realtime:** sottoscrizioni limitate al tenant attivo; nessun canale “globale” per dati sensibili senza filtro equivalente alle policy.
- **Billing (readiness minima):** modello dati subscription legato a `tenant_id` + piano documentato; webhook non nel bundle Vite.
- **Qualità:** `npm run lint` e `npm run build` verdi dopo le modifiche; assenza di regressioni su login, CRUD e Realtime per uno o più tenant di test.

---

## 7. Comandi di validazione

Eseguiti dalla root del repository (come da regole quality gates del progetto):

```bash
npm install
npm run lint
npm run build
```

Verifiche aggiuntive consigliate **dopo** l’implementazione delle migrazioni (manuali o CLI Supabase):

- Applicare le SQL su un progetto Supabase di **staging** e controllare in Dashboard: **RLS enabled**, elenco **Policies**, **Realtime** publication per `expenses` con stesso modello di accesso.
- Test manuale: due utenti su due tenant distinti non vedono le spese dell’altro (query + Realtime).

---

## Riepilogo

Il progetto è un **MVP single-user** ben avviato su Supabase Auth e RLS per-owner, ma **non** ancora un SaaS multi-tenant: mancano tenant, membership, RLS per tenant, stratificazione dati, migrazioni strutturate, billing e job asincroni. La priorità immediata è **allineare ownership nel DB e nel codice**, poi introdurre **`tenant_id` + RLS membership** e spostare l’accesso dati fuori da `App.tsx`.
