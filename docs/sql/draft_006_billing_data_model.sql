-- =============================================================================
-- DRAFT — NON APPLICARE SENZA REVIEW (FASE G3)
-- =============================================================================
-- Stato: bozza SQL di design; NON è una migrazione versionata e NON va eseguito
--   in produzione senza revisione esplicita del team.
-- NON richiesto per il runtime attuale dell’applicazione: nessuna dipendenza
--   client o schema applicato oggi da questo file.
-- NON integra Stripe in modo concreto (niente API, niente segreti, niente SDK).
-- NON crea checkout, webhook, Edge Functions né altro percorso server-side
--   operativo; descrive solo tabelle/vincoli/RLS proposti per fasi successive.
--
-- Allineamento: docs/billing-data-model.md
--
-- Vincoli di scope (questo draft):
--   - NON modifica public.expenses né RLS su expenses.
--   - NON rimuove public.expenses_orphan_archive_002.
--   - NON tocca private.backup_*.
--   - NON introduce secret o chiavi provider.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) public.tenant_billing_customers
-- Mappa tenant ↔ customer presso un provider (oggi solo 'stripe' nel check).
-- Estendere l’elenco in `provider` richiede migrazione esplicita se si aggiunge
-- un secondo provider (alternativa documentata: lookup table invece del check).
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_billing_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_customers_provider_customer_unique
    unique (provider, provider_customer_id),
  constraint tenant_billing_customers_tenant_provider_unique
    unique (tenant_id, provider),
  constraint tenant_billing_customers_provider_check
    check (provider in ('stripe'))
);

create index if not exists idx_tenant_billing_customers_tenant_id
  on public.tenant_billing_customers (tenant_id);

comment on table public.tenant_billing_customers is
  'DRAFT: mapping provider customer → tenant. One row per (tenant, provider). '
  'Writes must be server-side only (Edge Function / webhook with privileged DB role), never from the anon/authenticated client.';

comment on column public.tenant_billing_customers.tenant_id is
  'Tenant (workspace) that owns the billing relationship; anchor for RLS and domain invariants.';

comment on column public.tenant_billing_customers.provider is
  'Billing provider id (draft restricts to stripe; extend via migration when multi-provider is required).';

comment on column public.tenant_billing_customers.provider_customer_id is
  'Opaque customer id from the provider; unique per provider across all tenants for idempotent linkage.';

comment on column public.tenant_billing_customers.created_at is 'Row creation time.';
comment on column public.tenant_billing_customers.updated_at is
  'Last update time; application or future trigger may refresh (see TODO at end of file — no project-wide updated_at trigger exists yet).';

-- -----------------------------------------------------------------------------
-- 2) public.tenant_subscriptions
-- Fonte di verità applicativa per subscription; snapshot su public.tenants
-- (plan_code, subscription_status, trial_ends_at) va aggiornato da processi
-- server-side dopo webhook/job — vedi docs/billing-data-model.md sezione 6.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null,
  provider_customer_id text null,
  plan_code text not null,
  status text not null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscriptions_provider_subscription_unique
    unique (provider, provider_subscription_id),
  constraint tenant_subscriptions_provider_check
    check (provider in ('stripe')),
  constraint tenant_subscriptions_plan_code_check
    check (plan_code in ('free', 'trial', 'paid', 'internal', 'demo')),
  constraint tenant_subscriptions_status_check
    check (
      status in (
        'active',
        'trialing',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
        'incomplete_expired',
        'paused',
        'suspended',
        'unknown'
      )
    )
);

create index if not exists idx_tenant_subscriptions_tenant_id
  on public.tenant_subscriptions (tenant_id);

create index if not exists idx_tenant_subscriptions_provider_customer_id
  on public.tenant_subscriptions (provider_customer_id)
  where provider_customer_id is not null;

comment on table public.tenant_subscriptions is
  'DRAFT: per-tenant subscription state from provider. Denormalized snapshot on public.tenants is the read model for simple queries/UX; this table holds detail and may lag or lead briefly during async sync. No direct client writes.';

comment on column public.tenant_subscriptions.tenant_id is
  'Owning workspace; subscription is a tenant-scoped resource, not per-user.';

comment on column public.tenant_subscriptions.provider is 'Billing provider (draft: stripe only).';
comment on column public.tenant_subscriptions.provider_subscription_id is
  'Provider subscription id; unique with provider for idempotent upserts.';

comment on column public.tenant_subscriptions.provider_customer_id is
  'Optional denormalized provider customer id for diagnostics or joins to tenant_billing_customers.';

comment on column public.tenant_subscriptions.plan_code is
  'Product tier vocabulary aligned with public.tenants.plan_code (free, trial, paid, internal, demo).';

comment on column public.tenant_subscriptions.status is
  'Lifecycle state (Stripe-like set plus suspended/unknown for mapping/versioning); revise via migration if provider adds states.';

comment on column public.tenant_subscriptions.metadata is
  'Non-sensitive operational keys only; no secrets. Minimize PII.';

