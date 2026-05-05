# Piano refactor SaaS — Fase 1 (implementata)

Questo documento descrive le scelte della **fase 1**: schema multi-tenant, RLS e compatibilità con i dati esistenti. Le istruzioni operative restano in `README.md` e nelle migration in `supabase/migrations/`.

## Migration

- **`supabase/migrations/001_expenses_user_rls.sql`**: baseline `user_id` + policy owner-only storiche.
- **`supabase/migrations/002_saas_tenant_rls.sql`**: da eseguire **dopo** la baseline nello SQL Editor Supabase (o pipeline equivalente).
- **`supabase/migrations/003_expenses_tenant_insert_guard.sql`**: da eseguire **dopo** la 002. Aggiunge solo una guardia difensiva lato database (funzione + trigger `BEFORE INSERT` su `public.expenses`): se `tenant_id` è omesso o `NULL`, viene valorizzato da `profiles.default_tenant_id` dell’utente corrente; se `tenant_id` è già valorizzato, non viene modificato. Non tocca righe esistenti. Serve a tollerare **vecchie versioni del frontend**, **cache** o **PWA** che inviano ancora insert senza `tenant_id`, evitando errori `NOT NULL` / mismatch con le policy mentre il client viene aggiornato.
- **`supabase/migrations/004_expenses_realtime_delete_replica_identity.sql`**: da eseguire quando serve Realtime con eventi `DELETE` completi. Imposta `replica identity full` su `public.expenses` così il payload Realtime include la riga eliminata (chiave / colonne) senza cambiare RLS o dati applicativi.
- **`supabase/migrations/005_tenant_plan_readiness.sql`**: da eseguire **dopo** la 002 (e coerente con il client che legge `public.tenants`). Aggiunge campi di **readiness** su `public.tenants` per piano e stato subscription a livello **tenant** (non utente). **Non** introduce provider di pagamento, checkout, webhook né Edge Functions.

La 002 è pensata come script incrementale idempotente dove ha senso (drop/ricrea policy, `if not exists` su indici/tabelle). La 003 è idempotente (`CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`). La 005 è idempotente su colonne (`IF NOT EXISTS`) e sui vincoli nominati (`pg_constraint`).

### Preflight (prima di applicare la 002)

Eseguire nell’SQL Editor (staging) **con un ruolo che vede `auth.users` e `public.*`** (es. postgres / dashboard). Annotare i risultati; se qualche conteggio è inatteso, correggere i dati **prima** della migration.

**Nota:** su un database dove è stata applicata **solo** `migration.sql` (001), la tabella `public.profiles` **non esiste ancora**: le query che la referenziano vanno omesse o eseguite solo dopo che lo schema tenant è stato introdotto (es. clone post-migration). Le query su `public.expenses` e `auth.users` restano valide in ogni caso.

```sql
-- Totale righe spese
select count(*) as expenses_total from public.expenses;

-- Spese senza user_id
select count(*) as expenses_user_id_null
from public.expenses
where user_id is null;

-- Colonne presenti su public.expenses (verificare se owner_id / tenant_id esistono già)
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'expenses'
  and column_name in ('user_id', 'owner_id', 'tenant_id')
order by column_name;

-- Se owner_id esiste: spese con owner_id nullo (eseguire solo se la colonna c’è)
-- select count(*) as expenses_owner_id_null from public.expenses where owner_id is null;

-- Stima righe che non riceveranno tenant_id dal backfill (nessun profilo con default_tenant per user_id)
-- Prima della 002 non c’è ancora tenant_id: si usa solo user_id come ancoraggio al profilo.
select count(*) as expenses_risk_no_tenant
from public.expenses e
where not exists (
  select 1
  from public.profiles p
  where p.id = e.user_id
    and p.default_tenant_id is not null
);

-- Utenti in auth senza riga in public.profiles (dopo eventuale provisioning manuale parziale)
select count(*) as auth_users_without_profile
from auth.users au
where not exists (select 1 from public.profiles p where p.id = au.id);

-- Trigger già presenti su auth.users (evitare conflitti con on_auth_user_created)
select tgname, pg_get_triggerdef(t.oid, true) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
```

Dopo la migration, in caso di spese “orfane”, la tabella `public.expenses_orphan_archive_002` contiene uno snapshot JSON per riga rimossa da `expenses` (vedi sotto).

