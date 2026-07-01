# Slim Toolset Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the YNAB MCP server from 50 tools / 12 files to 10 tools / 3 files, plus a read-only escape hatch, per `docs/superpowers/specs/2026-07-01-slim-toolset-design.md`.

**Architecture:** Extract `buildServer()` into `src/server.ts` so tests can instantiate the server without starting a transport. Rebuild the tool layer as three files (`transactions.ts`, `insights.ts`, `api.ts`) that mostly move existing handler code verbatim. Delete the other nine tool files. Tests use the MCP SDK's `InMemoryTransport` + `Client` against the compiled `dist/`.

**Tech Stack:** TypeScript (ESM, `tsc`), `@modelcontextprotocol/sdk` 1.29, zod 3, node built-in test runner (`node --test`). No new dependencies.

## Global Constraints

- No new npm dependencies (dev or runtime).
- Kept tools keep their exact current names and input schemas.
- YNAB API paths in this codebase use `/plans/...` (not `/budgets/...`) and `/user`.
- All source is ESM with `.js` import specifiers (compiled by `tsc` to `dist/`).
- `src/index.ts` transport/auth logic must not change except the import of `buildServer`.
- Commit messages: conventional commits, English.

---

### Task 1: Extract buildServer to src/server.ts + test harness

**Files:**
- Create: `src/server.ts`
- Modify: `src/index.ts` (remove buildServer + 12 tool imports; import from `./server.js`)
- Create: `tests/helpers.mjs`, `tests/toolset.test.mjs`
- Modify: `package.json` (test script)

**Interfaces:**
- Produces: `buildServer(): McpServer` exported from `src/server.ts` (compiled: `dist/server.js`). Every later task registers tools through it.
- Produces: `connectedClient()` in `tests/helpers.mjs` returning `{ client, server }` with an initialized MCP client.

- [ ] **Step 1: Create `src/server.ts`** — move the `buildServer()` function and the 12 `registerXxxTools` imports out of `src/index.ts` verbatim (currently `src/index.ts` lines 24–58: the import block of `./tools/*.js` plus the whole `buildServer` function). Add `export` to the function. Nothing else in the file.

- [ ] **Step 2: Update `src/index.ts`** — delete the moved block and add:

```ts
import { buildServer } from "./server.js";
```

- [ ] **Step 3: Write the test harness and a failing smoke test**

`tests/helpers.mjs`:
```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../dist/server.js";

export async function connectedClient() {
  const server = buildServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}
```

`tests/toolset.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectedClient } from "./helpers.mjs";

test("buildServer exposes tools over MCP", async () => {
  const { client, server } = await connectedClient();
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "create_transaction"));
  await client.close();
  await server.close();
});
```

`package.json` scripts:
```json
"test": "npm run build && node --test tests/"
```

- [ ] **Step 4: Run `npm test` — expect FAIL** before `src/server.ts` compiles (or PASS once Steps 1–2 are done; the failing state is Step 3 run before Steps 1–2 if following strict TDD order — either order is acceptable here since the move is mechanical, but the test must pass at the end).

- [ ] **Step 5: Run `npm test` — expect PASS** (1 test). Also run `printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}\n' | YNAB_ACCESS_TOKEN=dummy node dist/index.js | head -c 120` — expect a serverInfo response (stdio still works).

- [ ] **Step 6: Commit** — `refactor: extract buildServer to server.ts, add MCP test harness`

---

### Task 2: Slim tools/transactions.ts (4 tools)

**Files:**
- Modify: `src/tools/transactions.ts`
- Test: `tests/toolset.test.mjs` (no change yet — exact-set assertion lands in Task 4)

**Interfaces:**
- Produces: `registerTransactionTools(server)` registering exactly `create_transaction`, `update_transaction`, `delete_transaction`, `find_transactions`.

- [ ] **Step 1: Rewrite `src/tools/transactions.ts`** keeping (verbatim from the current file): the `Transaction` interface and `enrichTransaction` (lines 10–30), `create_transaction` (lines 284–397), `update_transaction` (lines 402–478), `delete_transaction` (lines 483–511). Delete `list_transactions`, `get_transaction`, the three `list_transactions_by_*`, `import_transactions`, `update_transactions`. Then move `find_transactions` in verbatim from `src/tools/composite.ts` lines 440–589 (it needs `toMilliunits`, already imported).

