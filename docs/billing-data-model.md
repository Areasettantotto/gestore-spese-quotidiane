# Modello dati billing (design futuro)

## 1. Scopo

Questo documento definisce il **modello dati e le convenzioni** per un billing SaaS futuro (provider tipo Stripe), in linea con l’architettura **tenant-first** del prodotto.

- **Non** implementa Stripe, checkout, webhook, Edge Functions o SDK lato client.
- **Non** modifica lo schema applicato oggi; serve da riferimento per migrazioni e integrazioni successive (es. FASE H onward).

Obiettivo: avere uno **schema mentale condiviso** (tabelle dedicate, snapshot su `tenants`, idempotenza, RLS, mapping provider) prima di scrivere SQL o codice server-side.

---

## 2. Principi

| Principio | Implicazione |
|-----------|----------------|
| **Billing sul tenant** | Piano, abbonamento, fatturazione e limiti commerciali sono attributi del **workspace (`tenant_id`)**, non del singolo utente. |
| **Nessun piano individuale** | Gli utenti possono avere ruoli (es. `billing`) ma **non** una riga “subscription per user” come fonte di verità del piano. |
| **Customer/subscription provider → tenant** | Gli identificativi del provider (customer, subscription) si collegano al tenant tramite tabelle dedicate; il tenant è l’ancora di dominio. |
| **Nessun secret nel frontend** | Chiavi segrete, signing secret webhook, `service_role` restano solo in ambiente server (Edge Functions / backend), mai in bundle Vite o `VITE_*`. |
| **Webhook idempotenti (futuro)** | Ogni evento provider deve poter essere riprocessato senza effetti duplicati (chiave naturale + stato elaborazione). |
| **DB = fonte operativa anche offline-provider** | Il database deve riflettere lo **stato billing corrente** usabile da RLS, feature flag e UI anche se il provider è temporaneamente irraggiungibile; il provider resta la verità contabile ma non l’unica lettura runtime. |
| **Snapshot leggero su `public.tenants`** | `plan_code` e `subscription_status` (e campi trial collegati) su `tenants` sono un **read model** denormalizzato per query semplici, policy e UX; non sostituiscono le tabelle billing dettagliate. |

---

## 3. Stato attuale

Riassunto allineato alle migrazioni esistenti (es. `002`, `005`):

- **`public.tenants`** espone già:
  - `plan_code` (`free`, `trial`, `paid`, `internal`, `demo`, …)
  - `subscription_status` (`active`, `trialing`, `past_due`, `canceled`, `suspended`, …)
  - `is_demo` (flag operativo / sandbox)
  - `trial_ends_at` (opzionale)
- **`public.tenant_memberships.role`** include il valore **`billing`** (chi può gestire billing in UX futura, distinto da `admin` dove serve).
- **Non** esistono tabelle dedicate billing/subscription/customer provider.
- **Non** sono persistiti ID Stripe (customer/subscription) nel DB.
- **Non** ci sono webhook né handler idempotenza lato applicazione.
- **Non** ci sono Edge Functions di billing nel flusso descritto da questo repo al momento della stesura.

---

## 4. Decisione: cosa resta su `public.tenants`

### Snapshot leggero (read model)

`public.tenants` **mantiene solo** campi di sintesi adatti a UI, RLS e gating grossolano:

- `plan_code`
- `subscription_status`
- `is_demo`
- `trial_ends_at`

Questi valori sono **derivati o sincronizzati** da processi server-side (futuri webhook / job), salvo dove esplicitamente manuale (vedi sezione 6).

### `billing_customer_id` (o equivalente Stripe) direttamente su `tenants`?

| Opzione | Pro |
|---------|-----|
| **Aggiungere** `billing_customer_id` su `tenants` | Una SELECT sui tenant per checkout/portal senza join. |
| **Evitare** campi provider-specific su `tenants` | Schema `tenants` resta stabile se cambia provider o naming; multi-provider; meno colonne “sparse”; dettaglio resta nelle tabelle billing. |

**Scelta consigliata (questo design):**

