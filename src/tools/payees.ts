import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ynabRequest, resolvePlanId } from "../ynab-client.js";

interface Payee {
  id: string;
  name: string;
  transfer_account_id: string | null;
  deleted: boolean;
  [key: string]: unknown;
}

export function registerPayeeTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_payees
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_payees",
    {
      title: "List YNAB Payees",
      description:
        "Returns all payees for a plan. Supports delta requests.",
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
        payees: Payee[];
        server_knowledge: number;
      }>(`/plans/${pid}/payees`, {
        params: { last_knowledge_of_server },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { payees: data.payees, server_knowledge: data.server_knowledge },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_payee
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_payee",
    {
      title: "Get YNAB Payee",
      description: "Returns a single payee by ID.",
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
      const data = await ynabRequest<{ payee: Payee }>(
        `/plans/${pid}/payees/${payee_id}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.payee, null, 2) }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // create_payee
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_payee",
    {
      title: "Create YNAB Payee",
      description: "Creates a new payee.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        name: z.string().describe("The name for the new payee."),
      }),
    },
    async ({ plan_id, name }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ payee: Payee }>(
        `/plans/${pid}/payees`,
        { method: "POST", body: { payee: { name } } },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.payee, null, 2) }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // update_payee
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_payee",
    {
      title: "Update YNAB Payee",
      description: "Updates an existing payee (e.g. rename).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        payee_id: z.string().describe("The payee ID to update."),
        name: z.string().describe("The new name for the payee."),
      }),
    },
    async ({ plan_id, payee_id, name }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ payee: Payee }>(
        `/plans/${pid}/payees/${payee_id}`,
        { method: "PATCH", body: { payee: { name } } },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.payee, null, 2) }],
      };
    },
  );
}
