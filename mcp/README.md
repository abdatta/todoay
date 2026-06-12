# Todoay MCP

Read-only MCP server for Todoay. It reads the authenticated user's Supabase-backed
`todoay_snapshots` row and recent `todoay_snapshot_commits`.

## Environment

```bash
TODOAY_SUPABASE_URL=...
TODOAY_SUPABASE_ANON_KEY=...
TODOAY_SUPABASE_ACCESS_TOKEN=...
TODOAY_SUPABASE_REFRESH_TOKEN=...
TODOAY_MCP_PUBLIC_URL=https://<project-ref>.supabase.co/functions/v1/todoay-mcp
PORT=3333
TODOAY_MCP_PORT=3333
TODOAY_MCP_SCOPES=openid email profile
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also accepted
for the Supabase URL/key. MCP commands load `.env`, `.env.local`, and `mcp/.env`
for local development, while deployed hosts should set real environment
variables.

`TODOAY_SUPABASE_ACCESS_TOKEN` and `TODOAY_SUPABASE_REFRESH_TOKEN` are only for
local stdio debugging because the MCP process does not have access to the
browser's Supabase session. If `TODOAY_SUPABASE_REFRESH_TOKEN` is set, the MCP
server refreshes the access token before Supabase reads, so MCP Inspector does
not break every time the short-lived JWT expires. HTTP mode should receive the
user token through the `Authorization` header instead.

`TODOAY_MCP_PUBLIC_URL` should be set to the public HTTPS MCP URL for ChatGPT.
For Supabase Edge Functions, that is usually
`https://<project-ref>.supabase.co/functions/v1/todoay-mcp`. The server uses it
in OAuth protected resource metadata and `WWW-Authenticate` challenges.

## Supabase Edge production

The production MCP server runs as a Supabase Edge Function, so no separate Node
host is needed:

```bash
supabase link --project-ref <project-ref>
supabase secrets set TODOAY_MCP_PUBLIC_URL=https://<project-ref>.supabase.co/functions/v1/todoay-mcp
supabase secrets set TODOAY_MCP_SCOPES="openid email profile"
npm run mcp:edge:deploy
```

The deployed URL is:

```text
https://<project-ref>.supabase.co/functions/v1/todoay-mcp
```

Deploy uses `--no-verify-jwt` because ChatGPT must be able to discover OAuth
metadata before it has a user token. The function still validates every MCP
request with the bearer Supabase access token before reading Todoay data.

For normal production releases, GitHub Actions deploys the function on every
push to `main`. Add these repository secrets first:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

After that, local deploy commands are only needed when you intentionally want to
test an unpushed MCP change against ChatGPT.

You can type-check the Edge Function locally with Deno:

```bash
npm run mcp:edge:check
```

For local Edge Function development, use the Supabase CLI:

```bash
$env:TODOAY_MCP_PUBLIC_URL="http://localhost:54321/functions/v1/todoay-mcp"
npm run mcp:edge:serve
```

Then point MCP Inspector's HTTP transport at:

```text
http://localhost:54321/functions/v1/todoay-mcp
```

## Optional local same-domain hosting

The app and remote MCP endpoint can still run on the same local Node port for
debugging. Build the static Next app, then run the combined server:

```bash
npm run build
npm run serve
```

This serves the existing app routes from `out/` unchanged and adds:

```text
/mcp
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
```

For local HTTPS/tunnel testing with ChatGPT, set:

```bash
TODOAY_MCP_PUBLIC_URL=https://your-domain.example.com
```

Then use this remote MCP URL:

```text
https://your-domain.example.com/mcp
```

## ChatGPT OAuth setup

1. Enable Supabase OAuth 2.1 Server in the Supabase dashboard.
2. Configure the Supabase OAuth authorization path to `/oauth/consent`.
3. Host the Todoay app so `/oauth/consent` is publicly reachable.
4. Deploy the `todoay-mcp` Supabase Edge Function and set
   `TODOAY_MCP_PUBLIC_URL`.
5. In ChatGPT Developer Mode, create an app from the remote MCP server URL:
   `https://<project-ref>.supabase.co/functions/v1/todoay-mcp`.

The MCP server advertises Supabase Auth as its OAuth authorization server through
`/.well-known/oauth-protected-resource`, and ChatGPT should complete the OAuth
authorization-code + PKCE flow through Supabase.

## Run

```bash
npm run mcp:stdio
npm run mcp:http
npm run serve
npm run mcp:inspect
```

The MCP-only HTTP server listens on `http://localhost:3333/mcp` by default and
expects:

```text
Authorization: Bearer <Supabase access token>
```

The combined `npm run serve` server listens on `PORT`, `TODOAY_PORT`,
`TODOAY_MCP_PORT`, or `3333`, in that order.

## Debug

Use MCP Inspector:

```bash
npx @modelcontextprotocol/inspector -- npm run mcp:stdio
```

The inspector UI normally opens at `http://127.0.0.1:6274`.

For local stdio testing, copy `access_token` and `refresh_token` from the
`todoay-supabase-auth` browser local-storage value into `mcp/.env`:

```bash
TODOAY_SUPABASE_ACCESS_TOKEN=...
TODOAY_SUPABASE_REFRESH_TOKEN=...
```

The refresh token is sensitive and should never be committed.

## Resource shape

The primary resources are compact reading surfaces:

```text
todoay://overview
todoay://today
todoay://backlog
todoay://notes/index
todoay://threads/index
```

The direct lookup templates are:

```text
todoay://day/{date}
todoay://task/{referenceId}
todoay://note/{noteId}
todoay://thread/{threadId}
```

Template variables support MCP completion in clients such as MCP Inspector. You
can search by ids, titles, task text, or dates and the server returns matching
URI parameter values.

`todoay://task/{referenceId}` is the canonical reverse-map view for a task. It
returns every dated instance plus the linked thread and thread task when one
exists.

`todoay://debug/snapshot` exposes the full normalized snapshot for debugging.
Prefer the compact resources and tools for normal AI workflows.
