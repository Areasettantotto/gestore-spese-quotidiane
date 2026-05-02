# Piano refactor SaaS — Fase 1 (implementata)

Questo documento descrive le scelte della **fase 1**: schema multi-tenant, RLS e compatibilità con i dati esistenti. Le istruzioni operative restano in `README.md` e nelle migration in `migrations/`.

## Migration

- **`migrations/migration.sql`** (invariata): baseline `user_id` + policy owner-only storiche.
- **`migrations/002_saas_tenant_rls.sql`** (nuova): da eseguire **dopo** la baseline nello SQL Editor Supabase (o pipeline equivalente).

La 002 è pensata come script incrementale idempotente dove ha senso (drop/ricrea policy, `if not exists` su indici/tabelle).

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
3. Incollare ed eseguire `migrations/migration.sql` se staging non l’ha ancora applicata.
4. Incollare ed eseguire `migrations/002_saas_tenant_rls.sql` in un’unica transazione o in blocco unico (SQL Editor → Run).
5. Verificare: `select count(*) from public.expenses where tenant_id is null` → `0`.
6. Se `expenses_orphan_archive_002` ha righe, valutare ripristino manuale o attribuzione tenant prima di cancellare l’archivio.
7. Test smoke: signup utente test, insert spesa da app, controlli RLS secondo `docs/saas-rls-test-plan.md`.

## Modello dati

| Oggetto | Scopo |
|--------|--------|
| `public.tenants` | Workspace; `is_personal = true` per il tenant creato alla registrazione. |
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
- Nessun repository dedicato in questa fase (previsto in fase 2 dall’audit).

## Prossimi passi suggeriti

- Switch tenant e inviti (membership da UI).
- Repository centralizzato e tipi row con `tenant_id` esplicito.
- Test su staging: due utenti, due tenant, verifica query + Realtime (checklist in `docs/saas-rls-test-plan.md`).
