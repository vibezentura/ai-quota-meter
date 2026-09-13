import { spawn } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findNodeExecutable, findPackageBinary } from "./cli-locator.js";

function cleanText(value, maximum = 160) {
  return typeof value === "string" ? value.slice(0, maximum) : null;
}

function defaultClaudeCommand() {
  if (process.platform !== "win32") return "claude";
  return findPackageBinary(["@anthropic-ai", "claude-code", "bin", "claude.exe"]) ?? "claude.exe";
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude CLI timed out."));
    }, options.timeoutMs ?? 30_000);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-65_536); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_096); });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Claude Code CLI is not installed or could not be started."));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

export function normalizeClaudeIdentity(value) {
  if (!value?.loggedIn || value.authMethod !== "claude.ai") {
    return { connected: false, reason: value?.loggedIn ? "Claude Code is not using a Claude subscription login." : "Claude Code is not signed in." };
  }
  return {
    connected: true,
    identity: {
      email: cleanText(value.email),
      planType: cleanText(value.subscriptionType, 40),
      authType: "claude.ai",
    },
  };
}

// Anthropic's own subscription usage endpoint, the same one the Claude
// apps read. Returns current utilization for the rolling windows without
// spending any inference quota, so the dashboard can refresh on demand
// instead of waiting for an interactive session to emit a status line.
export const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";

export function normalizeClaudeUsage(value, checkedAt = new Date().toISOString()) {
  const definitions = [
    ["five_hour", "5-hour", 300],
    ["seven_day", "Weekly", 10_080],
  ];
  const windows = definitions.flatMap(([key, label, durationMinutes]) => {
    const bucket = value?.[key];
    if (!bucket) return [];
    const usedPercent = Number(bucket.utilization);
    const resetsAt = Date.parse(bucket.resets_at ?? "");
    if (!Number.isFinite(usedPercent) || !Number.isFinite(resetsAt)) return [];
    return [{ id: key, label, usedPercent, durationMinutes, resetsAt: new Date(resetsAt).toISOString() }];
  });
  if (!windows.length) throw new Error("Claude did not return subscription limits for this account.");
  return { windows, checkedAt };
}

// Claude Code's own public OAuth client. Access tokens live ~12 hours; the
// stored refresh token is good for ~30 days. The CLI silently exchanges one
// for the other whenever you use it interactively — but `claude auth status`
// does not, so an isolated profile that is never opened interactively simply
// goes stale and every usage read starts failing. Doing the same exchange
// here is what keeps a dashboard-only profile working.
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const CLAUDE_TOKEN_ENDPOINTS = Object.freeze([
  "https://platform.claude.com/v1/oauth/token",
  "https://console.anthropic.com/v1/oauth/token",
]);
// Renew slightly early so a refresh in flight never races the expiry.
const REFRESH_SKEW_MS = 120_000;

export const LOGIN_REQUIRED_MESSAGE = "This Claude login has expired and could not be renewed automatically. Use Fix login on the card to sign in again for this profile.";
const REFRESH_UNAVAILABLE_MESSAGE = "Could not reach Claude to renew this login. Check the connection, then refresh again.";

export function claudeCredentialsPath(configDirectory) {
  return path.join(configDirectory ?? path.join(os.homedir(), ".claude"), ".credentials.json");
}

async function readCredentialsFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error("Claude Code has no stored subscription login for this profile.");
  }
  const oauth = parsed?.claudeAiOauth ?? parsed;
  if (!oauth?.accessToken) throw new Error("Claude Code has no stored subscription login for this profile.");
  return { parsed, oauth, nested: Boolean(parsed?.claudeAiOauth) };
}

