import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { handleTodoayMcpHttpRequest, sendJson } from "./httpHandler.ts";
import { loadMcpEnv } from "./loadEnv.ts";

loadMcpEnv();

const port = Number(process.env.PORT ?? process.env.TODOAY_PORT ?? process.env.TODOAY_MCP_PORT ?? 3333);
const staticDir = resolve(process.cwd(), process.env.TODOAY_STATIC_DIR ?? "out");

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const isInsideStaticDir = (path: string) =>
  path === staticDir || path.startsWith(`${staticDir}${sep}`);

const safeResolveStaticPath = (pathname: string) => {
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes("\0")) {
      return null;
    }

    const resolved = resolve(staticDir, `.${decoded}`);
    return isInsideStaticDir(resolved) ? resolved : null;
  } catch {
    return null;
  }
};

const getFileStatus = async (path: string) => {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile() ? fileStat : null;
  } catch {
    return null;
  }
};

const findStaticFile = async (pathname: string) => {
  const directPath = safeResolveStaticPath(pathname);
  if (!directPath) {
    return null;
  }

  const candidates = pathname.endsWith("/")
    ? [resolve(directPath, "index.html")]
    : [
        directPath,
        resolve(directPath, "index.html"),
      ];

  for (const candidate of candidates) {
    if (!isInsideStaticDir(candidate)) {
      continue;
    }

    const fileStat = await getFileStatus(candidate);
    if (fileStat) {
      return { path: candidate, size: fileStat.size };
    }
  }

  return null;
};

const sendStaticFile = (
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  file: { path: string; size: number },
  status = 200,
) => {
  const extension = extname(file.path).toLowerCase();
  response.writeHead(status, {
    "content-length": file.size,
    "content-type": mimeTypes[extension] ?? "application/octet-stream",
    "cache-control": extension === ".html"
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(file.path).pipe(response);
};

const handleStaticAppRequest = async (
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (!existsSync(staticDir)) {
    sendJson(response, 500, {
      error: `Static export directory not found: ${staticDir}. Run npm run build first.`,
    });
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const file = await findStaticFile(url.pathname);
  if (file) {
    sendStaticFile(request, response, file);
    return;
  }

  const notFound = await findStaticFile("/404.html");
  if (notFound) {
    sendStaticFile(request, response, notFound, 404);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
};

const server = createServer(async (request, response) => {
  if (await handleTodoayMcpHttpRequest(request, response, port)) {
    return;
  }

  await handleStaticAppRequest(request, response);
});

server.listen(port, () => {
  console.error(`Todoay app + MCP server listening on http://localhost:${port}`);
  console.error(`MCP endpoint: http://localhost:${port}/mcp`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
