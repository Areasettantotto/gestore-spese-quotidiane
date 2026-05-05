# Supabase CLI baseline e migration replayable

## Perche' il repository non era replayable da zero

Il progetto e' nato con un database gia' esistente in Supabase e con migration storiche pensate per evolvere quello stato, non per ricrearlo integralmente da un database vuoto.

Nello specifico, le migration `001`-`006` non includono la creazione iniziale di `public.expenses`, ma eseguono alterazioni, policy, trigger e indici su quella tabella. Per questo motivo, un replay completo da zero con solo queste migration non puo' riuscire.

## Stato attuale delle migration (FASE M8)

- Le migration storiche `001` ... `006` sono state archiviate in `supabase/migrations_archive/`.
- `supabase/migrations/` contiene ora solo `000_baseline_current_schema.sql` (baseline squash locale/CLI), creata e validata localmente.
- Le migration `001` ... `006` non devono piu' essere replayate da zero nel flusso locale Supabase CLI.
- `npx supabase db reset` locale completato con successo sulla baseline M8.
- Warning su `supabase/seed.sql` assente osservato durante il reset: non bloccante.
- Nessun `supabase db push` eseguito.
- Nessuna modifica produzione.
- Nessuna integrazione Stripe.

Conseguenza pratica: prima della baseline M8 un reset da zero non era replayable; dopo la creazione della baseline, il reset locale e' stato eseguito con esito positivo.

## Ruolo di `supabase/migrations/` dopo baseline squash

- `supabase/migrations/`: percorso canonico usato dal workflow Supabase CLI.
- In FASE M8 contiene una baseline locale unica (`000_baseline_current_schema.sql`) derivata da introspezione read-only di produzione.
- La baseline e' un artefatto locale di replay/consistenza; non equivale a una migration da applicare a produzione.

## Problema specifico di `public.expenses`

`public.expenses` e' una dipendenza hard delle migration iniziali, ma la sua DDL originaria non e' presente nel set replayable CLI corrente. Questo e' il punto che impedisce la ricostruzione da zero del DB locale usando solo le migration versionate oggi.

## Perche' non bisogna inventare lo schema da TypeScript

I tipi TypeScript descrivono il contratto applicativo lato client, non sono una fonte affidabile per ricostruire DDL completa (vincoli, indici, trigger, default, policy RLS, ownership, grants, dipendenze tra oggetti).

Inventare la tabella da codice applicativo rischia drift e regressioni: lo schema reale potrebbe divergere in punti critici non rappresentati nei tipi.

## Perche' lo schema va estratto dal DB reale con query read-only

La baseline corretta va derivata dallo stato reale del database (produzione o sorgente autorevole) tramite introspezione read-only, cosi' da acquisire definizioni verificate e non ipotetiche.

Questo approccio consente di:

- preservare compatibilita' con dati e RLS esistenti;
- evitare assunzioni non validate;
- preparare una baseline locale ripetibile e auditabile prima di nuove migration evolutive.

## Distinzioni operative da mantenere

- **Baseline locale per replay Supabase CLI**: artefatto tecnico per rendere riproducibile l'ambiente locale da zero (`supabase/migrations/000_baseline_current_schema.sql`).
- **Migration storiche gia' applicate/legacy**: script archiviati in `supabase/migrations_archive/001..006`.
- **Migration future applicabili a produzione**: cambiamenti nuovi, espliciti, reviewati e deployati con processo controllato.

Le tre categorie non vanno confuse: la baseline locale non deve alterare retroattivamente la storia di produzione.

## Cosa NON fare in questa fase

- Non eseguire reset DB in produzione.
- Non eseguire `db push` in produzione.
- Non eseguire `supabase db reset` locale fuori da review esplicita della baseline.
- Non alterare `public.expenses` in produzione.
- Non modificare le policy RLS di `public.expenses` in produzione.
- Non inventare schema non verificato.
- Non introdurre integrazione Stripe (checkout, webhook, Edge Functions, SDK o secret).

## Nota operativa app locale dopo reset baseline

- Dopo un reset locale riuscito, l'app frontend puo' puntare a Supabase locale via `.env.local`.
- `.env.local` non va committato.
- Nel frontend usare solo chiave locale publishable/anon.
- Mai usare `service_role` nel frontend.
