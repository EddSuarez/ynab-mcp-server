import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId, formatCurrency } from "../ynab-client.js";

interface MonthSummary {
  month: string;
  income: number;
  budgeted: number;
  activity: number;
  to_be_budgeted: number;
  age_of_money: number | null;
  [key: string]: unknown;
}

interface MonthDetail extends MonthSummary {
  categories: unknown[];
}

function enrichMonth<T extends MonthSummary>(m: T): T & {
  income_formatted: string;
  budgeted_formatted: string;
  activity_formatted: string;
  to_be_budgeted_formatted: string;
} {
  return {
    ...m,
    income_formatted: formatCurrency(m.income),
    budgeted_formatted: formatCurrency(m.budgeted),
    activity_formatted: formatCurrency(m.activity),
    to_be_budgeted_formatted: formatCurrency(m.to_be_budgeted),
  };
}

export function registerMonthTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_months
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_months",
    {
      title: "List YNAB Plan Months",
      description:
        "Returns all plan months with summary amounts " +
        "(income, budgeted, activity, Ready to Assign, Age of Money).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        last_knowledge_of_server: z
          .number()
          .int()
          .optional()
          .describe("Delta request cursor."),
      }),
    },
    async ({ plan_id, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        months: MonthSummary[];
        server_knowledge: number;
      }>(`/plans/${pid}/months`, {
        params: { last_knowledge_of_server },
      });
      const enriched = data.months.map(enrichMonth);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { months: enriched, server_knowledge: data.server_knowledge },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_month
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_month",
    {
      title: "Get YNAB Plan Month",
      description:
        "Returns a single plan month with full detail including all category amounts. " +
        'Use "current" for the current month or an ISO date like "2025-04-01".',
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
      }),
    },
    async ({ plan_id, month }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ month: MonthDetail }>(
        `/plans/${pid}/months/${month}`,
      );
      const enriched = enrichMonth(data.month);
      return {
        content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      };
    },
  );
}