### Applicazione su Supabase staging

1. Backup o snapshot del progetto staging (Dashboard Supabase).
2. Eseguire le query di **preflight** e salvare l’output.
3. Incollare ed eseguire `supabase/migrations/001_expenses_user_rls.sql` se staging non l’ha ancora applicata.
4. Incollare ed eseguire `supabase/migrations/002_saas_tenant_rls.sql` in un’unica transazione o in blocco unico (SQL Editor → Run).
5. Verificare: `select count(*) from public.expenses where tenant_id is null` → `0`.
6. Se `expenses_orphan_archive_002` ha righe, valutare ripristino manuale o attribuzione tenant prima di cancellare l’archivio.
7. Test smoke: signup utente test, insert spesa da app, controlli RLS secondo `docs/saas-rls-test-plan.md`.

## Modello dati

| Oggetto | Scopo |
|--------|--------|
| `public.tenants` | Workspace; `is_personal = true` per il tenant creato alla registrazione. Dopo la **005** include campi opzionali di readiness commerciale (`plan_code`, `subscription_status`, `is_demo`, `trial_ends_at`) — vedi sezione **FASE D**. |
| `public.profiles` | Una riga per utente (`id` = `auth.users.id`), con `default_tenant_id` verso il tenant personale. |
| `public.tenant_memberships` | Membri con ruolo `admin`, `user` o `billing` (check constraint). |

Ruoli:

- **`admin`**: membro con privilegi amministrativi sul tenant (stesso trattamento di `user` sulle spese in fase 1).
- **`user`**: può leggere tutte le spese del tenant e creare/modificare/cancellare **solo le proprie** righe (`user_id = auth.uid()`), come nel modello precedente.
- **`billing`**: può **solo leggere** le spese del tenant (policy `SELECT` basata su `is_tenant_member`; niente `admin`/`user` nelle policy di scrittura).

## `expenses`

- Aggiunta colonna **`tenant_id`** `NOT NULL` con FK verso `tenants`.
- **`user_id`** / **`owner_id`**: mantenuti; `owner_id` viene allineato a `user_id` dove mancante.
- Backfill: `tenant_id` da `profiles.default_tenant_id` per il proprietario della riga.
- Righe che **non** possono ricevere un `tenant_id` dopo il backfill: copia esplicita in `public.expenses_orphan_archive_002` (`source_row` JSON), poi rimozione da `public.expenses`, così non c’è perdita silenziosa; la colonna `tenant_id` diventa `NOT NULL` solo dopo questo passo.

Indici: `idx_expenses_tenant_id`, `idx_expenses_tenant_date` (`tenant_id`, `date` desc).

## Funzioni SQL

Tutte **`STABLE`**, **`SECURITY DEFINER`**, `search_path` vuoto e riferimenti qualificati `public.*` dove applicabile (pattern consigliato per policy helper).

| Funzione | Comportamento |
|----------|----------------|
| `is_tenant_member(uuid)` | `true` se `auth.uid()` ha una riga in `tenant_memberships` per quel `tenant_id`. |
| `has_tenant_role(uuid, text[])` | `true` se il membro corrente ha uno dei ruoli indicati. |
| `default_tenant_for_user()` | Restituisce `profiles.default_tenant_id` per `auth.uid()` (utile a query e tooling; il client attuale legge anche direttamente `profiles`). |

`GRANT EXECUTE` solo a ruolo `authenticated` (non esporre ad `anon`).

## RLS

- **`tenants`**: `SELECT` solo se membro del tenant.
- **`profiles`**: `SELECT` / `UPDATE` solo sulla propria riga (`id = auth.uid()`). Nessuna `INSERT` da client: provisioning solo trigger / migration.
- **`tenant_memberships`**: `SELECT` se la riga è propria o se si è membri dello stesso tenant (per future UI di team). Nessuna mutazione da client in fase 1.
- **`expenses`**: rimosse le policy `allow_*_owner`; nuove policy `expenses_*_tenant` basate su `is_tenant_member` / `has_tenant_role` e, per scrittura, `user_id = auth.uid()`.

RLS resta **sempre abilitato** sulle tabelle interessate; nessun bypass client con `service_role`.

## Registrazione utente

Trigger `on_auth_user_created` su `auth.users`: dopo ogni insert crea tenant personale, riga `profiles` e membership `admin`.

