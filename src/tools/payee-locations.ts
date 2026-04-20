import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId } from "../ynab-client.js";

interface PayeeLocation {
  id: string;
  payee_id: string;
  latitude: string;
  longitude: string;
  deleted: boolean;
  [key: string]: unknown;
}

export function registerPayeeLocationTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_payee_locations
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_payee_locations",
    {
      title: "List YNAB Payee Locations",
      description:
        "Returns all payee GPS locations. These are stored when transactions " +
        "are entered on the YNAB mobile apps with location permissions enabled.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
      }),
    },
    async ({ plan_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ payee_locations: PayeeLocation[] }>(
        `/plans/${pid}/payee_locations`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.payee_locations, null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_payee_location
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_payee_location",
    {
      title: "Get YNAB Payee Location",
      description: "Returns a single payee location by ID.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        payee_location_id: z.string().describe("The payee location ID."),
      }),
    },
    async ({ plan_id, payee_location_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ payee_location: PayeeLocation }>(
        `/plans/${pid}/payee_locations/${payee_location_id}`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.payee_location, null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // list_locations_for_payee
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_locations_for_payee",
    {
      title: "List Locations for a Payee",
      description: "Returns all GPS locations associated with a specific payee.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        payee_id: z.string().describe("The payee ID."),
      }),
    },
    async ({ plan_id, payee_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ payee_locations: PayeeLocation[] }>(
        `/plans/${pid}/payees/${payee_id}/payee_locations`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.payee_locations, null, 2),
          },
        ],
      };
    },
  );
}
