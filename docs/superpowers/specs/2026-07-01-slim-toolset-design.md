# Slim toolset refactor — design

**Date:** 2026-07-01 · **Target version:** 0.4.0 · **Status:** approved

## Problem

The server exposes 50 tools across 12 files (~3,100 lines). Every Claude
conversation loads all 50 definitions into context, degrading tool selection
and wasting tokens. Actual usage (the `ynab-edd` skill) covers ~10 of them:
registering expenses, querying transactions, balances, budget summary,
spending breakdowns.

## Goals

1. Fewer tools in Claude's context: 50 → 10.
2. Less code to maintain: ~3,100 → ~900 lines, 12 tool files → 3.
3. No capability cliff: rare read-only queries stay possible via one generic
   escape-hatch tool instead of 40 dedicated definitions.

Non-goals: runtime/image optimization (already light), changing transports or
auth (untouched), multi-budget support (plan_id defaults stay).

## Final tool set (10)

Kept tools keep their current names and schemas so the `ynab-edd` skill and
existing prompts keep working.

**Write (explicit tools only — the escape hatch cannot write):**
- `create_transaction`
- `update_transaction`
- `delete_transaction`

**Read:**
- `find_transactions` — multi-filter search; absorbs `list_transactions` and
  the 4 `list_transactions_by_*` variants
- `get_budget_summary`
- `get_account_balances` — must include account ids in output so
  `create_transaction` can reference them (verify during implementation;
  add ids if missing)
- `get_spending_by_category`
- `get_spending_by_payee`
- `list_categories` — needed for category ids when categorizing

**Escape hatch:**
- `ynab_get(path, params?)` — raw GET against the YNAB API
  (`https://api.ynab.com/v1`). Validation: path must start with `/plans`,
  `/budgets` or `/user` (this codebase uses the `/plans` alias); only GET;
  returns the raw JSON `data` payload. Covers months,
  payees, scheduled transactions, payee locations, money movements, delta
  requests — everything deleted below.

**Deleted (40):** all of plans, months, payees, payee-locations,
scheduled-transactions, money-movements, utility, user; accounts except the
balance composite; categories except `list_categories`; `update_transactions`
(bulk), `import_transactions`, `move_money`, and the 5 transaction list
variants. Recoverable from git history if ever needed.

## Code structure

```
src/
  index.ts          # transports + auth — UNCHANGED
  ynab-client.ts    # prune helpers orphaned by the deletion
  tools/
    transactions.ts # create / update / delete / find
    insights.ts     # budget summary, balances, spending by category/payee
    api.ts          # list_categories + ynab_get
```

`buildServer()` in index.ts drops from 12 register calls to 3. Existing
implementations are moved, not rewritten — kept tools' behavior is identical.

## Tests

Repo currently has none. Add a minimal suite (`npm test`, node built-in
runner or plain script, no new deps):

1. `buildServer()` exposes exactly the 10 expected tool names.
2. `ynab_get` path validation: rejects non-`/budgets`//`/user` paths and
   anything attempting traversal; accepts valid paths.
3. No YNAB API mocking beyond what (2) needs — keep it cheap.

## Versioning & rollout

- Bump to **0.4.0** (breaking: 40 tools removed).
- Update README tool tables and the `serverInfo` version.
- Push to main → existing CI builds, pushes to Docker Hub, deploys to Cloud
  Run by digest, smoke-tests. claude.ai picks up the new tool set on
  reconnect of the connector.
- If a removed tool turns out to be needed: first try `ynab_get`; if it's a
  write, restore the tool from git history as a deliberate decision.
