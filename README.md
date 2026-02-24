## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`


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