// Rewrites only the OAuth block and leaves every other key in the file
// (mcpOAuth, organizationUuid, …) exactly as Claude Code wrote it. The write
// goes to a temporary file first and is then renamed over the original, so a
// crash mid-write can never leave the CLI with a truncated credential store.
async function writeCredentialsFile(file, parsed, oauth, nested) {
  const next = nested ? { ...parsed, claudeAiOauth: oauth } : { ...parsed, ...oauth };
  const temporary = `${file}.ai-quota-meter-${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
  return next;
}

// `refreshTokenExpiresAt` is only ever a hint for messaging here, never a
// gate: if the server rotates the refresh token without telling us the new
// lifetime, a stale value would otherwise refuse a login that still works.
export function normalizeRefreshedOauth(previous, payload, now = Date.now()) {
  const accessToken = payload?.access_token;
  if (typeof accessToken !== "string" || !accessToken) throw new Error("CLAUDE_REFRESH_NO_TOKEN");
  const expiresIn = Number(payload.expires_in);
  const scopes = Array.isArray(payload.scopes)
    ? payload.scopes
    : typeof payload.scope === "string" && payload.scope ? payload.scope.split(" ") : null;
  return {
    ...previous,
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : previous.refreshToken,
    expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 3_600_000),
    ...(scopes ? { scopes } : {}),
    ...(Number.isFinite(Number(payload.refresh_token_expires_in))
      ? { refreshTokenExpiresAt: now + Number(payload.refresh_token_expires_in) * 1000 }
      : {}),
    ...(payload.account?.subscription_type ? { subscriptionType: payload.account.subscription_type } : {}),
  };
}

// One in-flight refresh per credentials file. Without this, a bulk refresh of
// several accounts sharing the default profile could fire concurrent
// exchanges, and a rotated refresh token would invalidate the other's copy.
const refreshesInFlight = new Map();

async function exchangeRefreshToken(oauth, options) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const endpoints = options.endpoints ?? CLAUDE_TOKEN_ENDPOINTS;
  let transientFailure = null;
  for (const endpoint of endpoints) {
    let response;
    try {
      response = await fetchImplementation(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: oauth.refreshToken,
          client_id: CLAUDE_OAUTH_CLIENT_ID,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
    } catch (error) {
      transientFailure = error;
      continue;
    }
    if (response.ok) return response.json();
    // A rejected refresh token is final — the user has to sign in again, and
    // trying the other endpoint would only repeat the rejection.
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error(LOGIN_REQUIRED_MESSAGE);
    }
    // 404/410 mean this host no longer serves the exchange; fall through to
    // the next one. Anything else is treated as transient.
    transientFailure = new Error(`CLAUDE_REFRESH_HTTP_${response.status}`);
  }
  throw transientFailure instanceof Error && transientFailure.message === LOGIN_REQUIRED_MESSAGE
    ? transientFailure
    : new Error(REFRESH_UNAVAILABLE_MESSAGE);
}

// Exchanges the stored refresh token for a new access token and writes the
// result back, so both this dashboard and the CLI keep working.
export async function refreshClaudeOauth(options = {}) {
  const file = options.credentialsPath ?? claudeCredentialsPath(options.configDirectory);
  const existing = refreshesInFlight.get(file);
  if (existing) return existing;
  const work = (async () => {
    const { parsed, oauth, nested } = await readCredentialsFile(file);
    if (typeof oauth.refreshToken !== "string" || !oauth.refreshToken) throw new Error(LOGIN_REQUIRED_MESSAGE);
    const payload = await exchangeRefreshToken(oauth, options);
    const refreshed = normalizeRefreshedOauth(oauth, payload, options.now ?? Date.now());
    await writeCredentialsFile(file, parsed, refreshed, nested);
    return refreshed;
  })().finally(() => refreshesInFlight.delete(file));
  refreshesInFlight.set(file, work);
  return work;
}

async function readOauthAccessToken(configDirectory, options = {}) {
  const file = claudeCredentialsPath(configDirectory);
  const { oauth } = await readCredentialsFile(file);
  const expiresAt = Number(oauth.expiresAt);
  const stale = Number.isFinite(expiresAt) && Date.now() >= expiresAt - REFRESH_SKEW_MS;
  if (!stale && options.force !== true) return oauth.accessToken;
  const refreshed = await refreshClaudeOauth({ ...options, credentialsPath: file });
  return refreshed.accessToken;
}

// Reads live usage for one Claude profile. options.configDirectory selects
// an isolated CLAUDE_CONFIG_DIR profile; omit it for the default login.
export async function readClaudeUsage(options = {}) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const usageFetch = options.usageFetchImplementation ?? fetchImplementation;
  const read = async (token) => usageFetch(CLAUDE_USAGE_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });

  const explicitToken = options.accessToken;
  let response = await read(explicitToken ?? await readOauthAccessToken(options.configDirectory, options));
  // The stored token can also be rejected while its recorded expiry still
  // looks valid — a clock skew, or a login revoked on another device. One
  // forced renewal distinguishes "needs refreshing" from "really signed out".
  if (!explicitToken && (response.status === 401 || response.status === 403)) {
    response = await read(await readOauthAccessToken(options.configDirectory, { ...options, force: true }));
  }
  if (response.status === 401 || response.status === 403) throw new Error(LOGIN_REQUIRED_MESSAGE);
  if (response.status === 429) throw new Error("Claude is rate limiting usage checks. Wait a moment, then refresh again.");
  if (!response.ok) throw new Error("Claude could not return subscription usage right now.");
  return normalizeClaudeUsage(await response.json());
}

export function normalizeClaudeStatusLine(value, checkedAt = new Date().toISOString()) {
  const limits = value?.rate_limits;
  const definitions = [
    ["five_hour", "5-hour", 300],
    ["seven_day", "Weekly", 10_080],
  ];
  const windows = definitions.flatMap(([key, label, durationMinutes]) => {
    const limit = limits?.[key];
    if (!limit) return [];
    const usedPercent = Number(limit.used_percentage);
    const resetsAt = Number(limit.resets_at);
    if (!Number.isFinite(usedPercent) || !Number.isFinite(resetsAt)) throw new Error("Claude returned an invalid rate-limit window.");
    return [{ id: key, label, usedPercent, durationMinutes, resetsAt: new Date(resetsAt * 1000).toISOString() }];
  });
  if (!windows.length) throw new Error("Claude did not return subscription limits. Make one Claude Code request, then sync again.");
  return { windows, checkedAt };
}

export async function readClaudeIdentity(options = {}) {
  const runner = options.runner ?? runCommand;
  const command = options.command ?? process.env.AI_QUOTA_METER_CLAUDE_BIN ?? defaultClaudeCommand();
  const result = await runner(command, ["auth", "status", "--json"], {
    cwd: options.cwd,
    environment: { ...process.env, ...(options.environment ?? {}) },
    timeoutMs: options.timeoutMs ?? 15_000,
  });
  let value;
  try { value = JSON.parse(result.stdout); } catch {
    throw new Error(result.stderr.trim() ? "Claude Code could not complete the local account check." : "Claude Code exited before returning account data.");
  }
  return normalizeClaudeIdentity(value);
}

function shellQuote(value) {
  const text = String(value);
  if (process.platform === "win32") return `"${text.replaceAll('"', '""')}"`;
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

export async function syncClaudeUsage(options = {}) {
  const identity = await readClaudeIdentity(options);
  if (!identity.connected) return identity;
  const runner = options.runner ?? runCommand;
  const command = options.command ?? process.env.AI_QUOTA_METER_CLAUDE_BIN ?? defaultClaudeCommand();
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ai-quota-meter-claude-"));
  const captureScript = path.join(temporary, "capture.mjs");
  const captureFile = path.join(temporary, "status.json");
  const settingsFile = path.join(temporary, "settings.json");
  try {
    await writeFile(captureScript, `import { writeFile } from "node:fs/promises";\nlet input = "";\nprocess.stdin.setEncoding("utf8");\nfor await (const chunk of process.stdin) input += chunk;\nawait writeFile(process.argv[2], input, "utf8");\n`, "utf8");
    // The status line is a shell command Claude Code runs, and it has to be a
    // real Node runtime: inside the single-file build process.execPath is this
    // dashboard, which would start a second server instead of capturing usage.
    const nodeExecutable = findNodeExecutable();
    if (!nodeExecutable) throw new Error("Reading Claude usage this way needs Node.js on PATH. Install Node.js, or refresh the account instead.");
    await writeFile(settingsFile, JSON.stringify({ statusLine: { type: "command", command: `${shellQuote(nodeExecutable)} ${shellQuote(captureScript)} ${shellQuote(captureFile)}` } }), "utf8");
    const printResult = await runner(command, ["--print", "--settings", settingsFile, "--tools=", "Reply with only OK."], {
      cwd: options.cwd,
      environment: { ...process.env, ...(options.environment ?? {}) },
      timeoutMs: options.timeoutMs ?? 120_000,
    });
    if (printResult.code !== 0) {
      throw new Error(printResult.stderr.trim() ? "Claude Code could not complete the local account check." : "Claude Code exited before returning account data.");
    }
    let payload;
    try { payload = JSON.parse(await readFile(captureFile, "utf8")); } catch { throw new Error("Claude completed the check but did not emit status-line usage."); }
    return { ...identity, ...normalizeClaudeStatusLine(payload) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
