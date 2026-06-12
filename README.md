# Todoay

Todoay is a lightweight daily-use app for tasks, threads, and notes built with Next.js.

## Local-first sync

Todoay now keeps writing to local storage first, then syncs the same state snapshot to Supabase when the user is signed in and online.

### Environment

Copy [.env.example](/C:/Users/iamro/Code/todoay/.env.example) to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Supabase setup

1. In Supabase, enable Google under `Authentication > Providers`.
2. Add your app URL and callback URL to the allowed redirect URLs list. For local development that is usually `http://localhost:2020/settings/`.
3. Run the SQL in [supabase/todoay_schema.sql](/C:/Users/iamro/Code/todoay/supabase/todoay_schema.sql) inside the Supabase SQL editor.

That SQL also adds the snapshot table to Supabase Realtime so signed-in clients can receive cross-device updates within a few moments instead of waiting for a manual refresh.

The app stores one JSON snapshot per user and merges local and remote changes using per-record timestamps, mutation ids, and deletion tombstones so cross-device sync can converge without dropping local edits.

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run test:ci
```

The end-to-end suite runs the app on an isolated Playwright dev server with Supabase public env vars blanked, so CI exercises the local-first app without touching external services.

## Static export

```bash
npm run build
```

The app uses localStorage only, so it can be hosted as a static site.

## Production app + MCP hosting

Production uses only GitHub and Supabase:

- GitHub Pages hosts the static Next.js app.
- Supabase Edge Functions host the remote MCP server at
  `https://<project-ref>.supabase.co/functions/v1/todoay-mcp`.
- Supabase Auth issues the OAuth tokens that ChatGPT sends to the MCP server.

Deploy the MCP function after linking the repo to your Supabase project:

```bash
supabase link --project-ref <project-ref>
supabase secrets set TODOAY_MCP_PUBLIC_URL=https://<project-ref>.supabase.co/functions/v1/todoay-mcp
supabase secrets set TODOAY_MCP_SCOPES="openid email profile"
npm run mcp:edge:deploy
```

Supabase provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Edge Functions by
default. The MCP code also accepts `TODOAY_SUPABASE_URL` and
`TODOAY_SUPABASE_ANON_KEY` if you ever need to override them.

Use this as the ChatGPT remote MCP URL:

```text
https://<project-ref>.supabase.co/functions/v1/todoay-mcp
```

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.

1. Push the repository to GitHub.
2. In GitHub, open `Settings > Pages`.
3. Set `Source` to `GitHub Actions`.
4. Add these repository secrets in `Settings > Secrets and variables > Actions`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_PROJECT_REF`.
5. Push to `main` or run the workflow manually from the `Actions` tab.

The workflow builds a static export and deploys the `out` directory to project
Pages using the repository path as the production base path.

The same workflow also deploys the `todoay-mcp` Supabase Edge Function. It sets
the function secrets for `TODOAY_MCP_PUBLIC_URL` and `TODOAY_MCP_SCOPES` on each
production deploy, so normal MCP code changes only need a push to `main`.

## ChatGPT production setup

1. In Supabase, enable the OAuth 2.1 server.
2. Set the OAuth authorization path to `/oauth/consent`.
3. Create a Supabase OAuth app for ChatGPT and add ChatGPT's callback URL.
4. In ChatGPT Developer Mode, add a custom MCP app with OAuth authentication.
5. Use `https://<project-ref>.supabase.co/functions/v1/todoay-mcp` as the server
   URL.
6. Use the Supabase OAuth app's client id and secret in ChatGPT.
7. Set the default scopes to `openid email profile`.

For day-to-day use in ChatGPT, name and describe the connector broadly, for
example: "Todoay - tasks, notes, daily planning, backlog, and project threads."
That gives ChatGPT a strong hint to use Todoay when the conversation is about
tasks even when you do not say "Todoay" explicitly.

## PWA installability

The app includes a web app manifest, install icons, and a service worker so it can be installed from Chrome on Android after deployment.

Each GitHub Pages deploy also stamps the app with the current commit SHA so installed clients can detect a new service worker and reload onto the latest code.
