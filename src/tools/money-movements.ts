import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId } from "../ynab-client.js";

export function registerMoneyMovementTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_money_movements
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_money_movements",
    {
      title: "List YNAB Money Movements",
      description: "Returns all money movements for a plan.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
      }),
    },
    async ({ plan_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ money_movements: unknown[] }>(
        `/plans/${pid}/money_movements`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.money_movements, null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // list_money_movements_by_month
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_money_movements_by_month",
    {
      title: "List YNAB Money Movements for Month",
      description:
        "Returns all money movements for a specific month. " +
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
      }),
    },
    async ({ plan_id, month }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ money_movements: unknown[] }>(
        `/plans/${pid}/months/${month}/money_movements`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.money_movements, null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // list_money_movement_groups
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_money_movement_groups",
    {
      title: "List YNAB Money Movement Groups",
      description: "Returns all money movement groups for a plan.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
      }),
    },
    async ({ plan_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ money_movement_groups: unknown[] }>(
        `/plans/${pid}/money_movement_groups`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.money_movement_groups, null, 2),
          },
        ],
      };
    },
  );
}
