import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ynabRequest,
  resolvePlanId,
  formatCurrency,
  toMilliunits,
} from "../ynab-client.js";

interface ScheduledTransaction {
  id: string;
  date_first: string;
  date_next: string;
  frequency: string;
  amount: number;
  account_id: string;
  account_name: string;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  memo: string | null;
  flag_color: string | null;
  deleted: boolean;
  [key: string]: unknown;
}

function enrichScheduled(
  tx: ScheduledTransaction,
): ScheduledTransaction & { amount_formatted: string } {
  return {
    ...tx,
    amount_formatted: formatCurrency(tx.amount),
  };
}

export function registerScheduledTransactionTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_scheduled_transactions
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_scheduled_transactions",
    {
      title: "List YNAB Scheduled Transactions",
      description:
        "Returns all scheduled (recurring) transactions. Supports delta requests.",
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
        scheduled_transactions: ScheduledTransaction[];
        server_knowledge: number;
      }>(`/plans/${pid}/scheduled_transactions`, {
        params: { last_knowledge_of_server },
      });
      const enriched = data.scheduled_transactions.map(enrichScheduled);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                scheduled_transactions: enriched,
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
  // get_scheduled_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_scheduled_transaction",
    {
      title: "Get YNAB Scheduled Transaction",
      description: "Returns a single scheduled transaction by ID.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        scheduled_transaction_id: z
          .string()
          .describe("The scheduled transaction ID."),
      }),
    },
    async ({ plan_id, scheduled_transaction_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        scheduled_transaction: ScheduledTransaction;
      }>(
        `/plans/${pid}/scheduled_transactions/${scheduled_transaction_id}`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              enrichScheduled(data.scheduled_transaction),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // create_scheduled_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_scheduled_transaction",
    {
      title: "Create YNAB Scheduled Transaction",
      description:
        "Creates a new scheduled transaction (a transaction with a future date, " +
        "up to 5 years out). Use a negative amount for expenses and positive " +
        "for income. Split scheduled transactions are not supported.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        account_id: z.string().describe("The account ID."),
        date: z
          .string()
          .describe(
            "The first/next date for this scheduled transaction (ISO format, e.g. 2025-05-01). " +
            "Must be a future date, no more than 5 years out.",
          ),
        amount: z
          .number()
          .describe(
            "The amount in currency units (e.g. -50.00 for expense). Auto-converted to milliunits.",
          ),
        frequency: z
          .enum([
            "never",
            "daily",
            "weekly",
            "everyOtherWeek",
            "twiceAMonth",
            "every4Weeks",
            "monthly",
            "everyOtherMonth",
            "every3Months",
            "every4Months",
            "twiceAYear",
            "yearly",
            "everyOtherYear",
          ])
          .describe(
            'How often this transaction repeats. Use "never" for a one-time future transaction.',
          ),
        payee_name: z
          .string()
          .optional()
          .describe("The payee name. A new payee is created if it doesn't exist."),
        payee_id: z
          .string()
          .optional()
          .describe("The payee ID (takes precedence over payee_name)."),
        category_id: z
          .string()
          .optional()
          .describe("The category ID."),
        memo: z.string().optional().describe("A memo/note."),
        flag_color: z
          .enum(["red", "orange", "yellow", "green", "blue", "purple"])
          .optional()
          .describe("Optional flag color."),
      }),
    },
    async ({
      plan_id,
      account_id,
      date,
      amount,
      frequency,
      payee_name,
      payee_id,
      category_id,
      memo,
      flag_color,
    }) => {
      const pid = resolvePlanId(plan_id);
      const milliunits = toMilliunits(amount);

      const body = {
        scheduled_transaction: {
          account_id,
          date,
          amount: milliunits,
          frequency,
          ...(payee_id && { payee_id }),
          ...(payee_name && !payee_id && { payee_name }),
          ...(category_id && { category_id }),
          ...(memo && { memo }),
          ...(flag_color && { flag_color }),
        },
      };

      const data = await ynabRequest<{
        scheduled_transaction: ScheduledTransaction;
      }>(`/plans/${pid}/scheduled_transactions`, {
        method: "POST",
        body,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              enrichScheduled(data.scheduled_transaction),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // update_scheduled_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_scheduled_transaction",
    {
      title: "Update YNAB Scheduled Transaction",
      description:
        "Updates an existing scheduled transaction. Only provided fields are changed. " +
        "Amount is in currency units (auto-converted to milliunits).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        scheduled_transaction_id: z
          .string()
          .describe("The scheduled transaction ID to update."),
        account_id: z.string().optional().describe("New account ID."),
        date: z.string().optional().describe("New date (ISO format)."),
        amount: z
          .number()
          .optional()
          .describe("New amount in currency units."),
        frequency: z
          .enum([
            "never",
            "daily",
            "weekly",
            "everyOtherWeek",
            "twiceAMonth",
            "every4Weeks",
            "monthly",
            "everyOtherMonth",
            "every3Months",
            "every4Months",
            "twiceAYear",
            "yearly",
            "everyOtherYear",
          ])
          .optional()
          .describe("New frequency."),
        payee_name: z.string().optional().describe("New payee name."),
        payee_id: z.string().optional().describe("New payee ID."),
        category_id: z.string().optional().describe("New category ID."),
        memo: z.string().optional().describe("New memo."),
        flag_color: z
          .enum(["red", "orange", "yellow", "green", "blue", "purple"])
          .optional()
          .describe("New flag color."),
      }),
    },
    async ({
      plan_id,
      scheduled_transaction_id,
      account_id,
      date,
      amount,
      frequency,
      payee_name,
      payee_id,
      category_id,
      memo,
      flag_color,
    }) => {
      const pid = resolvePlanId(plan_id);

      const scheduled_transaction: Record<string, unknown> = {};
      if (account_id !== undefined) scheduled_transaction.account_id = account_id;
      if (date !== undefined) scheduled_transaction.date = date;
      if (amount !== undefined) scheduled_transaction.amount = toMilliunits(amount);
      if (frequency !== undefined) scheduled_transaction.frequency = frequency;
      if (payee_name !== undefined) scheduled_transaction.payee_name = payee_name;
      if (payee_id !== undefined) scheduled_transaction.payee_id = payee_id;
      if (category_id !== undefined) scheduled_transaction.category_id = category_id;
      if (memo !== undefined) scheduled_transaction.memo = memo;
      if (flag_color !== undefined) scheduled_transaction.flag_color = flag_color;

      const data = await ynabRequest<{
        scheduled_transaction: ScheduledTransaction;
      }>(
        `/plans/${pid}/scheduled_transactions/${scheduled_transaction_id}`,
        { method: "PUT", body: { scheduled_transaction } },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              enrichScheduled(data.scheduled_transaction),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // delete_scheduled_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "delete_scheduled_transaction",
    {
      title: "Delete YNAB Scheduled Transaction",
      description: "Deletes an existing scheduled transaction.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        scheduled_transaction_id: z
          .string()
          .describe("The scheduled transaction ID to delete."),
      }),
    },
    async ({ plan_id, scheduled_transaction_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        scheduled_transaction: ScheduledTransaction;
      }>(
        `/plans/${pid}/scheduled_transactions/${scheduled_transaction_id}`,
        { method: "DELETE" },
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              enrichScheduled(data.scheduled_transaction),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
