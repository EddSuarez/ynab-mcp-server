/**
 * YNAB API Client
 *
 * Handles authentication, HTTP requests, milliunit conversion,
 * error mapping, and rate-limit tracking for the YNAB public API.
 */

const BASE_URL = "https://api.ynab.com/v1";

// ---------------------------------------------------------------------------
// Milliunit helpers
// ---------------------------------------------------------------------------

/** Convert a human-readable currency amount to YNAB milliunits. */
export function toMilliunits(amount: number): number {
  return Math.round(amount * 1000);
}

/** Convert YNAB milliunits to a human-readable currency amount. */
export function fromMilliunits(milliunits: number): number {
  return milliunits / 1000;
}

/** Format milliunits as a currency string (e.g. "$25.50" or "-$12.00"). */
export function formatCurrency(milliunits: number, currencySymbol = "$"): string {
  const value = fromMilliunits(milliunits);
  const abs = Math.abs(value).toFixed(2);
  return value < 0 ? `-${currencySymbol}${abs}` : `${currencySymbol}${abs}`;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class YnabApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorId: string,
    public readonly detail: string,
  ) {
    super(`YNAB API Error ${statusCode} [${errorId}]: ${detail}`);
    this.name = "YnabApiError";
  }
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

function getAccessToken(): string {
  const token = process.env.YNAB_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "YNAB_ACCESS_TOKEN environment variable is not set. " +
      "Get a Personal Access Token from YNAB → My Account → Developer Settings.",
    );
  }
  return token;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export async function ynabRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", params, body } = options;
  const token = getAccessToken();

  // Build URL with query params
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorId = "unknown";
    let detail = `HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as {
        error?: { id?: string; detail?: string };
      };
      errorId = errorBody?.error?.id ?? errorId;
      detail = errorBody?.error?.detail ?? detail;
    } catch {
      // Couldn't parse error body; use defaults
    }

    if (response.status === 429) {
      throw new YnabApiError(429, "rate_limit_exceeded",
        "YNAB API rate limit exceeded (200 requests/hour). Please wait before retrying.",
      );
    }

    throw new YnabApiError(response.status, errorId, detail);
  }

  const json = (await response.json()) as { data: T };
  return json.data;
}

// ---------------------------------------------------------------------------
// Convenience: resolve plan_id defaulting to "last-used"
// ---------------------------------------------------------------------------

export function resolvePlanId(planId?: string): string {
  return planId?.trim() || "last-used";
}
