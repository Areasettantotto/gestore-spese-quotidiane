# Tenant demo — operational readiness

Documentazione per usare un **workspace demo** isolato (live, presentazioni, test manuali) senza billing reale, senza automazioni distruttive e senza credenziali nel repository.

Gli script SQL citati sono **template manuali** in `supabase/snippets/demo/` (non migration automatiche). Sostituire sempre i placeholder (`<DEMO_TENANT_ID>`, `<DEMO_OWNER_USER_ID>`) con UUID reali **solo** nell’SQL Editor del progetto Supabase (o client con ruolo adeguato), mai nel codice sorgente.

---

## 1. Scopo del tenant demo

- **Live demo** e **presentazioni** con dati controllati e ripetibili.
- **Test manuali** end-to-end (login, CRUD spese, Realtime) su un tenant dedicato.
- **Dati sempre fittizi**: descrizioni e importi di esempio, nessun dato personale o aziendale reale.

Il tenant demo è un **tenant normale** del modello SaaS, marcato in modo esplicito su `public.tenants` e usato solo con un **account demo dedicato** il cui `profiles.default_tenant_id` punta a quel workspace.

---

## 2. Cosa NON è il tenant demo

- **Non** è billing reale, abbonamento Stripe/Paddle o trial commerciale vincolante.
- **Non** è un ambiente infra separato (stesso progetto Supabase degli altri tenant, separazione logica via `tenant_id` + RLS).
- **Non** è reset automatico o job schedulato: il reset è **solo manuale** con gli script documentati e guardie SQL.
- **Non** è dashboard admin, tenant switcher o Edge Function: fuori scope fino a fasi successive.

---

## 3. Requisiti

| Requisito | Dettaglio |
|-----------|-----------|
| Flag demo | `public.tenants.is_demo = true` |
| Piano | `plan_code = 'demo'` (vincolo check migration 005) |
| Stato subscription | `subscription_status = 'active'` (coerenza UX; nessun provider collegato) |
| Trial | `trial_ends_at IS NULL` per il profilo demo standard |
| Utente | Account **demo dedicato** (creato via Auth / signup di test), mai credenziali nel repo |
| Dati | Solo spese fittizie nel tenant demo |
| Segreti | Nessuna email/password/service_role nel repository |

---

## 4. Identificare il tenant demo

1. Eseguire le query in **`supabase/snippets/demo/demo-tenant-verify.sql`** (sezione “Tenant demo” e conteggi).
2. **Mapping tenant → creatore**: `public.tenants.created_by` → `auth.users.id` (email in `auth.users.email` solo in ambiente controllato; non loggare in chiaro in produzione senza policy).
3. **Mapping tenant → profilo predefinito**: `public.profiles.default_tenant_id = tenants.id` per verificare quale utente apre l’app su quel workspace.
4. Confermare che l’utente che userai in demo ha **membership** su quel `tenant_id` (`tenant_memberships`) e che è effettivamente l’account dedicato (non un utente aziendale reale).

---

## 5. Marcare un tenant esistente come demo

Usare **`supabase/snippets/demo/demo-tenant-mark.sql`**.

**Avvertenze**

- Scegliere un tenant **già dedicato** al demo (tipicamente il tenant personale creato dal trigger `handle_new_user` per l’utente demo), non un workspace condiviso con dati reali.
- Dopo l’`UPDATE`, l’app continuerà a funzionare come oggi; cambiano solo i metadati di piano/flag su `tenants`.
- Annotare l’UUID del tenant in un password manager o runbook interno **fuori dal repo**.

---

## 6. Reset manuale dei dati demo

1. **Backup consigliato**: snapshot progetto Supabase o export controllato delle righe `public.expenses` per quel `tenant_id` (solo se serve ripristino).
2. Eseguire **`supabase/snippets/demo/demo-tenant-reset-expenses.sql`** sostituendo `<DEMO_TENANT_ID>`.
3. Lo script:
   - apre una transazione;
   - verifica che il tenant esista e sia **`is_demo = true`** e **`plan_code = 'demo'`**;
   - elimina **solo** da `public.expenses` dove `tenant_id` corrisponde;
   - **non** tocca `tenants`, `profiles`, `tenant_memberships`, `expenses_orphan_archive_002`, né tabelle `private.backup_*` (non referenziate nello script).