- **Non** aggiungere colonne Stripe-specific (es. `stripe_customer_id`) su `tenants`.
- Usare **`public.tenant_billing_customers`** (o equivalente) come mappatura **tenant ↔ customer per provider**.
- Mantenere **`tenants`** come **read model leggero** per piano/stato trial/subscription a livello UX e per future policy/flag, senza accoppiamento stretto al vendor.

---

## 5. Proposta tabelle billing future

Le seguenti definizioni sono **progettuali** (naming e vincoli da confermare in FASE H). Nessuna applicazione in questo documento.

### A. `public.tenant_billing_customers`

Mappa **un tenant** a **un customer** presso un provider (oggi progettato per Stripe, domani estensibile).

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `tenant_id` | `uuid` NOT NULL | `references public.tenants(id) on delete cascade` |
| `provider` | `text` NOT NULL | Es. `'stripe'`; vedi constraint sotto |
| `provider_customer_id` | `text` NOT NULL | ID customer lato provider |
| `created_at` | `timestamptz` NOT NULL | `default now()` |
| `updated_at` | `timestamptz` NOT NULL | `default now()` |

**Vincoli suggeriti:**

- `unique (provider, provider_customer_id)` — nessun riuso dello stesso customer ID tra tenant diversi.
- `unique (tenant_id, provider)` — al più un customer per provider per tenant (modello comune B2B).

**Check su `provider`:**

- Opzione rigida: `check (provider in ('stripe'))` finché non serve altro.
- Opzione flessibile: elenco in tabella di lookup o check esteso quando si introduce un secondo provider, con decisione esplicita in migrazione.

### B. `public.tenant_subscriptions`

Fonte di verità **lato applicazione** per l’abbonamento corrente (per tenant + provider), arricchita dai webhook.

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL | FK `tenants`, `on delete cascade` |
| `provider` | `text` NOT NULL | Es. `'stripe'` |
| `provider_subscription_id` | `text` NOT NULL | ID subscription provider |
| `provider_customer_id` | `text` NULL | denormalizzazione opzionale per diagnostica/join rapidi |
| `plan_code` | `text` NOT NULL | Tier prodotto (allineato al vocabolario `tenants.plan_code` dove possibile) |
| `status` | `text` NOT NULL | Stato ciclo di vita subscription (vedi sotto) |
| `current_period_start` | `timestamptz` NULL | |
| `current_period_end` | `timestamptz` NULL | |
| `cancel_at_period_end` | `boolean` NOT NULL | `default false` |
| `trial_ends_at` | `timestamptz` NULL | |
| `metadata` | `jsonb` NOT NULL | `default '{}'`; chiavi operative non sensibili |
| `created_at` / `updated_at` | `timestamptz` NOT NULL | |

**Vincoli suggeriti:**

- `unique (provider, provider_subscription_id)`.
- Indice su `tenant_id` (liste e join da membership).

**Check su `status`:**

