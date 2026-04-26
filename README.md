# Todoay

Todoay is a lightweight daily-use app for tasks, notes and misc lists built with Next.js.

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

## Static export

```bash
npm run build
```

The app uses localStorage only, so it can be hosted as a static site.

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.

1. Push the repository to GitHub.
2. In GitHub, open `Settings > Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or run the workflow manually from the `Actions` tab.

The workflow builds a static export and deploys the `out` directory to project Pages using the repository path as the production base path.

## PWA installability

The app includes a web app manifest, install icons, and a service worker so it can be installed from Chrome on Android after deployment.

Each GitHub Pages deploy also stamps the app with the current commit SHA so installed clients can detect a new service worker and reload onto the latest code.
