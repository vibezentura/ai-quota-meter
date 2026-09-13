import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CLAUDE_OAUTH_CLIENT_ID,
  normalizeClaudeIdentity,
  normalizeClaudeStatusLine,
  normalizeClaudeUsage,
  normalizeRefreshedOauth,
  readClaudeUsage,
  refreshClaudeOauth,
} from "../claude-connector.js";
import { normalizeCodexSnapshot } from "../codex-connector.js";

const HOUR = 3_600_000;

// Writes a credentials file shaped exactly like the one Claude Code stores,
// including the neighbouring keys that must survive a refresh untouched.
async function credentialsFixture(oauthOverrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-quota-meter-test-"));
  const file = path.join(directory, ".credentials.json");
  await writeFile(file, JSON.stringify({
    mcpOAuth: { "some-server": { token: "untouched" } },
    claudeAiOauth: {
      accessToken: "sk-ant-oat01-old",
      refreshToken: "sk-ant-ort01-stored",
      expiresAt: Date.now() - HOUR,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * HOUR,
      scopes: ["user:inference", "user:profile"],
      subscriptionType: "pro",
      rateLimitTier: "default",
      ...oauthOverrides,
    },
    organizationUuid: "org-uuid",
  }), "utf8");
  return { directory, file };
}

function tokenResponse(overrides = {}) {
  return new Response(JSON.stringify({
    access_token: "sk-ant-oat01-new",
    refresh_token: "sk-ant-ort01-stored",
    expires_in: 43_200,
    token_type: "Bearer",
    ...overrides,
  }), { status: 200 });
}

test("Claude identity requires a Claude subscription login", () => {
  assert.equal(normalizeClaudeIdentity({ loggedIn: false }).connected, false);
  assert.equal(normalizeClaudeIdentity({ loggedIn: true, authMethod: "apiKey" }).connected, false);
  assert.deepEqual(normalizeClaudeIdentity({ loggedIn: true, authMethod: "claude.ai", email: "person@example.com", subscriptionType: "pro" }), {
    connected: true,
    identity: { email: "person@example.com", planType: "pro", authType: "claude.ai" },
  });
});

test("Claude status-line limits become dashboard windows", () => {
  const value = normalizeClaudeStatusLine({ rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 1_800_000_000 },
    seven_day: { used_percentage: 41.2, resets_at: 1_800_100_000 },
  } }, "2026-01-01T00:00:00.000Z");
  assert.equal(value.windows[0].durationMinutes, 300);
  assert.equal(value.windows[1].durationMinutes, 10_080);
  assert.equal(value.windows[0].usedPercent, 23.5);
});

test("Claude refuses to invent missing usage windows", () => {
  assert.throws(() => normalizeClaudeStatusLine({ rate_limits: {} }), /did not return subscription limits/);
});

test("Claude usage endpoint response becomes dashboard windows", () => {
  const value = normalizeClaudeUsage({
    five_hour: { utilization: 38.0, resets_at: "2026-08-28T20:39:59.717778+00:00" },
    seven_day: { utilization: 71.0, resets_at: "2026-09-01T11:59:59.717805+00:00" },
  }, "2026-08-28T19:00:00.000Z");
  assert.equal(value.windows.length, 2);
  assert.equal(value.windows[0].usedPercent, 38);
  assert.equal(value.windows[0].durationMinutes, 300);
  assert.equal(value.windows[0].resetsAt, "2026-08-28T20:39:59.717Z");
  assert.equal(value.windows[1].usedPercent, 71);
  assert.equal(value.windows[1].durationMinutes, 10_080);
  assert.equal(value.checkedAt, "2026-08-28T19:00:00.000Z");
});

test("Claude usage skips windows the account does not have", () => {
  const value = normalizeClaudeUsage({
    five_hour: { utilization: 12, resets_at: "2026-08-28T20:00:00.000Z" },
    seven_day: null,
  });
  assert.equal(value.windows.length, 1);
  assert.equal(value.windows[0].id, "five_hour");
  assert.throws(() => normalizeClaudeUsage({}), /did not return subscription limits/);
});

test("Claude usage turns an expired or rejected login into a clear message", async () => {
  const reject = async () => new Response("{}", { status: 401 });
  await assert.rejects(
    () => readClaudeUsage({ accessToken: "test-token", fetchImplementation: reject }),
    /could not be renewed automatically/,
  );
  const limited = async () => new Response("{}", { status: 429 });
  await assert.rejects(
    () => readClaudeUsage({ accessToken: "test-token", fetchImplementation: limited }),
    /rate limiting/,
  );
});

