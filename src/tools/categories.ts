import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId, formatCurrency, toMilliunits } from "../ynab-client.js";

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

export function registerCategoryTools(server: McpServer): void {
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
  // get_category
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_category",
    {
      title: "Get YNAB Category",
      description:
        "Returns a single category with amounts for the current month.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        category_id: z.string().describe("The category ID."),
      }),
    },
    async ({ plan_id, category_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ category: Category }>(
        `/plans/${pid}/categories/${category_id}`,
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(enrichCategory(data.category), null, 2) },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_month_category
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_month_category",
    {
      title: "Get YNAB Category for Month",
      description:
        "Returns a single category with amounts for a specific month. " +
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
        category_id: z.string().describe("The category ID."),
      }),
    },
    async ({ plan_id, month, category_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ category: Category }>(
        `/plans/${pid}/months/${month}/categories/${category_id}`,
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(enrichCategory(data.category), null, 2) },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // create_category
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_category",
    {
      title: "Create YNAB Category",
      description:
        "Creates a new category within a category group. " +
        "Optionally set a goal target amount and/or target date.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        category_group_id: z
          .string()
          .describe("The category group ID this category belongs to."),
        name: z.string().describe("The category name."),
        goal_target: z
          .number()
          .optional()
          .describe(
            "Goal target amount in currency units (auto-converted to milliunits).",
          ),
        goal_target_date: z
          .string()
          .optional()
          .describe("Goal target date in ISO format (e.g. 2025-12-01)."),
      }),
    },
    async ({ plan_id, category_group_id, name, goal_target, goal_target_date }) => {
      const pid = resolvePlanId(plan_id);
      const body: Record<string, unknown> = {
        category: {
          category_group_id,
          name,
          ...(goal_target !== undefined && {
            goal_target: toMilliunits(goal_target),
          }),
          ...(goal_target_date && { goal_target_date }),
        },
      };
      const data = await ynabRequest<{ category: Category }>(
        `/plans/${pid}/categories`,
        { method: "POST", body },
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(enrichCategory(data.category), null, 2) },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // update_category
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_category",
    {
      title: "Update YNAB Category",
      description:
        "Updates an existing category (name, goal target, etc.).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        category_id: z.string().describe("The category ID to update."),
        name: z.string().optional().describe("New category name."),
        goal_target: z
          .number()
          .optional()
          .describe(
            "New goal target amount in currency units. " +
            "Can only be changed if the category already has a configured goal.",
          ),
        goal_target_date: z
          .string()
          .optional()
          .describe("New goal target date (ISO format)."),
      }),
    },
    async ({ plan_id, category_id, name, goal_target, goal_target_date }) => {
      const pid = resolvePlanId(plan_id);
      const category: Record<string, unknown> = {};
      if (name !== undefined) category.name = name;
      if (goal_target !== undefined) category.goal_target = toMilliunits(goal_target);
      if (goal_target_date !== undefined) category.goal_target_date = goal_target_date;

      const data = await ynabRequest<{ category: Category }>(
        `/plans/${pid}/categories/${category_id}`,
        { method: "PATCH", body: { category } },
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(enrichCategory(data.category), null, 2) },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // update_month_category
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_month_category",
    {
      title: "Update YNAB Category Budget for Month",
      description:
        "Updates the assigned (budgeted) amount for a category in a specific month. " +
        "This is the primary way to assign money to categories. " +
        "Only the budgeted amount can be updated; other fields are ignored.",
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
        category_id: z.string().describe("The category ID."),
        budgeted: z
          .number()
          .describe(
            "The amount to assign to this category in currency units " +
            "(e.g. 500.00). Auto-converted to milliunits.",
          ),
      }),
    },
    async ({ plan_id, month, category_id, budgeted }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ category: Category }>(
        `/plans/${pid}/months/${month}/categories/${category_id}`,
        {
          method: "PATCH",
          body: { category: { budgeted: toMilliunits(budgeted) } },
        },
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(enrichCategory(data.category), null, 2) },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // create_category_group
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_category_group",
    {
      title: "Create YNAB Category Group",
      description: "Creates a new category group.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        name: z.string().describe("The category group name."),
      }),
    },
    async ({ plan_id, name }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ category_group: unknown }>(
        `/plans/${pid}/category_groups`,
        { method: "POST", body: { category_group: { name } } },
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(data.category_group, null, 2) },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // update_category_group
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_category_group",
    {
      title: "Update YNAB Category Group",
      description: "Updates an existing category group (e.g. rename).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        category_group_id: z
          .string()
          .describe("The category group ID to update."),
        name: z.string().describe("The new name for the category group."),
      }),
    },
    async ({ plan_id, category_group_id, name }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ category_group: unknown }>(
        `/plans/${pid}/category_groups/${category_group_id}`,
        { method: "PATCH", body: { category_group: { name } } },
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(data.category_group, null, 2) },
        ],
      };
    },
  );
}
