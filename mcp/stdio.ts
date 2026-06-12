import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTodoayMcpServer } from "./server.ts";
import { createEnvTodoayRepository } from "./todoayRepository.ts";
import { loadMcpEnv } from "./loadEnv.ts";

loadMcpEnv();

async function main() {
  const server = createTodoayMcpServer(createEnvTodoayRepository());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