comment on column public.tenant_subscriptions.cancel_at_period_end is
  'True if subscription remains active until current period end then cancels.';

comment on column public.tenant_subscriptions.trial_ends_at is
  'Trial end from provider or mapped rules; keep in sync with tenants.trial_ends_at when snapshot is updated server-side.';

-- -----------------------------------------------------------------------------
-- 3) public.billing_events
-- Idempotenza webhook: unique (provider, provider_event_id); payload per debug
-- (attenzione PII/retention — vedi docs/billing-data-model.md sezione 11).
-- -----------------------------------------------------------------------------
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  tenant_id uuid null references public.tenants (id) on delete set null,
  processed_at timestamptz null,
  payload jsonb not null,
  processing_error text null,
  created_at timestamptz not null default now(),
  constraint billing_events_provider_event_unique
    unique (provider, provider_event_id)
);

create index if not exists idx_billing_events_tenant_id
  on public.billing_events (tenant_id);

create index if not exists idx_billing_events_event_type
  on public.billing_events (event_type);

create index if not exists idx_billing_events_processed_at
  on public.billing_events (processed_at);

comment on table public.billing_events is
  'DRAFT: inbound provider events for idempotency (unique provider_event_id), audit-lite, and debugging. Rows with tenant_id null are not exposed to authenticated clients under the draft SELECT policy; resolution stays server-side. Inserts/updates only via privileged server path.';

comment on column public.billing_events.provider is 'Billing provider that emitted the event.';
comment on column public.billing_events.provider_event_id is
  'Natural id for idempotency (e.g. Stripe evt_…); duplicate deliveries must not double-apply side effects.';

comment on column public.billing_events.event_type is 'Provider event type string (e.g. customer.subscription.updated).';
comment on column public.billing_events.tenant_id is
  'Resolved tenant when known; set null until correlated; ON DELETE SET NULL preserves the event row if tenant is removed.';

comment on column public.billing_events.processed_at is
  'Set when handler completed successfully; null while pending or failed.';

comment on column public.billing_events.payload is
  'Raw or normalized JSON body; may contain PII — retention/minimization policy TBD.';

comment on column public.billing_events.processing_error is
  'Last non-fatal error or short diagnostic; not a full stack trace store.';

-- -----------------------------------------------------------------------------
-- 4) Row Level Security (conservative draft)
-- - RLS ON for all three tables.
-- - SELECT for authenticated members with role admin OR billing on the row tenant.
-- - NO INSERT / UPDATE / DELETE policies for the normal authenticated client:
--   all writes must use a privileged server role (e.g. service role in Edge
--   Function / webhook handler), never the browser anon key.
-- - service_role bypasses RLS in Supabase; still keep secrets only in server env.
-- -----------------------------------------------------------------------------
alter table public.tenant_billing_customers enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.billing_events enable row level security;

-- Policy: SELECT only for tenant admin or billing role; no client write policies by design.
drop policy if exists tenant_billing_customers_select_admin_billing
  on public.tenant_billing_customers;
create policy tenant_billing_customers_select_admin_billing
  on public.tenant_billing_customers
  for select
  using (
    public.has_tenant_role(
      tenant_billing_customers.tenant_id,
      array['admin', 'billing']::text[]
    )
  );

-- Policy: read subscription rows only for admin/billing; snapshot on tenants remains the usual UX read path.
drop policy if exists tenant_subscriptions_select_admin_billing
  on public.tenant_subscriptions;
create policy tenant_subscriptions_select_admin_billing
  on public.tenant_subscriptions
  for select
  using (
    public.has_tenant_role(
      tenant_subscriptions.tenant_id,
      array['admin', 'billing']::text[]
    )
  );

-- Rows with tenant_id IS NULL are not visible to authenticated users under this
-- policy; server-side jobs use a role that bypasses RLS. When tenant_id is set,
-- only admin/billing on that tenant may SELECT.
drop policy if exists billing_events_select_admin_billing
  on public.billing_events;
create policy billing_events_select_admin_billing
  on public.billing_events
  for select
  using (
    billing_events.tenant_id is not null
    and public.has_tenant_role(
      billing_events.tenant_id,
      array['admin', 'billing']::text[]
    )
  );

-- TODO (se in review si preferisce zero policy finché non c’è UX): sostituire
-- le tre policy SELECT sopra con un blocco commentato e documentare che finché
-- non applicato, nessun client legge queste tabelle; oppure aggiungere policy
-- più restrittive (es. solo service role) se si espone tutto via viste sicure.

-- -----------------------------------------------------------------------------
-- 5) updated_at automatic refresh
-- Il progetto non definisce ancora un trigger/function condivisa tipo
-- `set_updated_at()` sulle tabelle esistenti (solo default now() sulle colonne).
-- Evitare refactor ampio: se in futuro si introduce un pattern comune, agganciare
-- qui con:
--   -- create trigger ... before update on public.tenant_billing_customers ...
--   -- create trigger ... before update on public.tenant_subscriptions ...
-- Fino ad allora, aggiornare updated_at esplicitamente nei job server-side.
-- -----------------------------------------------------------------------------
