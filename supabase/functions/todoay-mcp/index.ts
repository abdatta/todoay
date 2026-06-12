import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createTodoayMcpServer } from "../../../mcp/server.ts";
import {
  createSupabaseTodoayRepository,
  readSupabaseConfig,
  verifySupabaseAccessToken,
} from "../../../mcp/todoayRepository.ts";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

const functionName = "todoay-mcp";
const defaultScopes = "openid email profile";

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getEnv = (name: string) => Deno.env.get(name);

const getScopes = () => getEnv("TODOAY_MCP_SCOPES") ?? defaultScopes;

const getBearerToken = (authorization: string | null) => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

const jsonResponse = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const getConfiguredMcpUrl = () => {
  const configured = getEnv("TODOAY_MCP_PUBLIC_URL");
  return configured ? withoutTrailingSlash(configured) : null;
};

const getFunctionUrlFromRequest = (request: Request) => {
  const url = new URL(request.url);
  const marker = `/functions/v1/${functionName}`;
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex !== -1) {
    return `${url.origin}${url.pathname.slice(0, markerIndex + marker.length)}`;
  }

  const functionMarker = `/${functionName}`;
  const functionMarkerIndex = url.pathname.indexOf(functionMarker);
  if (functionMarkerIndex !== -1) {
    return `${url.origin}/functions/v1/${functionName}`;
  }

  return `${url.origin}${url.pathname.replace(/\/(?:mcp)?$/, "")}`;
};

const getMcpUrl = (request: Request) => getConfiguredMcpUrl() ?? getFunctionUrlFromRequest(request);

const getMetadataBaseUrl = (request: Request) => {
  const mcpUrl = getMcpUrl(request);
  return mcpUrl.endsWith("/mcp") ? mcpUrl.slice(0, -"/mcp".length) : mcpUrl;
};

const getSupabaseAuthIssuer = () => `${withoutTrailingSlash(readSupabaseConfig().url)}/auth/v1`;

const buildProtectedResourceMetadata = (request: Request) => ({
  resource: getMcpUrl(request),
  authorization_servers: [getSupabaseAuthIssuer()],
  scopes_supported: getScopes().split(/\s+/).filter(Boolean),
  bearer_methods_supported: ["header"],
  resource_name: "Todoay MCP",
  resource_documentation: getMcpUrl(request),
});

const stripFunctionPrefix = (pathname: string) => {
  const prefixes = [`/functions/v1/${functionName}`, `/${functionName}`];
  const prefix = prefixes.find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  return prefix ? pathname.slice(prefix.length) || "/" : pathname;
};

const isMetadataPath = (pathname: string) =>
  pathname === "/.well-known/oauth-protected-resource" ||
  pathname === "/.well-known/oauth-protected-resource/mcp" ||
  pathname === "/mcp/.well-known/oauth-protected-resource" ||
  pathname === "/mcp/.well-known/oauth-protected-resource/mcp";

const isMcpPath = (pathname: string) => pathname === "/" || pathname === "" || pathname === "/mcp";

const unauthorizedResponse = (request: Request, message: string) =>
  jsonResponse(
    {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message,
      },
      id: null,
    },
    {
      status: 401,
      headers: {
        "www-authenticate": `Bearer resource_metadata="${getMetadataBaseUrl(request)}/.well-known/oauth-protected-resource/mcp", scope="${getScopes()}"`,
      },
    },
  );

const handleMcpRequest = async (request: Request) => {
  if (request.method !== "POST") {
    if (request.method === "GET" || request.method === "HEAD") {
      return unauthorizedResponse(request, "Authorization required.");
    }

    return jsonResponse(
      {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      },
      { status: 405 },
    );
  }

  const token = getBearerToken(request.headers.get("authorization"));
  if (!token) {
    return unauthorizedResponse(request, "Missing Authorization: Bearer <Supabase access token>.");
  }

  try {
    await verifySupabaseAccessToken(token);
  } catch {
    return unauthorizedResponse(request, "Invalid or expired Supabase access token.");
  }

  const mcpServer = createTodoayMcpServer(createSupabaseTodoayRepository(token));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await mcpServer.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error(error);
    return jsonResponse(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal server error.",
        },
        id: null,
      },
      { status: 500 },
    );
  }
};

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const pathname = stripFunctionPrefix(url.pathname);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
      },
    });
  }

  if (isMetadataPath(pathname)) {
    return jsonResponse(buildProtectedResourceMetadata(request));
  }

  if (isMcpPath(pathname)) {
    return handleMcpRequest(request);
  }

  return jsonResponse({ error: "Not found" }, { status: 404 });
});