- [ ] **Step 2: Run `npm test` — expect PASS** (`create_transaction` still registered; composite still registers `find_transactions` too — duplicate registration would throw on the second `registerTool`, so ALSO delete `find_transactions` from `composite.ts` in this task, same commit).

- [ ] **Step 3: Commit** — `refactor: slim transactions tools to create/update/delete/find`

---

### Task 3: Create tools/insights.ts and tools/api.ts

**Files:**
- Create: `src/tools/insights.ts`
- Create: `src/tools/api.ts`
- Modify: `src/server.ts` (swap registrations)
- Test: `tests/ynab-get.test.mjs`

**Interfaces:**
- Produces: `registerInsightTools(server)` → `get_budget_summary`, `get_account_balances`, `get_spending_by_category`, `get_spending_by_payee`.
- Produces: `registerApiTools(server)` → `list_categories`, `ynab_get`; exports pure `isAllowedYnabPath(path: string): boolean`.

- [ ] **Step 1: Create `src/tools/insights.ts`** — move verbatim from `src/tools/composite.ts`: the `Account`, `Category`, `CategoryGroup`, `MonthDetail`, `Transaction` interfaces (lines 14–69), `get_budget_summary` (79–158), `get_spending_by_category` (163–264), `get_account_balances` (269–322), `get_spending_by_payee` (594–678). Export as `registerInsightTools`. **One functional change:** in `get_account_balances`, the `fmt` helper must include the account id:

```ts
const fmt = (accts: Account[]) =>
  accts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    balance: formatCurrency(a.balance),
  }));
```

- [ ] **Step 2: Write failing test for ynab_get path validation**

`tests/ynab-get.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedYnabPath } from "../dist/tools/api.js";

test("accepts plan and user paths", () => {
  assert.equal(isAllowedYnabPath("/plans/last-used/months"), true);
  assert.equal(isAllowedYnabPath("/plans"), true);
  assert.equal(isAllowedYnabPath("/budgets/last-used/payees"), true);
  assert.equal(isAllowedYnabPath("/user"), true);
});

test("rejects everything else", () => {
  assert.equal(isAllowedYnabPath("plans/last-used"), false); // no leading slash
  assert.equal(isAllowedYnabPath("/plansx"), false);
  assert.equal(isAllowedYnabPath("/plans/../secrets"), false);
  assert.equal(isAllowedYnabPath("https://evil.example/x"), false);
  assert.equal(isAllowedYnabPath(""), false);
});
```

- [ ] **Step 3: Run `npm test` — expect FAIL** (`Cannot find module .../dist/tools/api.js`).

- [ ] **Step 4: Create `src/tools/api.ts`** — move `list_categories` verbatim from `src/tools/categories.ts` (the `Category`/`CategoryGroup` interfaces, `enrichCategory`, `enrichGroups`, and the `list_categories` registration, lines 5–89), then add:

```ts
export function isAllowedYnabPath(path: string): boolean {
  return (
    /^\/(plans|budgets|user)(\/|$)/.test(path) && !path.includes("..")
  );
}
```

and the escape-hatch tool inside `registerApiTools`:

```ts
server.registerTool(
  "ynab_get",
  {
    title: "Raw YNAB API GET",
    description:
      "Read-only escape hatch: performs a GET against any YNAB API v1 " +
      "endpoint and returns the raw JSON. Use for anything the dedicated " +
      "tools don't cover (months, payees, scheduled transactions, payee " +
      "locations, delta requests...). Path must start with /plans, /budgets " +
      "or /user. See https://api.ynab.com/v1 for endpoints.",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          'API path, e.g. "/plans/last-used/months/current" or ' +
            '"/plans/last-used/payees".',
        ),
      params: z
        .record(z.string())
        .optional()
        .describe("Optional query parameters."),
    }),
  },
  async ({ path, params }) => {
    if (!isAllowedYnabPath(path)) {
      return {
        content: [
          {
            type: "text",
            text: "Error: path must start with /plans, /budgets or /user.",
          },
        ],
        isError: true,
      };
    }
    const data = await ynabRequest<unknown>(path, { params });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
);
```

