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
