## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy environment template and set Supabase values (see `.env.example`):
   `cp .env.example .env.local` then edit `.env.local` (never commit real secrets).
3. Run the app:
   `npm run dev`

## Local development with Supabase

1. Start local Supabase:
   `npx supabase start`
2. Optional: reset local database:
   `npx supabase db reset`
3. Copy env template:
   `cp .env.example .env.local`
4. Edit `.env.local` and replace `VITE_SUPABASE_ANON_KEY` with the local publishable/anon key shown by `npx supabase start`.
5. Start the app:
   `npm run dev`
6. Open app:
   `http://localhost:5173`
7. Local Supabase Studio:
   `http://127.0.0.1:54323`
8. Stop local Supabase:
   `npx supabase stop --no-backup`

### Development / deploy documentation

- **Production readiness** (pre/post deploy, rollback, smoke test, env vars): [`docs/production-readiness.md`](docs/production-readiness.md)
- **Demo tenant** (operational runbook, no auto-reset): [`docs/demo-tenant.md`](docs/demo-tenant.md)
- **SaaS refactor plan** (migrations, tenancy phases): [`docs/saas-refactor-plan.md`](docs/saas-refactor-plan.md)


## Deploy to Render (Static Site)

1. Push your repo to GitHub and create a Static Site on Render (New → Static Site).

2. Build settings:
   - Build Command: `npm run build`
   - Publish Directory: `dist`

3. Add Environment Variables in the Render service settings (Environment → Environment Variables):
   - `VITE_SUPABASE_URL` = your Supabase project URL (e.g. `https://xxxxx.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon public key (starts with `sb_publishable_...`)

   Important: Do NOT use the `service_role` key in the client; use only the anon public key.

4. Deploy: trigger a manual deploy or push to the connected branch. The build will embed `VITE_` variables at build time.

5. (Optional) Add a custom domain in Render → Settings → Custom Domains and follow the DNS instructions.

Troubleshooting
- If you see `Invalid API key` locally, verify the anon key and restart the dev server.
- If Supabase operations fail after deploy, check Row Level Security policies and that `user_id`/`owner_id` columns exist.
