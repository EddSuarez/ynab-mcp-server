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
  // list_transactions
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_transactions",
    {
      title: "List YNAB Transactions",
      description:
        "Returns transactions for a plan. Supports filtering by date, " +
        "type (uncategorized, unapproved), and delta requests.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        since_date: z
          .string()
          .optional()
          .describe(
            "Only return transactions on or after this date (ISO format, e.g. 2025-01-01).",
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
    async ({ plan_id, since_date, type, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        transactions: Transaction[];
        server_knowledge: number;
      }>(`/plans/${pid}/transactions`, {
        params: { since_date, type, last_knowledge_of_server },
      });
      const enriched = data.transactions.map(enrichTransaction);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { transactions: enriched, server_knowledge: data.server_knowledge },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_transaction
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_transaction",
    {
      title: "Get YNAB Transaction",
      description: "Returns a single transaction by ID.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        transaction_id: z.string().describe("The transaction ID."),
      }),
    },
    async ({ plan_id, transaction_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ transaction: Transaction }>(
        `/plans/${pid}/transactions/${transaction_id}`,
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
  // list_transactions_by_account
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_transactions_by_account",
    {
      title: "List Transactions by Account",
      description:
        "Returns all transactions for a specific account.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        account_id: z.string().describe("The account ID."),
        since_date: z
          .string()
          .optional()
          .describe("Only return transactions on or after this date (ISO format)."),
        type: z
          .enum(["uncategorized", "unapproved"])
          .optional()
          .describe("Filter by transaction type."),
        last_knowledge_of_server: z
          .number()
          .int()
          .optional()
          .describe("Delta request cursor."),
      }),
    },
    async ({ plan_id, account_id, since_date, type, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        transactions: Transaction[];
        server_knowledge: number;
      }>(`/plans/${pid}/accounts/${account_id}/transactions`, {
        params: { since_date, type, last_knowledge_of_server },
      });
      const enriched = data.transactions.map(enrichTransaction);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { transactions: enriched, server_knowledge: data.server_knowledge },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // list_transactions_by_category
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_transactions_by_category",
    {
      title: "List Transactions by Category",
      description: "Returns all transactions for a specific category.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        category_id: z.string().describe("The category ID."),
        since_date: z
          .string()
          .optional()
          .describe("Only return transactions on or after this date (ISO format)."),
        type: z
          .enum(["uncategorized", "unapproved"])
          .optional()
          .describe("Filter by transaction type."),
        last_knowledge_of_server: z
          .number()
          .int()
          .optional()
          .describe("Delta request cursor."),
      }),
    },
    async ({ plan_id, category_id, since_date, type, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        transactions: Transaction[];
        server_knowledge: number;
      }>(`/plans/${pid}/categories/${category_id}/transactions`, {
        params: { since_date, type, last_knowledge_of_server },
      });
      const enriched = data.transactions.map(enrichTransaction);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { transactions: enriched, server_knowledge: data.server_knowledge },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // list_transactions_by_payee
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_transactions_by_payee",
    {
      title: "List Transactions by Payee",
      description: "Returns all transactions for a specific payee.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        payee_id: z.string().describe("The payee ID."),
        since_date: z
          .string()
          .optional()
          .describe("Only return transactions on or after this date (ISO format)."),
        type: z
          .enum(["uncategorized", "unapproved"])
          .optional()
          .describe("Filter by transaction type."),
        last_knowledge_of_server: z
          .number()
          .int()
          .optional()
          .describe("Delta request cursor."),
      }),
    },
    async ({ plan_id, payee_id, since_date, type, last_knowledge_of_server }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{
        transactions: Transaction[];
        server_knowledge: number;
      }>(`/plans/${pid}/payees/${payee_id}/transactions`, {
        params: { since_date, type, last_knowledge_of_server },
      });
      const enriched = data.transactions.map(enrichTransaction);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { transactions: enriched, server_knowledge: data.server_knowledge },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // create_transaction  (Phase 2 — write)
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
  // update_transaction  (Phase 2 — write)
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
  // delete_transaction  (Phase 2 — write)
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
  // import_transactions  (Phase 2 — write)
  // -----------------------------------------------------------------------
  server.registerTool(
    "import_transactions",
    {
      title: "Import YNAB Transactions",
      description:
        "Triggers an import of available transactions on all linked (Direct Import) " +
        'accounts. Equivalent to clicking "Import" in the YNAB app.',
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
      }),
    },
    async ({ plan_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ transaction_ids: string[] }>(
        `/plans/${pid}/transactions/import`,
        { method: "POST" },
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  // -----------------------------------------------------------------------
  // update_transactions  (Phase 3 — bulk write)
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_transactions",
    {
      title: "Bulk Update YNAB Transactions",
      description:
        "Updates multiple transactions at once. Each transaction in the array " +
        "must have either an 'id' or 'import_id' to identify it. " +
        "Amounts should be in currency units (auto-converted to milliunits).",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        transactions: z
          .array(
            z.object({
              id: z.string().optional().describe("Transaction ID."),
              import_id: z
                .string()
                .optional()
                .describe("Import ID (alternative identifier)."),
              account_id: z.string().optional(),
              date: z.string().optional(),
              amount: z
                .number()
                .optional()
                .describe("Amount in currency units."),
              payee_name: z.string().optional(),
              payee_id: z.string().optional(),
              category_id: z.string().optional(),
              memo: z.string().optional(),
              cleared: z
                .enum(["cleared", "uncleared", "reconciled"])
                .optional(),
              approved: z.boolean().optional(),
              flag_color: z
                .enum(["red", "orange", "yellow", "green", "blue", "purple"])
                .optional(),
            }),
          )
          .describe("Array of transactions to update."),
      }),
    },
    async ({ plan_id, transactions }) => {
      const pid = resolvePlanId(plan_id);

      const converted = transactions.map((tx) => {
        const out: Record<string, unknown> = { ...tx };
        if (tx.amount !== undefined) {
          out.amount = toMilliunits(tx.amount);
        }
        return out;
      });

      const data = await ynabRequest<{
        transactions: Transaction[];
        transaction_ids: string[];
      }>(`/plans/${pid}/transactions`, {
        method: "PATCH",
        body: { transactions: converted },
      });

      const enriched = data.transactions.map(enrichTransaction);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                transactions: enriched,
                transaction_ids: data.transaction_ids,
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