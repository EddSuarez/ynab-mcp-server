# YNAB MCP Server

An MCP (Model Context Protocol) server that wraps the [YNAB API](https://api.ynab.com), letting AI assistants read and manage your budget through natural language.

## Features

A deliberately small tool set (10 tools) focused on day-to-day budget use:
registering expenses, querying transactions, balances, and spending
breakdowns. Anything else in the YNAB API stays reachable through the
read-only `ynab_get` escape hatch, without bloating the tool list Claude
loads into context.

All currency amounts are automatically converted between human-readable format and YNAB's milliunit format.

## Setup

### 1. Get a YNAB Access Token

1. Sign in to [YNAB](https://app.ynab.com)
2. Go to **My Account → Developer Settings**
3. Click **New Token** and save it securely

### 2. Install & Build

**Option A — local:**
```bash
npm install
npm run build
```

**Option B — Docker:**
```bash
docker build -t ynab-mcp-server .
```

### 3. Configure

Set the `YNAB_ACCESS_TOKEN` environment variable:

```bash
export YNAB_ACCESS_TOKEN="your-token-here"
```

### 4. Use with Claude Desktop

**Local:**
```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

**Docker:**
```json
{
  "mcpServers": {
    "ynab": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "-e", "YNAB_ACCESS_TOKEN=your-token-here", "ynab-mcp-server"],
      "env": {}
    }
  }
}
```

### 5. Use with Claude Code

**Local:**
```bash
claude mcp add ynab node /path/to/ynab-mcp-server/dist/index.js -e YNAB_ACCESS_TOKEN=your-token-here
```

**Docker:**
```bash
claude mcp add ynab docker -- run --rm -i -e YNAB_ACCESS_TOKEN=your-token-here ynab-mcp-server
```

## Remote HTTP mode (claude.ai connector / Cloud Run)

By default the server speaks stdio. Set `MCP_TRANSPORT=http` to expose it as a remote MCP connector over Streamable HTTP:

```bash
MCP_TRANSPORT=http \
MCP_AUTH_TOKEN=$(openssl rand -hex 32) \
YNAB_ACCESS_TOKEN=your-token-here \
node dist/index.js
```

- **Endpoint:** `POST /mcp` (stateless Streamable HTTP; a fresh server instance handles each request).
- **Port:** `PORT` env var, default `8080` (Cloud Run sets this automatically).
- **Auth:** every `/mcp` request must send `Authorization: Bearer $MCP_AUTH_TOKEN`. Requests without it get `401`. The process refuses to start (`exit 1`) if `MCP_AUTH_TOKEN` is unset or shorter than 32 characters.
- **Health check:** `GET /healthz` → `200 ok` (for Cloud Run probes).
- Other paths → `404`; non-POST methods on `/mcp` → `405`.

Smoke test:

```bash
curl -s http://localhost:8080/healthz                      # → ok
curl -s -X POST http://localhost:8080/mcp \
  -H "authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

In claude.ai, add it as a custom connector. The connector form only offers OAuth fields (no bearer header), so pass the token as a query parameter instead:

```
https://<your-service>/mcp?key=<MCP_AUTH_TOKEN>
```

Clients that can set headers (Claude Code, the Anthropic API) should prefer `Authorization: Bearer <token>`.

When `MCP_TRANSPORT` is unset, stdio behavior is unchanged — existing Claude Desktop configs keep working.

## The 10 Tools

### Write
| Tool | Description |
|---|---|
| `create_transaction` | Create an expense or income transaction |
| `update_transaction` | Update an existing transaction |
| `delete_transaction` | Delete a transaction |

### Read
| Tool | Description |
|---|---|
| `find_transactions` | Multi-filter search (payee, category, amount, memo, date, status) |
| `get_budget_summary` | Full overview: accounts, current month, underfunded categories |
| `get_account_balances` | All account ids, balances, and net worth |
| `get_spending_by_category` | Spending breakdown by category for a date range |
| `get_spending_by_payee` | Spending breakdown by payee/merchant |
| `list_categories` | All categories grouped, with monthly amounts |

### Escape hatch
| Tool | Description |
|---|---|
| `ynab_get` | Read-only GET against any YNAB API v1 endpoint (`/plans`, `/budgets`, `/user` paths). Covers months, payees, scheduled transactions, locations, delta requests — anything without a dedicated tool. Writes are not possible through it. |

## Key Concepts

- **Plan ID shortcuts:** Most tools default `plan_id` to `"last-used"`. You can also use `"default"`.
- **Amounts:** Pass in normal currency (e.g. `-25.50` for a $25.50 expense). Auto-converted to/from YNAB milliunits.
- **Delta requests:** Pass `last_knowledge_of_server` to only fetch changes, reducing API usage.
- **Rate limits:** YNAB allows 200 requests per hour per token.

## Project Structure

```
src/
  index.ts             # Entry point: stdio / HTTP transports + auth
  server.ts            # buildServer(): McpServer with the 3 tool modules
  ynab-client.ts       # API client (auth, HTTP, milliunits, errors)
  tools/
    transactions.ts    # create / update / delete / find
    insights.ts        # budget summary, balances, spending breakdowns
    api.ts             # list_categories + ynab_get escape hatch
tests/                 # node --test suite against dist/
```
