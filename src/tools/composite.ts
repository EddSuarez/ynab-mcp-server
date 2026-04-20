import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ynabRequest,
  resolvePlanId,
  formatCurrency,
  toMilliunits,
} from "../ynab-client.js";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface Account {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  balance: number;
  cleared_balance: number;
  uncleared_balance: number;
  [key: string]: unknown;
}

interface Category {
  id: string;
  name: string;
  category_group_id: string;
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

interface MonthDetail {
  month: string;
  income: number;
  budgeted: number;
  activity: number;
  to_be_budgeted: number;
  age_of_money: number | null;
  categories: Category[];
  [key: string]: unknown;
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string;
  account_name: string;
  memo: string | null;
  cleared: string;
  approved: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCompositeTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // get_budget_summary
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_budget_summary",
    {
      title: "Get Budget Summary",
      description:
        "Returns a high-level overview of your budget: all account balances, " +
        "current month summary (Ready to Assign, income, spending, Age of Money), " +
        "and top underfunded categories. A great starting point for understanding " +
        "your financial position.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
      }),
    },
    async ({ plan_id }) => {
      const pid = resolvePlanId(plan_id);

      // Fetch accounts and current month in parallel
      const [accountsData, monthData] = await Promise.all([
        ynabRequest<{ accounts: Account[] }>(`/plans/${pid}/accounts`),
        ynabRequest<{ month: MonthDetail }>(`/plans/${pid}/months/current`),
      ]);

      const openAccounts = accountsData.accounts.filter((a) => !a.closed);
      const budgetAccounts = openAccounts.filter((a) => a.on_budget);
      const trackingAccounts = openAccounts.filter((a) => !a.on_budget);

      const totalBudgetBalance = budgetAccounts.reduce(
        (sum, a) => sum + a.balance,
        0,
      );
      const totalTrackingBalance = trackingAccounts.reduce(
        (sum, a) => sum + a.balance,
        0,
      );

      // Find categories with negative available balance (underfunded)
      const underfunded = monthData.month.categories
        .filter((c) => c.balance < 0)
        .sort((a, b) => a.balance - b.balance)
        .slice(0, 10)
        .map((c) => ({
          name: c.name,
          available: formatCurrency(c.balance),
          budgeted: formatCurrency(c.budgeted),
          activity: formatCurrency(c.activity),
        }));

      const summary = {
        current_month: monthData.month.month,
        ready_to_assign: formatCurrency(monthData.month.to_be_budgeted),
        income: formatCurrency(monthData.month.income),
        budgeted: formatCurrency(monthData.month.budgeted),
        spending: formatCurrency(monthData.month.activity),
        age_of_money: monthData.month.age_of_money,
        budget_accounts: budgetAccounts.map((a) => ({
          name: a.name,
          type: a.type,
          balance: formatCurrency(a.balance),
          cleared: formatCurrency(a.cleared_balance),
          uncleared: formatCurrency(a.uncleared_balance),
        })),
        total_budget_balance: formatCurrency(totalBudgetBalance),
        tracking_accounts: trackingAccounts.map((a) => ({
          name: a.name,
          type: a.type,
          balance: formatCurrency(a.balance),
        })),
        total_tracking_balance: formatCurrency(totalTrackingBalance),
        total_net_worth: formatCurrency(totalBudgetBalance + totalTrackingBalance),
        underfunded_categories: underfunded,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_spending_by_category
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_spending_by_category",
    {
      title: "Get Spending by Category",
      description:
        "Aggregates transaction amounts by category for a given date range. " +
        "Returns a breakdown of spending per category, sorted by largest expense. " +
        "Useful for analyzing where money is going.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        since_date: z
          .string()
          .describe(
            "Start date for the analysis (ISO format, e.g. 2025-01-01).",
          ),
        until_date: z
          .string()
          .optional()
          .describe(
            "End date (inclusive). If omitted, includes all transactions from since_date onward.",
          ),
      }),
    },
    async ({ plan_id, since_date, until_date }) => {
      const pid = resolvePlanId(plan_id);

      const data = await ynabRequest<{
        transactions: Transaction[];
      }>(`/plans/${pid}/transactions`, {
        params: { since_date },
      });

      // Filter by end date if provided
      let transactions = data.transactions;
      if (until_date) {
        transactions = transactions.filter((t) => t.date <= until_date);
      }

      // Group by category
      const byCategory = new Map<
        string,
        { name: string; total: number; count: number }
      >();

      for (const tx of transactions) {
        const key = tx.category_name ?? "(Uncategorized)";
        const existing = byCategory.get(key);
        if (existing) {
          existing.total += tx.amount;
          existing.count += 1;
        } else {
          byCategory.set(key, { name: key, total: tx.amount, count: 1 });
        }
      }

      // Separate income from expenses and sort
      const entries = Array.from(byCategory.values());
      const expenses = entries
        .filter((e) => e.total < 0)
        .sort((a, b) => a.total - b.total)
        .map((e) => ({
          category: e.name,
          total: formatCurrency(e.total),
          transaction_count: e.count,
        }));

      const income = entries
        .filter((e) => e.total > 0)
        .sort((a, b) => b.total - a.total)
        .map((e) => ({
          category: e.name,
          total: formatCurrency(e.total),
          transaction_count: e.count,
        }));

      const totalSpending = expenses.reduce(
        (sum, e) => sum + (byCategory.get(e.category)?.total ?? 0),
        0,
      );
      const totalIncome = income.reduce(
        (sum, e) => sum + (byCategory.get(e.category)?.total ?? 0),
        0,
      );

      const result = {
        period: { from: since_date, to: until_date ?? "present" },
        total_transactions: transactions.length,
        total_spending: formatCurrency(totalSpending),
        total_income: formatCurrency(totalIncome),
        net: formatCurrency(totalIncome + totalSpending),
        spending_by_category: expenses,
        income_by_category: income,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // get_account_balances
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_account_balances",
    {
      title: "Get Account Balances",
      description:
        "Returns a clean summary of all open account names, types, and balances. " +
        "Includes totals for budget accounts, tracking accounts, and net worth.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
      }),
    },
    async ({ plan_id }) => {
      const pid = resolvePlanId(plan_id);
      const data = await ynabRequest<{ accounts: Account[] }>(
        `/plans/${pid}/accounts`,
      );

      const open = data.accounts.filter((a) => !a.closed);
      const budget = open.filter((a) => a.on_budget);
      const tracking = open.filter((a) => !a.on_budget);

      const budgetTotal = budget.reduce((s, a) => s + a.balance, 0);
      const trackingTotal = tracking.reduce((s, a) => s + a.balance, 0);

      const fmt = (accts: Account[]) =>
        accts.map((a) => ({
          name: a.name,
          type: a.type,
          balance: formatCurrency(a.balance),
        }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                budget_accounts: fmt(budget),
                budget_total: formatCurrency(budgetTotal),
                tracking_accounts: fmt(tracking),
                tracking_total: formatCurrency(trackingTotal),
                net_worth: formatCurrency(budgetTotal + trackingTotal),
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
  // move_money
  // -----------------------------------------------------------------------
  server.registerTool(
    "move_money",
    {
      title: "Move Money Between Categories",
      description:
        "Moves money from one category to another in a specific month by adjusting " +
        "the assigned (budgeted) amounts on both categories. This is the equivalent " +
        "of dragging money between categories in the YNAB app. " +
        "Fetches current budgeted amounts, subtracts from the source and adds to the target.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        month: z
          .string()
          .describe(
            'The month to move money in (ISO format e.g. "2025-04-01" or "current").',
          ),
        from_category_id: z
          .string()
          .describe("The category ID to take money from."),
        to_category_id: z
          .string()
          .describe("The category ID to move money to."),
        amount: z
          .number()
          .describe(
            "The amount to move in currency units (e.g. 50.00). " +
            "Must be positive.",
          ),
      }),
    },
    async ({ plan_id, month, from_category_id, to_category_id, amount }) => {
      const pid = resolvePlanId(plan_id);

      if (amount <= 0) {
        return {
          content: [
            {
              type: "text",
              text: "Error: amount must be positive. Specify how much to move.",
            },
          ],
          isError: true,
        };
      }

      const milliunits = toMilliunits(amount);

      // Fetch current budgeted amounts for both categories
      const [fromData, toData] = await Promise.all([
        ynabRequest<{ category: Category }>(
          `/plans/${pid}/months/${month}/categories/${from_category_id}`,
        ),
        ynabRequest<{ category: Category }>(
          `/plans/${pid}/months/${month}/categories/${to_category_id}`,
        ),
      ]);

      const fromBudgeted = fromData.category.budgeted;
      const toBudgeted = toData.category.budgeted;

      // Update both categories
      const [updatedFrom, updatedTo] = await Promise.all([
        ynabRequest<{ category: Category }>(
          `/plans/${pid}/months/${month}/categories/${from_category_id}`,
          {
            method: "PATCH",
            body: { category: { budgeted: fromBudgeted - milliunits } },
          },
        ),
        ynabRequest<{ category: Category }>(
          `/plans/${pid}/months/${month}/categories/${to_category_id}`,
          {
            method: "PATCH",
            body: { category: { budgeted: toBudgeted + milliunits } },
          },
        ),
      ]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                moved: formatCurrency(milliunits),
                from: {
                  name: updatedFrom.category.name,
                  previous_budgeted: formatCurrency(fromBudgeted),
                  new_budgeted: formatCurrency(updatedFrom.category.budgeted),
                  available: formatCurrency(updatedFrom.category.balance),
                },
                to: {
                  name: updatedTo.category.name,
                  previous_budgeted: formatCurrency(toBudgeted),
                  new_budgeted: formatCurrency(updatedTo.category.budgeted),
                  available: formatCurrency(updatedTo.category.balance),
                },
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

  // -----------------------------------------------------------------------
  // get_spending_by_payee
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_spending_by_payee",
    {
      title: "Get Spending by Payee",
      description:
        "Aggregates transaction amounts by payee for a given date range. " +
        "Returns a breakdown of spending per payee, sorted by largest expense. " +
        "Useful for seeing which merchants or vendors you spend the most at.",
      inputSchema: z.object({
        plan_id: z
          .string()
          .optional()
          .describe('The plan ID. Defaults to "last-used".'),
        since_date: z
          .string()
          .describe("Start date (ISO format, e.g. 2025-01-01)."),
        until_date: z
          .string()
          .optional()
          .describe("End date (inclusive). Omit to include everything from since_date onward."),
      }),
    },
    async ({ plan_id, since_date, until_date }) => {
      const pid = resolvePlanId(plan_id);

      const data = await ynabRequest<{ transactions: Transaction[] }>(
        `/plans/${pid}/transactions`,
        { params: { since_date } },
      );

      let transactions = data.transactions;
      if (until_date) {
        transactions = transactions.filter((t) => t.date <= until_date);
      }

      // Only expenses (negative amounts), exclude transfers
      const expenses = transactions.filter(
        (t) => t.amount < 0 && !t.payee_name?.startsWith("Transfer :"),
      );

      const byPayee = new Map<
        string,
        { name: string; total: number; count: number }
      >();

      for (const tx of expenses) {
        const key = tx.payee_name ?? "(No Payee)";
        const existing = byPayee.get(key);
        if (existing) {
          existing.total += tx.amount;
          existing.count += 1;
        } else {
          byPayee.set(key, { name: key, total: tx.amount, count: 1 });
        }
      }

      const sorted = Array.from(byPayee.values())
        .sort((a, b) => a.total - b.total)
        .map((e) => ({
          payee: e.name,
          total: formatCurrency(e.total),
          transaction_count: e.count,
        }));

      const totalSpending = expenses.reduce((sum, t) => sum + t.amount, 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                period: { from: since_date, to: until_date ?? "present" },
                total_spending: formatCurrency(totalSpending),
                unique_payees: sorted.length,
                spending_by_payee: sorted,
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
