import { test } from "node:test";
import assert from "node:assert/strict";
import { connectedClient } from "./helpers.mjs";

const EXPECTED = [
  "create_transaction",
  "delete_transaction",
  "find_transactions",
  "get_account_balances",
  "get_budget_summary",
  "get_spending_by_category",
  "get_spending_by_payee",
  "list_categories",
  "update_transaction",
  "ynab_get",
];

test("exposes exactly the 10 core tools", async () => {
  const { client, server } = await connectedClient();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED);
  await client.close();
  await server.close();
});
