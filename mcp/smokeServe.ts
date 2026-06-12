import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.TODOAY_SMOKE_PORT ?? 3456);
const origin = `http://127.0.0.1:${port}`;

const server = spawn(
  process.execPath,
  [resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs"), "mcp/serve.ts"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      TODOAY_MCP_PUBLIC_URL: origin,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "example-anon-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const stopServer = async () => {
  if (server.exitCode !== null) {
    return;
  }

  server.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(2_000).then(() => server.kill("SIGKILL")),
  ]);
};

const fetchOk = async (path: string) => {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response;
};

const waitForServer = async () => {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 15_000) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited early with code ${server.exitCode}.\n${output}`);
    }

    try {
      await fetchOk("/");
      return;
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }

  throw new Error(`Timed out waiting for server. Last error: ${String(lastError)}\n${output}`);
};

const main = async () => {
  try {
    await waitForServer();
    await fetchOk("/");
    await fetchOk("/oauth/consent");

    const metadataResponse = await fetchOk("/.well-known/oauth-protected-resource/mcp");
    const metadata = await metadataResponse.json() as { resource?: string };
    if (metadata.resource !== `${origin}/mcp`) {
      throw new Error(`Unexpected MCP resource URL: ${metadata.resource}`);
    }

    console.log("Production serve smoke test passed.");
  } finally {
    await stopServer();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
