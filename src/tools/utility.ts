import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ynabRequest,
  resolvePlanId,
  getRateLimitInfo,
  formatCurrency,
} from "../ynab-client.js";

interface Transaction {
  id: string;
  date: string;
  amount: number;
  payee_name: string | null;
  category_name: string | null;
  memo: string | null;
  cleared: string;
  approved: boolean;
  account_name: string;
  [key: string]: unknown;
}

export function registerUtilityTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // get_rate_limit
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_rate_limit",
    {
      title: "Get YNAB API Rate Limit",
      description:
        "Returns the current rate limit status — how many API requests remain " +
        "in the current hour. YNAB allows 200 requests per hour per access token.",
      inputSchema: z.object({}),
    },
    async () => {
      const info = getRateLimitInfo();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                requests_remaining: info.remaining,
                limit_per_hour: 200,
                resets_at: info.resetAt,
                note:
                  "Use delta requests (last_knowledge_of_server) to minimize API calls.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // list_transactions_by_month
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_transactions_by_month",
    {
      title: "List Transactions by Month",
      description:
        "Returns all transactions for a specific month. " +
        'Use "current" or an ISO date like "2025-04-01".',
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        month: z
          .string()
          .describe(
            'The month in ISO format (e.g. "2025-04-01") or "current".',
          ),
        type: z
          .enum(["uncategorized", "unapproved"])
          .optional()
          .describe("Filter to only uncategorized or unapproved transactions."),
        last_knowledge_of_server: z
          .number()
          .int()
          .optional()
          .describe("Delta request cursor."),
      }),
    },
    async ({ plan_id, month, type, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        transactions: Transaction[];
        server_knowledge: number;
      }>(`/plans/${pid}/months/${month}/transactions`, {
        params: { type, last_knowledge_of_server },
      });
      const enriched = data.transactions.map((tx) => ({
        ...tx,
        amount_formatted: formatCurrency(tx.amount),
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                transactions: enriched,
                server_knowledge: data.server_knowledge,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
