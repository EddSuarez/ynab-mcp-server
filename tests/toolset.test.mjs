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