test("Claude usage sends the subscription auth headers and no inference payload", async () => {
  let seen = null;
  const capture = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ five_hour: { utilization: 5, resets_at: "2026-08-28T20:00:00.000Z" } }), { status: 200 });
  };
  await readClaudeUsage({ accessToken: "test-token", fetchImplementation: capture });
  assert.equal(seen.url, "https://api.anthropic.com/api/oauth/usage");
  assert.equal(seen.init.headers.Authorization, "Bearer test-token");
  assert.equal(seen.init.headers["anthropic-beta"], "oauth-2025-04-20");
  assert.equal(seen.init.method, undefined);
  assert.equal(seen.init.body, undefined);
});

test("a refreshed token keeps the fields the response does not carry", () => {
  const previous = { accessToken: "old", refreshToken: "stored", expiresAt: 1, scopes: ["a"], subscriptionType: "pro", rateLimitTier: "default" };
  const value = normalizeRefreshedOauth(previous, { access_token: "new", expires_in: 3600 }, 1_000_000);
  assert.equal(value.accessToken, "new");
  assert.equal(value.refreshToken, "stored", "an unrotated refresh token is preserved");
  assert.equal(value.expiresAt, 1_000_000 + 3_600_000);
  assert.deepEqual(value.scopes, ["a"]);
  assert.equal(value.rateLimitTier, "default", "unknown fields survive the exchange");
});

test("a rotated refresh token replaces the stored one", () => {
  const value = normalizeRefreshedOauth(
    { accessToken: "old", refreshToken: "stored" },
    { access_token: "new", refresh_token: "rotated", expires_in: 60, scope: "user:profile user:inference" },
    1_000,
  );
  assert.equal(value.refreshToken, "rotated");
  assert.deepEqual(value.scopes, ["user:profile", "user:inference"]);
});

test("refreshing exchanges the stored refresh token and rewrites only the OAuth block", async () => {
  const { directory, file } = await credentialsFixture();
  let seen = null;
  const refreshed = await refreshClaudeOauth({
    configDirectory: directory,
    now: 5_000,
    fetchImplementation: async (url, init) => {
      seen = { url, body: JSON.parse(init.body), method: init.method };
      return tokenResponse();
    },
  });

  assert.equal(seen.url, "https://platform.claude.com/v1/oauth/token");
  assert.equal(seen.method, "POST");
  assert.equal(seen.body.grant_type, "refresh_token");
  assert.equal(seen.body.refresh_token, "sk-ant-ort01-stored");
  assert.equal(seen.body.client_id, CLAUDE_OAUTH_CLIENT_ID);
  assert.equal(refreshed.accessToken, "sk-ant-oat01-new");

  const written = JSON.parse(await readFile(file, "utf8"));
  assert.equal(written.claudeAiOauth.accessToken, "sk-ant-oat01-new");
  assert.equal(written.claudeAiOauth.expiresAt, 5_000 + 43_200_000);
  assert.equal(written.claudeAiOauth.subscriptionType, "pro");
  assert.deepEqual(written.mcpOAuth, { "some-server": { token: "untouched" } }, "other credential keys are left alone");
  assert.equal(written.organizationUuid, "org-uuid");
  assert.deepEqual((await readdir(directory)).sort(), [".credentials.json"], "no temporary file is left behind");
});

test("refreshing falls back to the second endpoint when the first is gone", async () => {
  const { directory } = await credentialsFixture();
  const tried = [];
  await refreshClaudeOauth({
    configDirectory: directory,
    fetchImplementation: async (url) => {
      tried.push(url);
      return url.includes("platform.claude.com") ? new Response("", { status: 404 }) : tokenResponse();
    },
  });
  assert.deepEqual(tried, ["https://platform.claude.com/v1/oauth/token", "https://console.anthropic.com/v1/oauth/token"]);
});

test("a rejected refresh token asks for a new sign-in and leaves the file untouched", async () => {
  const { directory, file } = await credentialsFixture();
  const before = await readFile(file, "utf8");
  await assert.rejects(
    () => refreshClaudeOauth({
      configDirectory: directory,
      fetchImplementation: async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    }),
    /Fix login/,
  );
  assert.equal(await readFile(file, "utf8"), before);
});

