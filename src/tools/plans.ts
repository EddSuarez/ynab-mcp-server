import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId } from "../ynab-client.js";

export function registerPlanTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_plans
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_plans",
    {
      title: "List YNAB Plans",
      description:
        "Returns all YNAB plans (budgets) with summary information. " +
        "Optionally includes account lists per plan.",
      inputSchema: z.object({
        include_accounts: z
          .boolean()
          .optional()
          .describe("Whether to include the list of accounts for each plan."),
      }),
    },
    async ({ include_accounts }) => {
      const data = await ynabRequest<{ plans: unknown[] }>("/plans", {
        params: { include_accounts },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data.plans, null, 2) }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_plan
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_plan",
    {
      title: "Get YNAB Plan",
      description:
        "Returns a single YNAB plan with all related entities (full export). " +
        'Use plan_id "last-used" or "default" as shortcuts. ' +
        "Supports delta requests via last_knowledge_of_server.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe(
            'The plan ID. Use "last-used" (default) or "default" as shortcuts.',
          ),
        last_knowledge_of_server: z
          .number()
          .int()
          .optional()
          .describe(
            "If provided, only entities changed since this server knowledge value will be returned.",
          ),
      }),
    },
    async ({ plan_id, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ plan: unknown }>(
        `/plans/${pid}`,
        { params: { last_knowledge_of_server } },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.plan, null, 2) }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_plan_settings
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_plan_settings",
    {
      title: "Get YNAB Plan Settings",
      description:
        "Returns settings for a YNAB plan (currency format, date format, etc.).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe(
            'The plan ID. Use "last-used" (default) or "default" as shortcuts.',
          ),
      }),
    },
    async ({ plan_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ settings: unknown }>(
        `/plans/${pid}/settings`,
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(data.settings, null, 2) },
        ],
      };
    },
  );
}
