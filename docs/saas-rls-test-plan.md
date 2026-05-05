# Piano test RLS e tenancy — Fase 1

Checklist manuale per **staging** dopo `supabase/migrations/002_saas_tenant_rls.sql`.  
Prerequisito: due utenti Auth (`user_a`, `user_b`), idealmente due tenant distinti (o stesso tenant con membri diversi secondo lo scenario).

Sostituire gli UUID segnaposto (`<tenant_a>`, `<user_a>`, …) con valori reali (da `select * from public.tenant_memberships` / `auth.users`).

---

## 1. Isolamento tenant (utente A non vede dati tenant B)

Con sessione JWT di **user_a** (SQL Editor: `select auth.uid()` non basta; usare client anon + login o `set request.jwt.claim.sub` in test avanzati — in pratica si usa l’app con due browser / incognito).

| Metodo | Passo |
|--------|--------|
| App / client | Accedere come A, tenant attivo = workspace A: lista spese non deve mostrare righe con `tenant_id` di B. |
| SQL (come membro A) | `select id, tenant_id from public.expenses` → ogni `tenant_id` deve essere un tenant di cui A è membro. |

Verifica negativa consigliata (solo se si può impersonare A via client):

- Inserire da B una spesa in `<tenant_b>`.
- Come A, query o UI sul tenant A: **nessuna** riga del tenant B.

---

## 2. Membro tenant vede solo il proprio tenant (lista scoped)

- Policy `expenses_select_tenant`: `is_tenant_member(tenant_id)`.
- Il client filtra anche con `.eq('tenant_id', activeTenantId)` per evitare “mescolanza” multi-workspace in UI.

Test:

1. A membro solo di `tenant_a`: `select count(*) from public.expenses` da app con tenant attivo `tenant_a` → solo righe `tenant_id = tenant_a`.
2. Se in futuro A switcha tenant, ripetere con secondo tenant.

---

## 3. Ruolo `billing`: solo lettura spese

Preparazione: membership `(tenant_id, user_billing, role) = billing` per un utente dedicato.

| Azione | Esito atteso |
|--------|----------------|
| `select` su `public.expenses` per righe del tenant | Consentito |
| `insert` / `update` / `delete` su `expenses` del tenant | **Rifiutato** da RLS (policy scrittura richiede `has_tenant_role(..., admin|user)` e `user_id = auth.uid()`) |

Esempio concettuale da client come utente billing: tentativo insert → errore policy / zero righe.

---

## 4. Ruolo `user`: crea / modifica solo le proprie righe

Utente con ruolo `user` nel tenant:

| Azione | Esito atteso |
|--------|----------------|
| `select` spese del tenant (anche create da altri) | Consentito |
| `insert` con `user_id = auth.uid()` e `tenant_id` del tenant | Consentito |
| `update` / `delete` su riga con `user_id` diverso da `auth.uid()` | **Rifiutato** |

---

## 5. Ruolo `admin` (e `user`): permessi scrittura sulle proprie righe

Utente `admin` nel tenant personale:

| Azione | Esito atteso |
|--------|----------------|
| CRUD su proprie spese (`user_id = self`) nel tenant | Consentito |
| `update`/`delete` su spesa di altro membro (stesso `tenant_id`, altro `user_id`) | **Rifiutato** per policy `user_id = auth.uid()` (fase 1: niente modifica altrui) |

---

## 6. Utente non membro del tenant

Utente C **senza** riga in `tenant_memberships` per `<tenant_x>`:

| Azione | Esito atteso |
|--------|----------------|
| `select` / `insert` / `update` / `delete` su `expenses` con `tenant_id = <tenant_x>` | Nessuna riga visibile / mutazioni rifiutate |
| `select` su `public.tenants` dove id = `<tenant_x>` | Nessuna riga |
| `select` su `tenant_memberships` per quel tenant | Nessuna riga (salvo policy co-tenant se membro altrove — non applicabile se C non è membro di nessun tenant condiviso) |

---

## 7. Realtime filtrato per `tenant_id`

1. Abilitazione Realtime su tabella `public.expenses` in Supabase (Replication) se non già fatto.
2. Due client loggati come due utenti **nello stesso tenant** (o stesso utente due tab): modifiche su spese `tenant_id = T` devono arrivare al channel con filtro `tenant_id=eq.T`.
3. Utente con accesso solo a `tenant_a`: non deve ricevere eventi postgres_changes per insert su `tenant_b` se il filtro client è `tenant_id=eq.<tenant_a>` (e RLS limita comunque il payload).

Controllo implementazione: hook `useExpensesRealtime` usa solo `filter: tenant_id=eq.<activeTenantId>` e non sottoscrive senza `scopeTenantId`.

---

## 8. Profili e trigger `auth.users`

- Nuovo signup: dopo insert in `auth.users`, verificare riga in `public.profiles`, tenant personale, membership `admin`.
- Query preflight trigger (già in `saas-refactor-plan.md`): un solo trigger `on_auth_user_created` atteso dopo migration.

---

## 9. Tabella archivio orfani

Dopo migration, se presente:

```sql
select count(*) from public.expenses_orphan_archive_002;
```

Se `count > 0`, analizzare `source_row` e decidere ripristino manuale o attribuzione tenant prima di cancellare l’archivio.

---

## Note

- I test SQL puri con `auth.uid()` richiedono contesto JWT (estensione `pgjwt`, impersonation, o test via Supabase client). In assenza, priorità ai test end-to-end con due sessioni browser.
- Non usare `service_role` nel browser; i test client devono usare la **anon key** + sessione utente.
