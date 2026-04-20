#!/usr/bin/env node

/**
 * YNAB MCP Server
 *
 * An MCP server that exposes the YNAB (You Need A Budget) API as tools,
 * enabling AI assistants to read and manage budgets through natural language.
 *
 * Requires: YNAB_ACCESS_TOKEN environment variable.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

const server = new McpServer({
  name: "ynab-mcp-server",
  version: "0.2.0",
});

// Register all tool groups
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

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
