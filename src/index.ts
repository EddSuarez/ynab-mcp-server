#!/usr/bin/env node

/**
 * YNAB MCP Server
 *
 * An MCP server that exposes the YNAB (You Need A Budget) API as tools,
 * enabling AI assistants to read and manage budgets through natural language.
 *
 * Requires: YNAB_ACCESS_TOKEN environment variable.
 *
 * Transports:
 *   - default: stdio (Claude Desktop and other local MCP clients)
 *   - MCP_TRANSPORT=http: Streamable HTTP on PORT (default 8080) for remote
 *     connectors (e.g. claude.ai via Cloud Run). Requires MCP_AUTH_TOKEN
 *     (>= 32 chars); requests must send "Authorization: Bearer <token>".
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { buildServer } from "./server.js";

/** Constant-time token comparison; hashing first hides length differences. */
function timingSafeTokenEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { "content-type": "application/json" }).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      }),
    );
    return;
  }

  // Stateless mode: fresh server + transport per request, torn down when the
  // response closes, so concurrent requests never share state.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

async function runHttp(): Promise<void> {
  // trim(): secrets created via `openssl rand | gcloud secrets create` carry a
  // trailing newline that would otherwise make every comparison fail.
  const authToken = process.env.MCP_AUTH_TOKEN?.trim();
  if (!authToken || authToken.length < 32) {
    console.error(
      "MCP_AUTH_TOKEN must be set and at least 32 characters long in HTTP mode.",
    );
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 8080);

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/healthz" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }

    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }

    if (req.method !== "POST") {
      res
        .writeHead(405, { "content-type": "text/plain", allow: "POST" })
        .end("method not allowed");
      return;
    }

    // Token via Authorization header, or ?key= for clients that can't set
    // custom headers (claude.ai custom connectors only offer OAuth fields).
    const provided =
      req.headers.authorization?.replace(/^Bearer /, "") ??
      url.searchParams.get("key") ??
      "";
    if (!timingSafeTokenEqual(provided, authToken)) {
      res.writeHead(401, { "content-type": "text/plain" }).end("unauthorized");
      return;
    }

    handleMcpPost(req, res).catch((err) => {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
    });
  });

  httpServer.listen(port, () => {
    console.error(`YNAB MCP server listening on http://0.0.0.0:${port}/mcp`);
  });
}

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await buildServer().connect(transport);
}

if (process.env.MCP_TRANSPORT === "http") {
  await runHttp();
} else {
  await runStdio();
}