**Nota:** se il progetto Supabase definiva già un trigger omonimo o una `handle_new_user` diversa, va verificato manualmente un solo flusso di provisioning (questa migration fa `DROP TRIGGER IF EXISTS` e sostituisce la funzione). La funzione usa `search_path` vuoto e qualificazione `public.*`; viene concesso `EXECUTE` a `supabase_auth_admin` se il ruolo esiste (hosting Supabase).

## Frontend (cambiamento minimo)

- Dopo login si legge `profiles.default_tenant_id` e si usa come **`activeTenantId`** per insert/update/delete, caricamento lista (`.eq('tenant_id', ...)`) e filtro Realtime (`tenant_id=eq...`). Senza tenant predefinito si mostrano messaggi di errore e non si apre subscription Realtime ampia.
- Dopo la **FASE D**, il contesto tenant include anche uno snapshot di piano (`activeTenantPlan`) letto da `public.tenants` per il workspace predefinito, senza cambiare UX in modo significativo e senza gating commerciale.

## FASE D — Tenant plan readiness (completata in codice / migration)

**Scopo:** preparare il modello SaaS a distinguere workspace free / trial / paid / internal / demo (incluso un tenant **demo** per live e presentazioni), **senza** Stripe/Paddle, checkout, webhook, dashboard billing, Edge Functions obbligatorie, limiti commerciali effettivi o blocchi hard delle feature.

**Principio:** il piano e lo stato commerciale (subscription) appartengono al **tenant**, non al singolo utente. Il pagatore futuro può essere un utente con ruolo adeguato, ma i campi di readiness sono sulla riga `public.tenants`.

### Migration `005_tenant_plan_readiness.sql`

Aggiunge su `public.tenants`:

| Colonna | Tipo | Default | Note |
|--------|------|---------|------|
| `plan_code` | `text NOT NULL` | `'free'` | Valori ammessi: `free`, `trial`, `paid`, `internal`, `demo` (check constraint). |
| `subscription_status` | `text NOT NULL` | `'active'` | Valori ammessi: `active`, `trialing`, `past_due`, `canceled`, `suspended`. Specchio “logico” per una futura tabella subscription; **nessun** provider ancora collegato. |
| `is_demo` | `boolean NOT NULL` | `false` | Flag operativo per tenant sandbox / presentazioni. Combinabile con `plan_code = 'demo'`. |
| `trial_ends_at` | `timestamptz` | `NULL` | Opzionale; fine trial quando applicabile. |

I tenant esistenti ricevono automaticamente i default alla prima applicazione della migration: nessuna perdita dati, nessuna modifica a `public.expenses`, RLS expenses invariata. Gli insert tramite `handle_new_user()` continuano a funzionare (colonne con default).

**Non implementato in questa fase:** billing provider, pagina piani, tenant switcher, dashboard admin avanzata, reset automatico dati demo, seed demo nel repo.

### Tenant demo (spostato in FASE E)

La procedura operativa (verify / mark / reset / seed), la checklist pre-live e i rischi sono documentati in **`docs/demo-tenant.md`** e negli script manuali in **`supabase/snippets/demo/demo-tenant-*.sql`**. La FASE D resta focalizzata sulla migration 005 e sul client readiness; la **FASE E** copre l’operatività del tenant demo senza nuove migration schema.

### Frontend (`src/features/tenancy/*`)

Tipi e snapshot: `TenantPlanCode`, `TenantSubscriptionStatus`, `TenantPlanSnapshot` (alias `TenantBillingReadiness`). Helper in `tenancy.mapper.ts`: `isDemoTenant`, `isFreePlan`, `isPaidPlan`, `isTrialPlan`, più `DEFAULT_TENANT_PLAN_SNAPSHOT` se la riga tenant non è disponibile. `useActiveTenant` espone `activeTenantPlan` oltre a `activeTenantId` / `membershipRole`. Nessuna nuova query in `App.tsx`.

**Ordine deploy consigliato:** applicare la migration **005** su Supabase **prima** (o insieme) al deploy del frontend che seleziona le nuove colonne; altrimenti la `select` su `tenants` fallisce finché lo schema non è aggiornato.

### Billing reale (fase successiva)

