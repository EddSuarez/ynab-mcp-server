# YNAB MCP Server

An MCP (Model Context Protocol) server that wraps the [YNAB API](https://api.ynab.com), letting AI assistants read and manage your budget through natural language.

## Features

**Read operations:**
- List and inspect plans (budgets), accounts, categories, months
- Query transactions with filters (by date, account, category, payee)
- View monthly summaries (income, spending, Ready to Assign, Age of Money)
- Payee locations (GPS data from mobile app)
- Scheduled/recurring transactions
- Money movements and money movement groups

**Write operations:**
- Create, update, and delete transactions (single and bulk)
- Create accounts (checking, savings, cash, credit card)
- Create and update categories and category groups
- Assign money to categories for specific months
- Create, update, and delete scheduled transactions
- Import transactions from linked bank accounts

**Smart composite tools:**
- `get_budget_summary` — Full overview: accounts, current month, underfunded categories
- `get_spending_by_category` — Spending breakdown by category for a date range
- `get_spending_by_payee` — Spending breakdown by payee/merchant
- `get_account_balances` — Clean summary of all account balances and net worth
- `move_money` — Move money between categories in a single call
- `find_transactions` — Multi-filter search (payee, category, amount, memo, date, status)

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

## All 48 Tools

### User (1)
| Tool | Description |
|---|---|
| `get_user` | Get authenticated user info |

### Plans (3)
| Tool | Description |
|---|---|
| `list_plans` | List all plans/budgets |
| `get_plan` | Full plan export (with delta support) |
| `get_plan_settings` | Plan settings (currency, date format) |

### Accounts (3)
| Tool | Description |
|---|---|
| `list_accounts` | All accounts with balances |
| `get_account` | Single account details |
| `create_account` | Create a new account |

### Categories (8)
| Tool | Description |
|---|---|
| `list_categories` | All categories grouped, with monthly amounts |
| `get_category` | Single category with current month amounts |
| `get_month_category` | Category amounts for a specific month |
| `create_category` | Create a new category (with optional goal) |
| `update_category` | Update category name, goal target |
| `update_month_category` | Assign money to a category for a month |
| `create_category_group` | Create a new category group |
| `update_category_group` | Rename a category group |

### Transactions (10)
| Tool | Description |
|---|---|
| `list_transactions` | Transactions with date/type filters |
| `get_transaction` | Single transaction detail |
| `list_transactions_by_account` | Transactions for a specific account |
| `list_transactions_by_category` | Transactions for a specific category |
| `list_transactions_by_payee` | Transactions for a specific payee |
| `create_transaction` | Create an expense or income transaction |
| `update_transaction` | Update an existing transaction |
| `delete_transaction` | Delete a transaction |
| `update_transactions` | Bulk update multiple transactions |
| `import_transactions` | Trigger import on linked accounts |

### Months (2)
| Tool | Description |
|---|---|
| `list_months` | Monthly summaries |
| `get_month` | Single month detail with all categories |

### Payees (4)
| Tool | Description |
|---|---|
| `list_payees` | All payees |
| `get_payee` | Single payee details |
| `create_payee` | Create a new payee |
| `update_payee` | Rename a payee |

### Payee Locations (3)
| Tool | Description |
|---|---|
| `list_payee_locations` | All GPS locations |
| `get_payee_location` | Single payee location |
| `list_locations_for_payee` | Locations for a specific payee |

### Scheduled Transactions (5)
| Tool | Description |
|---|---|
| `list_scheduled_transactions` | All scheduled/recurring transactions |
| `get_scheduled_transaction` | Single scheduled transaction |
| `create_scheduled_transaction` | Create a new recurring transaction |
| `update_scheduled_transaction` | Update a scheduled transaction |
| `delete_scheduled_transaction` | Delete a scheduled transaction |

### Money Movements (3)
| Tool | Description |
|---|---|
| `list_money_movements` | All money movements |
| `list_money_movements_by_month` | Money movements for a month |
| `list_money_movement_groups` | Money movement groups |

### Smart Composite Tools (6)
| Tool | Description |
|---|---|
| `get_budget_summary` | Full budget overview in one call |
| `get_spending_by_category` | Spending breakdown by category |
| `get_spending_by_payee` | Spending breakdown by payee/merchant |
| `get_account_balances` | All balances + net worth |
| `move_money` | Move money between categories |
| `find_transactions` | Multi-filter transaction search |

## Key Concepts

- **Plan ID shortcuts:** Most tools default `plan_id` to `"last-used"`. You can also use `"default"`.
- **Amounts:** Pass in normal currency (e.g. `-25.50` for a $25.50 expense). Auto-converted to/from YNAB milliunits.
- **Delta requests:** Pass `last_knowledge_of_server` to only fetch changes, reducing API usage.
- **Rate limits:** YNAB allows 200 requests per hour per token.

## Project Structure

```
src/
  index.ts                      # Entry point
  ynab-client.ts                # API client (auth, HTTP, milliunits, errors)
  tools/
    user.ts                     # get_user
    plans.ts                    # list/get plans & settings
    accounts.ts                 # list/get/create accounts
    categories.ts               # CRUD categories & groups, month budgeting
    transactions.ts             # CRUD transactions, bulk update, import
    months.ts                   # list/get months
    payees.ts                   # CRUD payees
    payee-locations.ts          # list/get payee GPS locations
    scheduled-transactions.ts   # CRUD scheduled transactions
    money-movements.ts          # list money movements & groups
    composite.ts                # Smart tools (summary, search, move money)
```
