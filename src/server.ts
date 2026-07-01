import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerInsightTools } from "./tools/insights.js";
import { registerApiTools } from "./tools/api.js";

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "ynab-mcp-server",
    version: "0.4.0",
  });
  registerTransactionTools(server);
  registerInsightTools(server);
  registerApiTools(server);
  return server;
}
