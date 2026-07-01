import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ynabRequest,
  resolvePlanId,
  formatCurrency,
  toMilliunits,
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

function enrichTransaction(
  tx: Transaction,
): Transaction & { amount_formatted: string } {
  return {
    ...tx,
    amount_formatted: formatCurrency(tx.amount),
  };
}

export function registerTransactionTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // create_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_transaction",
    {
      title: "Create YNAB Transaction",
      description:
        "Creates a single transaction. Use a negative amount for expenses " +
        "and a positive amount for income. Amounts can be in normal currency " +
        "(e.g. 25.50) — they will be converted to milliunits automatically. " +
        "You can also create multiple transactions at once by passing the " +
        "transactions array instead of the single transaction fields.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        account_id: z.string().describe("The account ID for this transaction."),
        date: z
          .string()
          .describe("The transaction date in ISO format (e.g. 2025-04-17)."),
        amount: z
          .number()
          .describe(
            "The amount in currency units (e.g. -25.50 for an expense, 300 for income). " +
            "Will be auto-converted to YNAB milliunits.",
          ),
        payee_name: z
          .string()
          .optional()
          .describe(
            "The payee name. If a payee with this name doesn't exist, one will be created.",
          ),
        payee_id: z
          .string()
          .optional()
          .describe(
            "The payee ID (alternative to payee_name). If both are provided, payee_id takes precedence.",
          ),
        category_id: z
          .string()
          .optional()
          .describe("The category ID for this transaction."),
        memo: z
          .string()
          .optional()
          .describe("A memo/note for this transaction."),
        cleared: z
          .enum(["cleared", "uncleared", "reconciled"])
          .optional()
          .describe('Cleared status. Defaults to "uncleared".'),
        approved: z
          .boolean()
          .optional()
          .describe("Whether the transaction is approved. Defaults to true."),
        flag_color: z
          .enum(["red", "orange", "yellow", "green", "blue", "purple"])
          .optional()
          .describe("Optional flag color."),
        import_id: z
          .string()
          .optional()
          .describe(
            "An import ID to prevent duplicate imports. " +
            "Format: YNAB:[milliunit_amount]:[iso_date]:[occurrence]",
          ),
      }),
    },
    async ({
      plan_id,
      account_id,
      date,
      amount,
      payee_name,
      payee_id,
      category_id,
      memo,
      cleared,
      approved,
      flag_color,
      import_id,
    }) => {
      const pid = resolvePlanId(plan_id);
      const milliunits = toMilliunits(amount);

      const body = {
        transaction: {
          account_id,
          date,
          amount: milliunits,
          ...(payee_id && { payee_id }),
          ...(payee_name && !payee_id && { payee_name }),
          ...(category_id && { category_id }),
          ...(memo && { memo }),
          cleared: cleared ?? "uncleared",
          approved: approved ?? true,
          ...(flag_color && { flag_color }),
          ...(import_id && { import_id }),
        },
      };

      const data = await ynabRequest<{ transaction: Transaction }>(
        `/plans/${pid}/transactions`,
        { method: "POST", body },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(enrichTransaction(data.transaction), null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // update_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_transaction",
    {
      title: "Update YNAB Transaction",
      description:
        "Updates an existing transaction. Only the fields you provide will be changed. " +
        "Amount should be in currency units (auto-converted to milliunits).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        transaction_id: z.string().describe("The transaction ID to update."),
        account_id: z.string().optional().describe("New account ID."),
        date: z.string().optional().describe("New date (ISO format)."),
        amount: z
          .number()
          .optional()
          .describe("New amount in currency units (auto-converted to milliunits)."),
        payee_name: z.string().optional().describe("New payee name."),
        payee_id: z.string().optional().describe("New payee ID."),
        category_id: z.string().optional().describe("New category ID."),
        memo: z.string().optional().describe("New memo."),
        cleared: z
          .enum(["cleared", "uncleared", "reconciled"])
          .optional()
          .describe("New cleared status."),
        approved: z.boolean().optional().describe("New approval status."),
        flag_color: z
          .enum(["red", "orange", "yellow", "green", "blue", "purple"])
          .optional()
          .describe("New flag color."),
      }),
    },
    async ({
      plan_id,
      transaction_id,
      account_id,
      date,
      amount,
      payee_name,
      payee_id,
      category_id,
      memo,
      cleared,
      approved,
      flag_color,
    }) => {
      const pid = resolvePlanId(plan_id);

      const transaction: Record<string, unknown> = {};
      if (account_id !== undefined) transaction.account_id = account_id;
      if (date !== undefined) transaction.date = date;
      if (amount !== undefined) transaction.amount = toMilliunits(amount);
      if (payee_name !== undefined) transaction.payee_name = payee_name;
      if (payee_id !== undefined) transaction.payee_id = payee_id;
      if (category_id !== undefined) transaction.category_id = category_id;
      if (memo !== undefined) transaction.memo = memo;
      if (cleared !== undefined) transaction.cleared = cleared;
      if (approved !== undefined) transaction.approved = approved;
      if (flag_color !== undefined) transaction.flag_color = flag_color;

      const data = await ynabRequest<{ transaction: Transaction }>(
        `/plans/${pid}/transactions/${transaction_id}`,
        { method: "PUT", body: { transaction } },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(enrichTransaction(data.transaction), null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // delete_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "delete_transaction",
    {
      title: "Delete YNAB Transaction",
      description: "Deletes an existing transaction by ID.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        transaction_id: z.string().describe("The transaction ID to delete."),
      }),
    },
    async ({ plan_id, transaction_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ transaction: Transaction }>(
        `/plans/${pid}/transactions/${transaction_id}`,
        { method: "DELETE" },
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(enrichTransaction(data.transaction), null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // find_transactions
  // -----------------------------------------------------------------------
  server.registerTool(
    "find_transactions",
    {
      title: "Find Transactions",
      description:
        "Search transactions by combining filters: payee name (partial match), " +
        "category name (partial match), amount range, date range, memo text, " +
        "and cleared/approved status. All filters are optional and combined with AND logic.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        since_date: z
          .string()
          .optional()
          .describe("Start date (ISO format)."),
        until_date: z
          .string()
          .optional()
          .describe("End date (ISO format)."),
        payee_name: z
          .string()
          .optional()
          .describe("Partial payee name match (case-insensitive)."),
        category_name: z
          .string()
          .optional()
          .describe("Partial category name match (case-insensitive)."),
        memo: z
          .string()
          .optional()
          .describe("Partial memo text match (case-insensitive)."),
        min_amount: z
          .number()
          .optional()
          .describe(
            "Minimum amount in currency units (e.g. -100 to find expenses of $100+).",
          ),
        max_amount: z
          .number()
          .optional()
          .describe("Maximum amount in currency units."),
        cleared: z
          .enum(["cleared", "uncleared", "reconciled"])
          .optional()
          .describe("Filter by cleared status."),
        approved: z
          .boolean()
          .optional()
          .describe("Filter by approval status."),
        max_results: z
          .number()
          .int()
          .optional()
          .describe("Maximum number of results to return (default: 50)."),
      }),
    },
    async ({
      plan_id,
      since_date,
      until_date,
      payee_name,
      category_name,
      memo,
      min_amount,
      max_amount,
      cleared,
      approved,
      max_results,
    }) => {
      const pid = resolvePlanId(plan_id);
      const limit = max_results ?? 50;

      const data = await ynabRequest<{ transactions: Transaction[] }>(
        `/plans/${pid}/transactions`,
        { params: { since_date } },
      );

      let results = data.transactions;

      if (until_date) {
        results = results.filter((t) => t.date <= until_date);
      }
      if (payee_name) {
        const search = payee_name.toLowerCase();
        results = results.filter((t) =>
          t.payee_name?.toLowerCase().includes(search),
        );
      }
      if (category_name) {
        const search = category_name.toLowerCase();
        results = results.filter((t) =>
          t.category_name?.toLowerCase().includes(search),
        );
      }
      if (memo) {
        const search = memo.toLowerCase();
        results = results.filter((t) =>
          t.memo?.toLowerCase().includes(search),
        );
      }
      if (min_amount !== undefined) {
        const minMilli = toMilliunits(min_amount);
        results = results.filter((t) => t.amount >= minMilli);
      }
      if (max_amount !== undefined) {
        const maxMilli = toMilliunits(max_amount);
        results = results.filter((t) => t.amount <= maxMilli);
      }
      if (cleared) {
        results = results.filter((t) => t.cleared === cleared);
      }
      if (approved !== undefined) {
        results = results.filter((t) => t.approved === approved);
      }

      const total = results.length;
      const truncated = results.slice(0, limit);

      const formatted = truncated.map((t) => ({
        id: t.id,
        date: t.date,
        amount: formatCurrency(t.amount),
        payee: t.payee_name,
        category: t.category_name,
        account: t.account_name,
        memo: t.memo,
        cleared: t.cleared,
        approved: t.approved,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_matches: total,
                showing: formatted.length,
                transactions: formatted,
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
