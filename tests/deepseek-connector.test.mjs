import assert from "node:assert/strict";
import test from "node:test";
import { fetchDeepSeekBalance, isLoopbackHostname, isLoopbackOrigin, normalizeDeepSeekBalance } from "../deepseek-connector.js";

test("only explicit loopback hostnames pass the sensitive connector boundary", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("[::1]"), true);
  assert.equal(isLoopbackHostname("quota.example.com"), false);
  assert.equal(isLoopbackHostname("127.0.0.1.evil.example"), false);
});

test("cross-site origins cannot post keys to the local connector", () => {
  assert.equal(isLoopbackOrigin("http://127.0.0.1:4173"), true);
  assert.equal(isLoopbackOrigin("http://localhost:4173"), true);
  assert.equal(isLoopbackOrigin(undefined), true);
  assert.equal(isLoopbackOrigin("https://quota.example.com"), false);
  assert.equal(isLoopbackOrigin("not a URL"), false);
});

test("DeepSeek balance response is reduced to documented fields", () => {
  assert.deepEqual(normalizeDeepSeekBalance({
    is_available: true,
    ignored: "value",
    balance_infos: [{ currency: "USD", total_balance: "8.20", granted_balance: "1.00", topped_up_balance: "7.20", secret: "ignored" }],
  }), {
    is_available: true,
    balance_infos: [{ currency: "USD", total_balance: "8.20", granted_balance: "1.00", topped_up_balance: "7.20" }],
  });
});

test("DeepSeek connector sends the key only in the provider authorization header", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ is_available: true, balance_infos: [] }) };
  };
  await fetchDeepSeekBalance("sk-test-key-123456", fakeFetch);
  assert.equal(calls[0].url, "https://api.deepseek.com/user/balance");
  assert.equal(calls[0].options.headers.Authorization, "Bearer sk-test-key-123456");
  assert.equal(calls[0].options.method, "GET");
});