- Includere valori sufficienti a mappare Stripe (`active`, `trialing`, `past_due`, `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, …) **senza** vincolare ogni stringa Stripe minor: preferire un insieme **chiuso ma revisionabile** in migrazione, più un valore `unknown` o normalizzazione in job se Stripe aggiunge stati.

**`plan_code` qui vs `tenants.plan_code`:**

- **`tenant_subscriptions.plan_code`**: valore sul record subscription (può cambiare con upgrade/downgrade prima che lo snapshot su `tenants` sia aggiornato).
- **`tenants.plan_code`**: **denormalizzazione** per letture veloci e RLS/UI.
- **Non** è obbligatorio che coincidano istante per istante durante una transazione; la regola è: dopo elaborazione webhook/job, **allineare** lo snapshot (sezione 6). Se in futuro esistono più subscription attive (raro in B2B), il design va esteso (es. “subscription primaria”); per default si assume **una subscription primaria per tenant per provider**.

### C. `public.billing_events`

Tabella per **idempotenza**, **audit minimo** e **debug** degli eventi provider (tipicamente webhook).

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | `uuid` PK | |
| `provider` | `text` NOT NULL | |
| `provider_event_id` | `text` NOT NULL | Es. `evt_…` Stripe |
| `event_type` | `text` NOT NULL | Es. `customer.subscription.updated` |
| `tenant_id` | `uuid` NULL | FK `tenants`, `on delete set null` — utile per query per tenant; può restare null se risoluzione ritardata |
| `processed_at` | `timestamptz` NULL | valorizzato quando l’handler ha completato con successo |
| `payload` | `jsonb` NOT NULL | body grezzo o normalizzato (vedi rischi privacy/retention) |
| `processing_error` | `text` NULL | ultimo errore non fatale o messaggio sintetico |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

**Vincolo:**

- `unique (provider, provider_event_id)` — garantisce **una sola elaborazione logica** per evento; retry del provider non duplicano effetti.

**Motivazione:**

- **Idempotenza**: stesso `provider_event_id` → stesso outcome transazionale.
- **Debug**: correlazione tra payload e stato subscription/customer.
- **Audit minimo**: chi/cosa/quando a livello evento (non sostituisce un audit log applicativo completo se introdotto altrove).

---

## 6. Sincronizzazione con `public.tenants`

### Flusso futuro (alto livello)

1. Il **webhook** (o worker) riceve l’evento, lo **inserisce** in `billing_events` (o verifica unicità), poi aggiorna **`tenant_billing_customers`** / **`tenant_subscriptions`** in una transazione coerente.
2. Nello stesso percorso (o subito dopo), aggiorna lo **snapshot** su **`public.tenants`**:
   - `plan_code`
   - `subscription_status`
   - `trial_ends_at` (se derivato dalla subscription / trial Stripe)
3. **`is_demo`** resta **manuale/operativo**: impostato da processi interni (onboarding demo, script operativi). **Non** deve essere sovrascritto automaticamente dagli eventi billing del provider.

### Regole di sicurezza comportamentale

- **Tenant demo / internal**: gli handler devono **saltare** o **non propagare** aggiornamenti provider che confliggono con flag operativi (`is_demo`, `plan_code = 'demo'|'internal'`), salvo policy esplicita “promuovi da demo a paid”. Obiettivo: evitare **sovrascritture accidentali** da eventi di test o customer collegati per errore.
- **Tenant paid / trial**: stato derivato principalmente da **`tenant_subscriptions`** + regole di mapping (sezione 9).
- **Stati critici** (`past_due`, `canceled`, `suspended`): mappare da stati Stripe con una **tabella di mapping** versionata (codice o config), evitando che piccole variazioni nomenclatura provider rompano i check; documentare eccezioni (es. `unpaid` vs `past_due`).

---

## 7. RLS futura (solo proposta)

Da implementare in migrazioni dedicate, non in questo documento:

| Risorsa | Lettura | Scrittura |
|---------|---------|-----------|
| **Snapshot su `tenants`** | Membri del tenant (policy esistente o estesa) per campi non sensibili | Solo server-side o ruoli DB dedicati per sync billing |
| **`tenant_subscriptions`** | Preferibilmente **solo** ruoli `admin` e/o **`billing`** (helper tipo `has_tenant_role(tenant, 'billing')`) | **Nessun** insert/update/delete da client anon/authenticated “normale” |
| **Subset meno sensibile** | Opzionale: esporre ai membri solo colonne aggregate (vista) se serve UX “sei in trial fino al …” senza esporre ID provider | — |
| **Tabelle billing / `billing_events`** | ristretta (admin/billing) o solo server | **Solo** Edge Function / backend con **service role** o ruolo DB limitato — **mai** `service_role` nel frontend |
| **Principio** | Client = **anon key + RLS**; operazioni privilegiate = **server** con segreti in env Supabase | |

---

## 8. Edge Functions future (solo design)

Nessun codice qui: solo contratto concettuale.

### `create-checkout-session`

| Aspetto | Contenuto |
|---------|------------|
| **Input atteso** | `tenant_id`, `price_id` o `plan_code` risolvibile a price, URL di successo/annullamento, eventuale `initiated_by_user_id` |
| **Autorizzazioni** | Utente autenticato membro del tenant con ruolo **`billing`** o **`admin`**; verifica JWT lato function |
| **Segreti** | Stripe **secret key**, webhook secret non necessario qui |
| **Output** | URL o `session_id` checkout Stripe per redirect client |
| **Effetti DB** | Opzionale: log audit; nessun vincolo di persistenza subscription finché il webhook non conferma |

### `stripe-webhook`

| Aspetto | Contenuto |
|---------|------------|
| **Input atteso** | Raw body + header firma Stripe |
| **Autorizzazioni** | Verifica firma con **signing secret**; nessun JWT utente richiesto |
| **Segreti** | Signing secret webhook, Stripe secret per fetch oggetti se necessario |
| **Output** | `200` con ack dopo elaborazione idempotente |
| **Effetti DB** | Insert `billing_events`, upsert `tenant_billing_customers` / `tenant_subscriptions`, aggiornamento snapshot `tenants` |

### `create-billing-portal-session`

| Aspetto | Contenuto |
|---------|------------|
| **Input atteso** | `tenant_id`, URL di ritorno |
| **Autorizzazioni** | Come checkout: **admin** / **billing** + membership |
| **Segreti** | Stripe secret key |
| **Output** | URL portal Stripe |
| **Effetti DB** | Opzionale: audit; nessun cambio stato finché webhook non notifica modifiche |

---

## 9. Stripe mapping futuro

| Concetto Stripe | Destinazione dati |
|-----------------|-------------------|
| **Customer** | Riga in `tenant_billing_customers` (`provider_customer_id`); ancoraggio `tenant_id` |
| **Subscription** | Riga in `tenant_subscriptions` (`provider_subscription_id`, status, periodi, trial) |
| **Price / Product** | Risolti in **`plan_code`** (e opzionalmente metadata) — tabella di mapping prodotto interno ↔ `price_id` / `product_id` Stripe fuori da questo doc SQL |
| **Event** (webhook) | `billing_events.provider_event_id` + `event_type` + `payload` |

**Metadata Stripe consigliati** (per correlazione e supporto):

- `tenant_id` — UUID tenant piattaforma
- `initiated_by_user_id` — utente che ha avviato checkout/portal
- `environment` — es. `staging` / `production` per evitare incroci accidentali tra progetti Stripe

---

## 10. Piano incrementale successivo

| Fase | Contenuto |
|------|-----------|
| **FASE H** | **Billing schema**: bozza migrazione SQL, review, apply — tabelle sezione 5, vincoli, indici, commenti |
| **FASE I** | **Stripe test mode** + Edge Functions (checkout/portal) dietro auth, senza produzione |
| **FASE J** | **Webhook** + idempotenza (`billing_events`) + sync verso `tenant_subscriptions` e snapshot `tenants` |
| **FASE K** | **UI billing minima** (stato piano, link a portal, gestione ruolo billing) |
| **FASE L** | **Enforcement piani** (limiti feature, quota, messaggistica upgrade) basato su snapshot + dettaglio subscription |

---

## 11. Rischi e decisioni aperte

1. **Mapping stati Stripe**: stati aggiuntivi o rinominati; subscription in stati transitori (`incomplete`, `paused`); necessità di tabella di mapping e test integrazione.
2. **Trial**: trial lato Stripe vs `trial_ends_at` su tenant; allineamento quando il trial è solo “marketing” interno senza Stripe.
3. **Cancellazioni e grace period**: cosa mostrare in UI e quando passare a `free` / `suspended`; overlap con `cancel_at_period_end`.
4. **Fatture e fiscalità**: tabelle `invoices` / export contabile non coperte qui; possibile estensione schema.
5. **Multi-provider**: vincolo `provider` + unique composite; evitare duplicati logici (due provider attivi per stesso tenant senza policy chiara).
6. **Tenant demo/internal**: regole esplicite di blocco sync (sezione 6) da codificare negli handler.
7. **Privacy payload webhook**: `billing_events.payload` può contenere PII; minimizzazione, mascheramento, o storage di riferimento + fetch on-demand; **retention** (TTL, archival, purge) da definire per compliance e costo storage.
8. **Retention `billing_events.payload`**: periodo di conservazione, anonimizzazione post-process, export verso data warehouse vs delete.

---

*Documento di design (FASE G2). Nessuna implementazione provider o modifiche runtime associate a questo file.*