test("a login with no refresh token cannot be renewed", async () => {
  const { directory } = await credentialsFixture({ refreshToken: undefined });
  await assert.rejects(() => refreshClaudeOauth({ configDirectory: directory }), /Fix login/);
});

test("an unreachable token endpoint is reported as transient, not as a signed-out login", async () => {
  const { directory } = await credentialsFixture();
  await assert.rejects(
    () => refreshClaudeOauth({
      configDirectory: directory,
      fetchImplementation: async () => { throw new Error("ENOTFOUND"); },
    }),
    /Could not reach Claude/,
  );
});

test("an expired stored token is renewed automatically before the usage read", async () => {
  const { directory, file } = await credentialsFixture();
  let refreshCalls = 0;
  const usage = await readClaudeUsage({
    configDirectory: directory,
    fetchImplementation: async () => { refreshCalls += 1; return tokenResponse(); },
    usageFetchImplementation: async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer sk-ant-oat01-new", "the usage read uses the renewed token");
      return new Response(JSON.stringify({ five_hour: { utilization: 7, resets_at: "2026-08-28T20:00:00.000Z" } }), { status: 200 });
    },
  });
  assert.equal(refreshCalls, 1);
  assert.equal(usage.windows[0].usedPercent, 7);
  assert.ok(JSON.parse(await readFile(file, "utf8")).claudeAiOauth.expiresAt > Date.now());
});

test("a still-valid stored token is used as is, with no refresh call", async () => {
  const { directory } = await credentialsFixture({ accessToken: "sk-ant-oat01-fresh", expiresAt: Date.now() + 6 * HOUR });
  let refreshCalls = 0;
  await readClaudeUsage({
    configDirectory: directory,
    fetchImplementation: async () => { refreshCalls += 1; return tokenResponse(); },
    usageFetchImplementation: async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer sk-ant-oat01-fresh");
      return new Response(JSON.stringify({ five_hour: { utilization: 1, resets_at: "2026-08-28T20:00:00.000Z" } }), { status: 200 });
    },
  });
  assert.equal(refreshCalls, 0);
});

test("a token rejected while it still looks valid is renewed once, then retried", async () => {
  const { directory } = await credentialsFixture({ accessToken: "sk-ant-oat01-revoked", expiresAt: Date.now() + 6 * HOUR });
  let refreshCalls = 0;
  const attempts = [];
  const usage = await readClaudeUsage({
    configDirectory: directory,
    fetchImplementation: async () => { refreshCalls += 1; return tokenResponse(); },
    usageFetchImplementation: async (url, init) => {
      attempts.push(init.headers.Authorization);
      return attempts.length === 1
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify({ seven_day: { utilization: 9, resets_at: "2026-09-01T20:00:00.000Z" } }), { status: 200 });
    },
  });
  assert.deepEqual(attempts, ["Bearer sk-ant-oat01-revoked", "Bearer sk-ant-oat01-new"]);
  assert.equal(refreshCalls, 1, "the forced renewal happens exactly once");
  assert.equal(usage.windows[0].usedPercent, 9);
});

test("concurrent refreshes of one profile exchange the token only once", async () => {
  const { directory } = await credentialsFixture();
  let calls = 0;
  const fetchImplementation = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return tokenResponse();
  };
  const results = await Promise.all([
    refreshClaudeOauth({ configDirectory: directory, fetchImplementation }),
    refreshClaudeOauth({ configDirectory: directory, fetchImplementation }),
    refreshClaudeOauth({ configDirectory: directory, fetchImplementation }),
  ]);
  assert.equal(calls, 1, "a rotated refresh token must never be exchanged twice in parallel");
  assert.equal(results[2].accessToken, "sk-ant-oat01-new");
});

test("Codex account and aggregate rate limits are normalized", () => {
  const value = normalizeCodexSnapshot(
    { account: { type: "chatgpt", email: "person@example.com", planType: "plus" } },
    { rateLimits: { primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 1_800_000_000 }, secondary: { usedPercent: 45, windowDurationMins: 10_080, resetsAt: 1_800_100_000 } } },
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(value.connected, true);
  assert.equal(value.identity.planType, "plus");
  assert.deepEqual(value.windows.map((window) => window.label), ["5-hour", "Weekly"]);
});

test("Codex API-key auth is not treated as a subscription connection", () => {
  assert.equal(normalizeCodexSnapshot({ account: { type: "apiKey" } }, {}).connected, false);
});
