import { createServer } from "node:http";
import { handleTodoayMcpHttpRequest, sendJson } from "./httpHandler.ts";
import { loadMcpEnv } from "./loadEnv.ts";

loadMcpEnv();

const port = Number(process.env.TODOAY_MCP_PORT ?? 3333);

const server = createServer(async (request, response) => {
  if (await handleTodoayMcpHttpRequest(request, response, port)) {
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.error(`Todoay MCP HTTP server listening on http://localhost:${port}/mcp`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