Stripe/Paddle, checkout, webhook idempotenti e RLS su eventuali tabelle `subscriptions`/`invoices` saranno una **fase successiva** esplicita; restano vincoli architetturali in `.cursor/rules/040-billing-readiness.mdc`.

## FASE E — Demo tenant operational readiness (completata in documentazione / SQL manuali)

**Scopo:** rendere il tenant demo **ripetibile e sicuro** per live, presentazioni e test manuali, senza billing provider, senza backend Node, senza Edge Functions, senza dashboard admin, senza tenant switcher e senza automazioni distruttive o schedulate.

**Principio:** il tenant demo è un tenant normale con `plan_code = 'demo'`, `subscription_status = 'active'`, `is_demo = true`; le spese demo hanno solo quel `tenant_id`.

**Deliverable:**

| Artefatto | Percorso |
|-----------|----------|
| Runbook operativo | `docs/demo-tenant.md` |
| Verifica tenant / conteggi / igiene `tenant_id` | `supabase/snippets/demo/demo-tenant-verify.sql` |
| Marcatura metadata demo | `supabase/snippets/demo/demo-tenant-mark.sql` |
| Reset controllato solo `public.expenses` del demo | `supabase/snippets/demo/demo-tenant-reset-expenses.sql` |
| Seed spese fittizie (categorie allineate all’app) | `supabase/snippets/demo/demo-tenant-seed-expenses.sql` |

**Non è stata creata una migration schema:** nessun cambiamento a `public.expenses`, RLS expenses, `user_id`/`owner_id`, archivio `expenses_orphan_archive_002` o backup `private.backup_*`. Gli SQL sono **template manuali** con placeholder `<DEMO_TENANT_ID>` / `<DEMO_OWNER_USER_ID>` (mai UUID reali nel repo).

**Non implementato (come da vincoli fase E):** Stripe/Paddle, checkout, webhook, billing reale, reset automatici, `service_role` nel frontend, credenziali o dati personali nel repository.

## FASE F — Production readiness light (completata in documentazione / esempio env)

**Scopo:** rendere più affidabili e ripetibili **deploy**, **rollback**, verifica ambiente, **smoke test** e gestione operativa minima **prima** di billing Stripe/Paddle o altre fasi invasive.

**Deliverable:**

| Artefatto | Percorso / azione |
|-----------|-------------------|
| Checklist pre-deploy, Supabase, Render, post-deploy, smoke test | `docs/production-readiness.md` |
| Procedura rollback operativo (frontend vs DB) | `docs/production-readiness.md` §8 |
| Documentazione variabili ambiente frontend (`VITE_SUPABASE_*`, nota `GEMINI_API_KEY` opzionale) | `docs/production-readiness.md` §3 |
| Nota warning Vite chunk size > 500 kB | `docs/production-readiness.md` §9 |
| Incident quick checks | `docs/production-readiness.md` §10 |
| Template env solo placeholder | `.env.example` |
| README — link minimi a doc deploy / demo / piano | `README.md` |

**Non è stata creata una migration schema:** nessun cambiamento a `public.expenses`, RLS, `public.tenants` oltre a quanto già nelle fasi precedenti, nessuna nuova tabella o policy in questa fase.

**Non implementato (come da vincoli fase F):** Stripe/Paddle, checkout, webhook, billing reale, backend Node obbligatorio per l’app principale, Supabase Edge Functions, dashboard admin, tenant switcher, automazioni distruttive, reset automatici, `service_role` nel frontend, credenziali nel repository, `render.yaml` (non richiesto; deploy configurabile solo da dashboard Render).

## FASE G — Billing data model design (completata in documentazione / SQL draft)

**Stato:** il **design del data model billing** è completato come lavoro di analisi e documentazione. In questa fase **non** sono state introdotte integrazioni operative.

**Esplicitamente fuori scope (nessuna implementazione):**

- Nessuna integrazione **Stripe** (né altro provider di pagamento).
- Nessuna **Supabase Edge Function**.
- Nessun **backend Node** obbligatorio o parallelo per il billing.
- Nessun **checkout** (hosted o embedded).
- Nessun **webhook** (né listener server-side nel prodotto).
- Nessuna **migration schema applicata** al database: lo schema applicativo resta quello delle fasi precedenti.

**Schema esistente invariato in questa fase:**

