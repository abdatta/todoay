import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createTodoayMcpServer } from "./server.ts";
import { createSupabaseTodoayRepository, readSupabaseConfig, verifySupabaseAccessToken } from "./todoayRepository.ts";

const parseJsonBody = async (request: IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });

const getBearerToken = (authorization: string | undefined) => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getRequestOrigin = (request: IncomingMessage, fallbackPort: number) => {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  return `${proto ?? "http"}://${host ?? request.headers.host ?? `localhost:${fallbackPort}`}`;
};

const getPublicBaseUrl = (request: IncomingMessage, fallbackPort: number) => {
  const configured = process.env.TODOAY_MCP_PUBLIC_URL;
  const rawBaseUrl = configured ? withoutTrailingSlash(configured) : getRequestOrigin(request, fallbackPort);
  return rawBaseUrl.endsWith("/mcp") ? rawBaseUrl.slice(0, -"/mcp".length) : rawBaseUrl;
};

const getMcpUrl = (request: IncomingMessage, fallbackPort: number) => {
  const configured = process.env.TODOAY_MCP_PUBLIC_URL;
  if (configured && withoutTrailingSlash(configured).endsWith("/mcp")) {
    return withoutTrailingSlash(configured);
  }
  return `${getPublicBaseUrl(request, fallbackPort)}/mcp`;
};

const getSupabaseAuthIssuer = () => `${withoutTrailingSlash(readSupabaseConfig().url)}/auth/v1`;

const getScopes = () => process.env.TODOAY_MCP_SCOPES ?? "openid email profile";

export const sendJson = (
  response: ServerResponse<IncomingMessage>,
  status: number,
  value: unknown,
  headers?: Record<string, string>,
) => {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(value));
};

const sendUnauthorized = (
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  fallbackPort: number,
  message: string,
) => {
  sendJson(
    response,
    401,
    {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message,
      },
      id: null,
    },
    {
      "www-authenticate": `Bearer resource_metadata="${getPublicBaseUrl(request, fallbackPort)}/.well-known/oauth-protected-resource/mcp", scope="${getScopes()}"`,
    },
  );
};

const buildProtectedResourceMetadata = (request: IncomingMessage, fallbackPort: number) => ({
  resource: getMcpUrl(request, fallbackPort),
  authorization_servers: [getSupabaseAuthIssuer()],
  scopes_supported: getScopes().split(/\s+/).filter(Boolean),
  bearer_methods_supported: ["header"],
  resource_name: "Todoay MCP",
  resource_documentation: `${getPublicBaseUrl(request, fallbackPort)}/mcp`,
});

const isMcpHttpPath = (pathname: string) =>
  pathname === "/mcp" ||
  pathname === "/.well-known/oauth-protected-resource" ||
  pathname === "/.well-known/oauth-protected-resource/mcp";

export const handleTodoayMcpHttpRequest = async (
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  fallbackPort: number,
) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (!isMcpHttpPath(url.pathname)) {
    return false;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, mcp-session-id",
    });
    response.end();
    return true;
  }

  if (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    sendJson(response, 200, buildProtectedResourceMetadata(request, fallbackPort));
    return true;
  }

  if (request.method !== "POST") {
    if (request.method === "GET" || request.method === "HEAD") {
      sendUnauthorized(request, response, fallbackPort, "Authorization required.");
      return true;
    }

    sendJson(response, 405, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
    return true;
  }

  const token = getBearerToken(request.headers.authorization);
  if (!token) {
    sendUnauthorized(request, response, fallbackPort, "Missing Authorization: Bearer <Supabase access token>.");
    return true;
  }

  try {
    await verifySupabaseAccessToken(token);
  } catch {
    sendUnauthorized(request, response, fallbackPort, "Invalid or expired Supabase access token.");
    return true;
  }

  const mcpServer = createTodoayMcpServer(createSupabaseTodoayRepository(token));
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    const body = await parseJsonBody(request);
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, body);
    response.on("close", () => {
      void transport.close();
      void mcpServer.close();
    });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal server error.",
        },
        id: null,
      });
    }
  }

  return true;
};