Se le guardie falliscono, **non** viene cancellato nulla: correggere i flag su `tenants` o l’UUID prima di riprovare.

---

## 7. Seed manuale di dati fittizi

1. Eseguire **`supabase/snippets/demo/demo-tenant-seed-expenses.sql`** dopo aver marcato il tenant come demo e aver verificato un **unico** membro `admin` (o impostare esplicitamente `<DEMO_OWNER_USER_ID>` come da commenti nel file).
2. Esempi di voci: caffè, supermercato, trasporto, pranzo, affitto demo — importi generici (es. 4,50 €, 35 €), categorie allineate a `src/types.ts` (`Alimentazione`, `Trasporti`, `Casa`, …).
3. Non inserire descrizioni riconducibili a persone reali, IBAN, indirizzi o importi sensibili.

Lo schema applicativo di `public.expenses` usato dal client include almeno: `id`, `amount`, `category`, `description`, `date`, `accompagnatore` (opzionale), `user_id`, `owner_id`, `tenant_id`, e opzionalmente `created_at` (default lato DB se presente). Il file seed rispetta questi campi; colonne aggiuntive ignorate dall’app possono richiedere adattamento locale.

---

## 8. Checklist pre-live

- [ ] Login con account demo OK.
- [ ] Lista spese e CRUD (create / edit / delete) OK sul tenant demo.
- [ ] Realtime: due schede browser sullo stesso account, eventi INSERT/UPDATE/DELETE visibili.
- [ ] Nessun dato reale visibile nell’UI (solo voci seed o fittizie).
- [ ] `public.tenants`: per il tenant usato in demo, `is_demo = true` e `plan_code = 'demo'`.
- [ ] Spese senza tenant: `select count(*) from public.expenses where tenant_id is null` → **0** (query in verify).
- [ ] Frontend deployato è compatibile con lo schema (migration **005** già applicata se il client legge `plan_code` / `is_demo` su `tenants`).

---

## 9. Rollback operativo (metadati tenant)

Per **non** perdere dati reali su altri tenant: operare sempre con `WHERE id = '<DEMO_TENANT_ID>'::uuid`.

Esempio per uscire dalla modalità demo (solo metadati workspace):

```sql
-- Placeholder: sostituire prima di eseguire.
update public.tenants
set
  plan_code = 'free',
  subscription_status = 'active',
  is_demo = false,
  trial_ends_at = null
where id = '<DEMO_TENANT_ID>'::uuid;
```

Le spese esistenti restano nel DB; non vengono cancellate da questo `UPDATE`. Per ripulire solo le spese demo usare lo script di reset dedicato.

---

## 10. Rischi residui

| Rischio | Mitigazione |
|--------|-------------|
| Reset manuale su UUID sbagliato | Guardie `is_demo` + `plan_code = 'demo'` nello script reset; doppio controllo UUID |
| Tenant reale marcato per errore come demo | Procedure solo su tenant dedicato; revisione query verify prima dell’`UPDATE` |
| Dati demo obsoleti | Ripetere seed o reset + seed prima dell’evento |
| Deploy frontend prima della migration 005 | Già mitigato in fase D; mantenere ordine **DB prima** quando si aggiungono colonne obbligate in `select` |
| Membri multipli admin sullo stesso tenant demo | Lo seed con auto-risoluzione proprietario fallisce se non c’è esattamente un admin; usare override `<DEMO_OWNER_USER_ID>` |

---

## Riferimenti

- Piano refactor: `docs/saas-refactor-plan.md` (FASE E).
- SQL manuali: `supabase/snippets/demo/demo-tenant-*.sql`.
- Schema tenant / RLS: `supabase/migrations/002_saas_tenant_rls.sql`, `supabase/migrations/005_tenant_plan_readiness.sql`.
- Test RLS: `docs/saas-rls-test-plan.md`.