- **`public.expenses`**: non modificata (colonne, trigger difensivi, indici come già documentati).
- **RLS su `expenses`**: non modificata.

**`public.tenants` come read model leggero (invariato rispetto alla FASE D):** continua a esporre solo i campi di readiness commerciale già introdotti con la migration **005**:

- `plan_code`
- `subscription_status`
- `is_demo`
- `trial_ends_at`

**Documentazione e artefatti draft:**

- Il **design futuro** (entità, flussi di lettura/scrittura, vincoli tenant-first, note su RLS e ruoli) è descritto in **`docs/billing-data-model.md`**.
- Lo **SQL draft non applicato** (tabelle future, indici, commenti operativi) è in **`supabase/snippets/drafts/draft_006_billing_data_model.sql`**. **Non va eseguito in produzione** finché non passa review su staging e non diventa una migration versionata con nome e ordine concordati.

**Tabelle previste nel design (solo su carta / nel draft SQL, non create nel DB in questa fase):**

- `public.tenant_billing_customers`
- `public.tenant_subscriptions`
- `public.billing_events`

**Principi per le fasi successive:**

- Le **scritture** legate al billing (customer, subscription, eventi idempotenti) saranno **solo server-side** (es. Edge Functions, job con chiave privilegiata, o processi operativi con service role **mai** nel bundle frontend).
- Il ruolo **`service_role`** non deve **mai** comparire nel frontend.
- Si prevedono ruoli **`admin`** / **`billing`** (già presenti o estendibili sul membership) per operazioni future: checkout, customer portal, sola lettura billing — da dettagliare quando si implementa il provider.

**Fase successiva suggerita (post-G):** **FASE H2** — creare e applicare una **migration ufficiale** billing **solo dopo** review del draft hardened (FASE H1.1) e prove su staging; nessun apply automatico dalla sola FASE G.

**Nota env:** in questa fase **non** sono state aggiunte variabili Stripe operative in `.env.example` (né obbligatorie altrove); resta la preferenza di non esporre segreti o placeholder “reali” finché non c’è integrazione.

## FASE H1 — Review tecnica draft billing (completata)

La **review tecnica** dello schema billing in bozza ha concluso che il design è una **buona base**, ma **non ancora pronto** come migration ufficiale senza ulteriore hardening e seconda review.

### FASE H1.1 — Hardening del draft billing schema (completata in documentazione / SQL draft)

| Esito | Dettaglio |
|-------|-----------|
| Review tecnica | Completata (esito: serve hardening prima di versionare come migration). |
| Hardening | Applicato a `docs/billing-data-model.md` e `supabase/snippets/drafts/draft_006_billing_data_model.sql` (mapping snapshot vs stato provider, privacy `billing_events`, cardinalità subscription, GRANT/REVOKE, RLS senza SELECT client su `billing_events`). |
| Database | **Nessun** SQL applicato al database in questa sottofase. |
| Migration ufficiale | Demandata alla FASE H2 dopo hardening e review. |
| `billing_events` | Modello **solo server-side** / audit: nessuna lettura client diretta; `payload` non esposto al frontend. |

## FASE H2 — Migration ufficiale billing schema (completata in codice, non applicata automaticamente)

La migration ufficiale **`supabase/migrations/006_billing_data_model.sql`** è stata creata a partire dal draft hardened (`supabase/snippets/drafts/draft_006_billing_data_model.sql`) con adattamento delle diciture da bozza a migration versionata.

### Esito FASE H2

- Creata migration ufficiale con:
  - `create table if not exists` per `public.tenant_billing_customers`, `public.tenant_subscriptions`, `public.billing_events`
  - vincoli `unique`/`check`/FK, indici e commenti operativi
  - RLS abilitata su tutte e tre le tabelle
  - policy `SELECT` admin/billing solo su customers/subscriptions
  - nessuna policy `SELECT` client su `billing_events`
  - nessuna policy `INSERT`/`UPDATE`/`DELETE` per `authenticated`
  - `REVOKE/GRANT` conservativi (anon senza accesso; authenticated solo `SELECT` su customers/subscriptions, niente accesso a `billing_events`)
- **Nessuna integrazione Stripe** implementata (nessun checkout, webhook, Edge Function o backend Node).
- **Nessuna applicazione automatica a produzione** in questa fase: migration solo versionata nel repository.
- `public.expenses` invariata e RLS su `expenses` invariata.
- `billing_events` confermata come tabella **server-side/audit only**.

