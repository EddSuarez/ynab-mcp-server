import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId, formatCurrency, toMilliunits } from "../ynab-client.js";

interface Account {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  balance: number;
  cleared_balance: number;
  uncleared_balance: number;
  [key: string]: unknown;
}

function enrichAccount(account: Account): Account & { balance_formatted: string } {
  return {
    ...account,
    balance_formatted: formatCurrency(account.balance),
  };
}

export function registerAccountTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_accounts
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_accounts",
    {
      title: "List YNAB Accounts",
      description:
        "Returns all accounts for a YNAB plan. " +
        "Includes balances, types (checking, savings, credit card, etc.), and status.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        last_knowledge_of_server: z
          .number()
          .int()
          .optional()
          .describe("Delta request cursor — only returns changed entities."),
      }),
    },
    async ({ plan_id, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        accounts: Account[];
        server_knowledge: number;
      }>(`/plans/${pid}/accounts`, {
        params: { last_knowledge_of_server },
      });
      const enriched = data.accounts.map(enrichAccount);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { accounts: enriched, server_knowledge: data.server_knowledge },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_account
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_account",
    {
      title: "Get YNAB Account",
      description:
        "Returns a single YNAB account with balance, type, and status details.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        account_id: z
          .string()
          .describe("The UUID of the account."),
      }),
    },
    async ({ plan_id, account_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ account: Account }>(
        `/plans/${pid}/accounts/${account_id}`,
      );
      const enriched = enrichAccount(data.account);
      return {
        content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // create_account
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_account",
    {
      title: "Create YNAB Account",
      description:
        "Creates a new account. Supported types: checking, savings, cash, creditCard. " +
        "The balance is the starting balance in currency units.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        name: z.string().describe("The account name."),
        type: z
          .enum(["checking", "savings", "cash", "creditCard"])
          .describe("The account type."),
        balance: z
          .number()
          .describe(
            "The starting balance in currency units (e.g. 1000.00). " +
            "Auto-converted to milliunits.",
          ),
      }),
    },
    async ({ plan_id, name, type, balance }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ account: Account }>(
        `/plans/${pid}/accounts`,
        {
          method: "POST",
          body: {
            account: {
              name,
              type,
              balance: toMilliunits(balance),
            },
          },
        },
      );
      const enriched = enrichAccount(data.account);
      return {
        content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      };
    },
  );
}