(`ynabRequest` defaults to GET; do not pass `method`, so writes are impossible.)

- [ ] **Step 5: Update `src/server.ts`** to exactly:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerInsightTools } from "./tools/insights.js";
import { registerApiTools } from "./tools/api.js";

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "ynab-mcp-server",
    version: "0.4.0",
  });
  registerTransactionTools(server);
  registerInsightTools(server);
  registerApiTools(server);
  return server;
}
```

- [ ] **Step 6: Run `npm test` — expect PASS** (build may flag unused files not yet deleted; deletion is Task 4).

- [ ] **Step 7: Commit** — `feat: add insights and api tool modules with ynab_get escape hatch`

---

### Task 4: Delete dead files, prune ynab-client, assert exact tool set

**Files:**
- Delete: `src/tools/{user,plans,accounts,categories,months,payees,payee-locations,scheduled-transactions,money-movements,composite,utility}.ts` (11 files)
- Modify: `src/ynab-client.ts`
- Modify: `tests/toolset.test.mjs`

**Interfaces:**
- Consumes: `buildServer()` from Task 3 (3 registrars only — nothing imports the deleted files anymore).

- [ ] **Step 1: Tighten the toolset test** — replace the smoke test body in `tests/toolset.test.mjs`:

```js
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
```

- [ ] **Step 2: Run `npm test` — expect FAIL** (extra tools still registered? No — server.ts already dropped them in Task 3, but the dead files still compile. If it passes, fine; the assertion is the deliverable).

- [ ] **Step 3: Delete the 11 dead tool files** (`git rm`). Grep before pruning the client: `grep -rn "getRateLimitInfo\|withErrorHandling\|fromMilliunits" src/` — delete from `src/ynab-client.ts` whatever now has no callers outside `ynab-client.ts` itself (expected: the whole rate-limit section incl. the `x-rate-limit` header read stays — it's inside `ynabRequest` — but `getRateLimitInfo` and `withErrorHandling` go; `fromMilliunits` stays, `formatCurrency` uses it).

- [ ] **Step 4: Run `npm test` — expect PASS** (3 tests: exact set, 2× ynab_get validation). Run `rm -rf dist && npm run build` — expect clean compile, and `ls dist/tools` shows only `transactions.js insights.js api.js` (+ maps/d.ts).

- [ ] **Step 5: Commit** — `refactor!: remove 40 non-core tools (50 -> 10)` with body noting removed groups and the `ynab_get` replacement for reads.

---

### Task 5: Version 0.4.0, README, CI paths-ignore, ship

**Files:**
- Modify: `package.json` (`"version": "0.4.0"`)
- Modify: `README.md` (replace the "All 48 Tools" section with a 10-tool table incl. `ynab_get`; update feature list)
- Modify: `.github/workflows/deploy.yml`

**Interfaces:** none new.

- [ ] **Step 1: Bump versions** — `package.json` to `0.4.0` (server.ts already says 0.4.0 from Task 3).

- [ ] **Step 2: Rewrite README tool section** — one table, 10 rows, grouped Write / Read / Escape hatch; keep Key Concepts; delete the sections describing removed tools; note in Features that rare reads go through `ynab_get`.

- [ ] **Step 3: Add paths-ignore to the workflow** so docs-only commits don't redeploy — under `on.push`:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - "docs/**"
      - "README.md"
  workflow_dispatch:
```

- [ ] **Step 4: Full local verification** — `rm -rf node_modules dist && npm ci && npm test` → PASS. HTTP smoke: `MCP_TRANSPORT=http MCP_AUTH_TOKEN=$(openssl rand -hex 32) YNAB_ACCESS_TOKEN=dummy PORT=8935 node dist/index.js &`, then tools/list via curl with the token → exactly 10 tools; kill it.

- [ ] **Step 5: Commit + push** — `chore: release 0.4.0 — slim toolset` (push includes the spec/plan doc commits). CI builds, deploys, smoke-tests.

- [ ] **Step 6: Verify prod** — `tools/list` via `?key=` against the Cloud Run URL returns the 10 tools and `serverInfo.version` is `0.4.0`. Call `ynab_get {"path": "/plans/last-used/months/current"}` → month JSON (real read via escape hatch). Reconnect the claude.ai connector so it refreshes the tool list.