**Prossima fase:** **FASE H3** — apply e verifica su staging (preflight, esecuzione controllata migration 006, smoke test RLS e validazione query).

## FASE H4 — Production validation report (completata)

La migration **`supabase/migrations/006_billing_data_model.sql`** e' stata applicata direttamente su Supabase **produzione** (assenza di staging) con validazione pre/post controllata.

### Esito FASE H4

- **Migration 006 applicata in produzione:** completata con esecuzione riuscita.
- **Pre-check produzione:** OK (oggetti baseline presenti, colonne readiness su `public.tenants` presenti, oggetti 006 assenti prima dell'apply).
- **Post-check produzione:** OK (`public.tenant_billing_customers`, `public.tenant_subscriptions`, `public.billing_events` create; RLS attiva su tutte e tre).
- **Policy/permessi billing:** confermato `SELECT` admin/billing su customers/subscriptions; nessuna policy `SELECT` su `public.billing_events`; ruolo `authenticated` senza accesso a `billing_events`.
- **`billing_events` server-side only:** confermato (audit/event log non esposto al client).
- **Regressioni database:** nessuna regressione DB rilevata dopo apply e verifiche.
- **Auth refresh token (nota operativa):** errore "Invalid Refresh Token: Refresh Token Not Found" osservato solo in browser normale al ritorno su tab; non riprodotto in incognito; classificato come session storage locale stale; non bloccante e non attribuito a regressione schema DB.
- **Smoke test produzione:** da completare con checklist operativa post-apply (oppure da marcare come completato al termine dei test manuali).
- **Integrazione Stripe:** nessuna integrazione implementata in questa fase (niente checkout, webhook, Edge Functions, backend Node).
- **Ambito schema esistente:** `public.expenses` non modificata intenzionalmente; RLS su `expenses` non modificata intenzionalmente.

**Prossima fase consigliata (decisione esplicita):**

- **FASE M** — baseline Supabase CLI + migrations replayable per riallineare il flusso change management.
- **oppure FASE I** — Stripe test mode solo dopo decisione esplicita di avvio integrazione provider.

## FASE M — Supabase CLI baseline / replayable migrations (completata: M8)

**Obiettivo fase:** preparare la baseline del workflow Supabase CLI in modo non distruttivo, senza modifiche di produzione e senza introdurre integrazione Stripe.

### Stato operativo raggiunto (M8 completata con successo)

- Supabase CLI installata nel progetto.
- Docker disponibile per l'ambiente locale Supabase.
- `supabase/config.toml` presente nel repository.
- Stack Supabase locale avviato.
- Directory `supabase/migrations/` presente.
- `supabase/migrations/` confermata come directory canonica delle migration.
- `supabase/migrations/000_baseline_current_schema.sql` creata e validata localmente.
- `supabase/migrations_archive/` popolata con le migration legacy `001..006`.
- `npx supabase db reset` in locale completato con successo.
- Warning su `supabase/seed.sql` assente rilevato come non bloccante.

### Vincoli e risultato tecnico

- La baseline locale e' derivata da introspezione read-only dello schema produzione verificato.
- `supabase/migrations/` contiene solo la baseline corrente; `001..006` restano tracciate ma non replayate da zero.
- In questa fase non e' stato eseguito alcun `supabase db push`.
- In questa fase non e' stata effettuata alcuna modifica a produzione.
- In questa fase non e' stata effettuata alcuna integrazione Stripe.
- `supabase db reset` locale e' stato eseguito e validato nel perimetro di review della baseline M8.

### Piano immediato (step successivo)

Dopo la baseline M8, le prossime migration devono essere additive e reviewate separatamente (es. da `007_*` o timestamp successivo), senza alterare retroattivamente la baseline squash.

## Prossimi passi suggeriti

- **FASE M (processo migration):** introdurre baseline Supabase CLI e runbook replayable per staging/prod.
- **FASE I (billing provider):** avviare Stripe in test mode solo dopo decisione esplicita.
- Switch tenant e inviti (membership da UI).
- Repository centralizzato e tipi row con `tenant_id` esplicito.
- Test su staging: due utenti, due tenant, verifica query + Realtime (checklist in `docs/saas-rls-test-plan.md`).
