# Tab Split (Feast Fund)

Split a restaurant bill item by item: scan or type the receipt, tag each dish to the people who had it, and send everyone a link with their exact share. Originally built in Lovable; now developed independently.

## Setup

You need Node.js (LTS), a free [Supabase](https://supabase.com) project, and an [Anthropic API key](https://platform.claude.com/settings/keys) for receipt scanning.

1. **Database** — in your Supabase dashboard, open the SQL editor, paste the contents of [`supabase/setup.sql`](supabase/setup.sql), and run it once.
2. **Settings** — copy `.env.example` to `.env` and fill in your Supabase URL, publishable key and project id (Project Settings → API), plus `ANTHROPIC_API_KEY`.
3. **Run**

   ```sh
   npm install
   npm run dev
   ```

   The app runs at http://localhost:8080.

### Optional: Google sign-in

Email/password works out of the box. For "Continue with Google", enable the Google provider in Supabase (Authentication → Sign In / Providers) with a Google OAuth client, and add `http://localhost:8080/auth` to Authentication → URL Configuration → Redirect URLs.

## Database changes

Migrations live in `supabase/migrations/`. Add new ones there with a later timestamp, then regenerate `supabase/setup.sql` for fresh installs.

## Built with

- TanStack Start, React, TypeScript, Tailwind CSS
- Supabase (Postgres, auth, row-level security)
- Claude API (receipt scanning)
