import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId, formatCurrency } from "../ynab-client.js";

interface Category {
  id: string;
  name: string;
  budgeted: number;
  activity: number;
  balance: number;
  [key: string]: unknown;
}

interface CategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories: Category[];
}

function enrichCategory(cat: Category): Category & {
  budgeted_formatted: string;
  activity_formatted: string;
  balance_formatted: string;
} {
  return {
    ...cat,
    budgeted_formatted: formatCurrency(cat.budgeted),
    activity_formatted: formatCurrency(cat.activity),
    balance_formatted: formatCurrency(cat.balance),
  };
}

function enrichGroups(groups: CategoryGroup[]) {
  return groups.map((g) => ({
    ...g,
    categories: g.categories.map(enrichCategory),
  }));
}

export function isAllowedYnabPath(path: string): boolean {
  return /^\/(plans|budgets|user)(\/|$)/.test(path) && !path.includes("..");
}

export function registerApiTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_categories
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_categories",
    {
      title: "List YNAB Categories",
      description:
        "Returns all categories grouped by category group, with amounts " +
        "(assigned, activity, available) for the current month.",
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
        category_groups: CategoryGroup[];
        server_knowledge: number;
      }>(`/plans/${pid}/categories`, {
        params: { last_knowledge_of_server },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                category_groups: enrichGroups(data.category_groups),
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

  // -----------------------------------------------------------------------
  // ynab_get — read-only escape hatch
  // -----------------------------------------------------------------------
  server.registerTool(
    "ynab_get",
    {
      title: "Raw YNAB API GET",
      description:
        "Read-only escape hatch: performs a GET against any YNAB API v1 " +
        "endpoint and returns the raw JSON. Use for anything the dedicated " +
        "tools don't cover (months, payees, scheduled transactions, payee " +
        "locations, delta requests...). Path must start with /plans, /budgets " +
        "or /user. See https://api.ynab.com/v1 for endpoints.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'API path, e.g. "/plans/last-used/months/current" or ' +
              '"/plans/last-used/payees".',
          ),
        params: z
          .record(z.string())
          .optional()
          .describe("Optional query parameters."),
      }),
    },
    async ({ path, params }) => {
      if (!isAllowedYnabPath(path)) {
        return {
          content: [
            {
              type: "text",
              text: "Error: path must start with /plans, /budgets or /user.",
            },
          ],
          isError: true,
        };
      }
      const data = await ynabRequest<unknown>(path, { params });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
