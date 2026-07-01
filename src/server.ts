import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerUserTools } from "./tools/user.js";
import { registerPlanTools } from "./tools/plans.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerCategoryTools } from "./tools/categories.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerMonthTools } from "./tools/months.js";
import { registerPayeeTools } from "./tools/payees.js";
import { registerPayeeLocationTools } from "./tools/payee-locations.js";
import { registerScheduledTransactionTools } from "./tools/scheduled-transactions.js";
import { registerMoneyMovementTools } from "./tools/money-movements.js";
import { registerCompositeTools } from "./tools/composite.js";
import { registerUtilityTools } from "./tools/utility.js";

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "ynab-mcp-server",
    version: "0.3.2",
  });

  registerUserTools(server);
  registerPlanTools(server);
  registerAccountTools(server);
  registerCategoryTools(server);
  registerTransactionTools(server);
  registerMonthTools(server);
  registerPayeeTools(server);
  registerPayeeLocationTools(server);
  registerScheduledTransactionTools(server);
  registerMoneyMovementTools(server);
  registerCompositeTools(server);
  registerUtilityTools(server);

  return server;
}
