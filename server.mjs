import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { getRawAsset, isSea } from "node:sea";
import { fileURLToPath } from "node:url";
import { readClaudeIdentity, readClaudeUsage } from "./claude-connector.js";
import { readCodexSnapshot } from "./codex-connector.js";
import { fetchDeepSeekBalance, isLoopbackHostname, isLoopbackOrigin } from "./deepseek-connector.js";
import { validateUsageDocument } from "./usage-core.js";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
// Inside a single-file build the interface is embedded in the executable
// instead of sitting next to it on disk, so the same route reads it from
// the SEA asset table. Everything else — connectors, loopback gating,
// the vault — is byte-for-byte the same code path as `npm start`.
const bundled = isSea();
// On Windows, process.title also renames the console window itself — without
// this a double-clicked build shows a taskbar entry and a title bar that just
// say "ai-quota-meter.exe", which is the single detail that most makes a
// console app read as a stray script rather than a program someone installed.
if (bundled) process.title = "AI Quota Meter";
const host = process.env.AI_QUOTA_METER_HOST || "127.0.0.1";
const port = Number(process.env.AI_QUOTA_METER_PORT || 4173);
const usageFile = process.env.AI_QUOTA_METER_USAGE_FILE ? path.resolve(process.env.AI_QUOTA_METER_USAGE_FILE) : null;
// The on-disk folder name here is intentionally left as "QuotaLocal" rather
// than renamed to match the product — this is where isolated Claude/Codex
// CLI profiles physically live (profiles/<provider>/<key>/.credentials.json,
// etc.), and renaming it would silently orphan every already-signed-in
// isolated account on a machine that had the old name, forcing a re-login
// with no error explaining why. Exactly the class of trap documented for
// the desktop app's port in CLAUDE.md — a stable path beats a stable name.
const dataDirectory = process.env.AI_QUOTA_METER_DATA_DIR
  ? path.resolve(process.env.AI_QUOTA_METER_DATA_DIR)
  : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "QuotaLocal");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);
const publicFiles = new Set([
  "app.bundle.js",
  "app.js",
  "crypto-vault.js",
  "deepseek-connector.js",
  "deepseek-usage.js",
  "demo-data.js",
  "favicon.svg",
  "index.html",
  "locale-boot.js",
  "styles.css",
  "theme-boot.js",
  "usage-core.js",
]);

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function sendJson(response, statusCode, value, extraHeaders = {}) {
  setSecurityHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(value));
}

async function readUsage() {
  if (!usageFile) {
    return {
      schemaVersion: 1,
      mode: "empty",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      generatedAt: new Date().toISOString(),
      accounts: [],
    };
  }
  const contents = await readFile(usageFile, "utf8");
  const document = validateUsageDocument(JSON.parse(contents));
  return { ...document, mode: "live" };
}

function requestHostname(request) {
  try {
    return new URL(`http://${request.headers.host ?? ""}`).hostname;
  } catch {
    return "";
  }
}

function localConnectorRequest(request) {
  return isLoopbackHostname(host) && isLoopbackHostname(requestHostname(request)) && isLoopbackOrigin(request.headers.origin);
}

function validateProfile(provider, value) {
  if (!new Set(["claude", "codex"]).has(provider)) throw new Error("INVALID_PROVIDER");
  const profileKey = value === "default" ? "default" : String(value ?? "");
  if (profileKey !== "default" && !/^[a-zA-Z0-9-]{8,64}$/.test(profileKey)) throw new Error("INVALID_PROFILE");
  return profileKey;
}

function profileDirectory(provider, profileKey) {
  return profileKey === "default" ? null : path.join(dataDirectory, "profiles", provider, profileKey);
}

function providerEnvironment(provider, profileKey) {
  const directory = profileDirectory(provider, profileKey);
  if (!directory) return {};
  return provider === "claude" ? { CLAUDE_CONFIG_DIR: directory } : { CODEX_HOME: directory };
}

function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function shellLiteral(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

// Returns { command } for a single universal shell line, or
// { powershell, cmd, bash } when the platform has multiple
// non-interoperable shell syntaxes. On Windows people routinely run
// PowerShell, cmd.exe, AND Git Bash/MSYS/WSL interchangeably — pasting
// one shell's env-var syntax into another silently sets nothing, and the
// login lands in the wrong profile with no error at all.
function withProfileEnv(provider, directory, command) {
  if (!directory) return { command };
  const variable = provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  if (process.platform === "win32") {
    const posixDirectory = directory.replaceAll("\\", "/");
    return {
      powershell: `$env:${variable}=${powershellLiteral(directory)}; ${command}`,
      cmd: `set "${variable}=${directory}" && ${command}`,
      bash: `${variable}=${shellLiteral(posixDirectory)} ${command}`,
    };
  }
  return { command: `${variable}=${shellLiteral(directory)} ${command}` };
}

function providerLoginCommand(provider, profileKey) {
  const directory = profileDirectory(provider, profileKey);
  const login = provider === "claude" ? "claude auth login --claudeai" : "codex login --device-auth";
  return withProfileEnv(provider, directory, login);
}

async function providerProfile(provider, rawProfileKey) {
  const profileKey = validateProfile(provider, rawProfileKey);
  const directory = profileDirectory(provider, profileKey);
  if (directory) await mkdir(directory, { recursive: true });
  return {
    profileKey,
    directory,
    environment: providerEnvironment(provider, profileKey),
    loginCommand: providerLoginCommand(provider, profileKey),
  };
}

// Opening the terminal for the user, instead of handing them a command to
// copy.
//
// The provider sign-in is genuinely interactive — it prints a URL and waits —
// so it needs a real console the user can see and type into; it cannot be run
// headless behind the dialog. But asking someone to work out whether they are
// in PowerShell, cmd, or Git Bash, find a terminal, and paste a long command
// with an environment variable in front of it is the step that loses everyone
// who is not already a developer. So the app writes a tiny throwaway script
// that sets the one variable and runs the provider's own login command, then
// opens it in a terminal window itself.
//
// Nothing here is user-supplied: the provider is one of two literals, and the
// profile key is already validated against /^[a-zA-Z0-9-]{8,64}$/ before the
// directory is built from it, so neither can inject shell syntax.
const LOGIN_HEADINGS = { claude: "Claude", codex: "Codex" };

async function writeWindowsLoginScript(provider, directory, profileKey) {
  const variable = provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  const login = provider === "claude" ? "claude auth login --claudeai" : "codex login --device-auth";
  const file = path.join(os.tmpdir(), `ai-quota-meter-signin-${provider}-${profileKey}.cmd`);
  const script = [
    "@echo off",
    "title AI Quota Meter - sign in",
    ...(directory ? [`set "${variable}=${directory}"`] : []),
    `echo Signing in to ${LOGIN_HEADINGS[provider]} for AI Quota Meter.`,
    "echo Follow the steps below. AI Quota Meter notices on its own when you are done.",
    "echo.",
    login,
    "echo.",
    "echo Finished - you can close this window and go back to AI Quota Meter.",
    "pause",
  ].join("\r\n");
  await writeFile(file, `${script}\r\n`, "utf8");
  return file;
}

async function writeUnixLoginScript(provider, directory, profileKey) {
  const variable = provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  const login = provider === "claude" ? "claude auth login --claudeai" : "codex login --device-auth";
  const file = path.join(os.tmpdir(), `ai-quota-meter-signin-${provider}-${profileKey}.sh`);
  const script = [
    "#!/bin/sh",
    ...(directory ? [`export ${variable}=${shellLiteral(directory)}`] : []),
    `echo "Signing in to ${LOGIN_HEADINGS[provider]} for AI Quota Meter."`,
    `echo "Follow the steps below. AI Quota Meter notices on its own when you are done."`,
    "echo",
    login,
    "echo",
    `echo "Finished - you can close this window and go back to AI Quota Meter."`,
  ].join("\n");
  await writeFile(file, `${script}\n`, "utf8");
  await chmod(file, 0o700);
  return file;
}

function spawnDetached(command, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      // No exit wait: a terminal emulator stays open for as long as the user
      // needs it, so "did it start" is the only answer available here.
      child.unref();
      setTimeout(() => resolve(true), 150);
    } catch {
      resolve(false);
    }
  });
}

async function launchLoginTerminal(provider, profile) {
  if (process.platform === "win32") {
    const script = await writeWindowsLoginScript(provider, profile.directory, profile.profileKey);
    // The empty first argument is `start`'s title parameter — without it the
    // quoted script path would be taken as the window title and nothing runs.
    return spawnDetached("cmd.exe", ["/c", "start", "", script]);
  }

  const script = await writeUnixLoginScript(provider, profile.directory, profile.profileKey);
  if (process.platform === "darwin") {
    return spawnDetached("osascript", [
      "-e", `tell application "Terminal" to do script ${JSON.stringify(script)}`,
      "-e", 'tell application "Terminal" to activate',
    ]);
  }
  for (const terminal of ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"]) {
    if (await spawnDetached(terminal, ["-e", script])) return true;
  }
  return false;
}

async function readJsonBody(request, maximumBytes = 8192) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(requestPath, response) {
  const requested = requestPath === "/" ? "/index.html" : requestPath;
  const resolved = path.resolve(appDirectory, `.${requested}`);
  const relative = path.relative(appDirectory, resolved);
  if (!publicFiles.has(relative)) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const contentType = contentTypes.get(path.extname(resolved)) ?? "application/octet-stream";

  if (bundled) {
    try {
      // getRawAsset hands back the bytes already resident in the executable,
      // so there is no temporary extraction directory for another process to
      // read or tamper with between launch and first request.
      const asset = Buffer.from(getRawAsset(relative.replaceAll("\\", "/")));
      setSecurityHeaders(response);
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
      response.end(asset);
    } catch {
      sendJson(response, 404, { error: "Not found" });
    }
    return;
  }

  try {
    const file = await stat(resolved);
    if (!file.isFile()) throw new Error("Not a file");
    setSecurityHeaders(response);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });
    createReadStream(resolved).pipe(response);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      mode: usageFile ? "live" : "empty",
      localConnector: isLoopbackHostname(host) && isLoopbackHostname(requestHostname(request)),
    });
    return;
  }
  if (url.pathname === "/api/providers/deepseek/balance" && method === "POST") {
    if (!localConnectorRequest(request)) {
      sendJson(response, 403, { error: "DeepSeek keys are accepted only by the loopback-local app." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const balance = await fetchDeepSeekBalance(body.apiKey);
      sendJson(response, 200, { balance, checkedAt: new Date().toISOString() });
    } catch (error) {
      if (error instanceof Error && error.message === "DEEPSEEK_AUTH_REJECTED") {
        sendJson(response, 401, { error: "DeepSeek rejected this API key." });
      } else {
        sendJson(response, 502, { error: "Could not read DeepSeek balance." });
      }
    }
    return;
  }
  if (url.pathname === "/api/providers/profile/prepare" && method === "POST") {
    if (!localConnectorRequest(request)) {
      sendJson(response, 403, { error: "Local account setup is available only through the loopback app." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const profile = await providerProfile(body.provider, body.profileKey);
      sendJson(response, 200, { profileKey: profile.profileKey, managed: Boolean(profile.directory), loginCommand: profile.loginCommand });
    } catch {
      sendJson(response, 400, { error: "Invalid local provider profile." });
    }
    return;
  }
  if (url.pathname === "/api/providers/profile/login" && method === "POST") {
    if (!localConnectorRequest(request)) {
      sendJson(response, 403, { error: "Opening a sign-in terminal is available only through the loopback app." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const profile = await providerProfile(body.provider, body.profileKey);
      // `launched: false` is a normal answer, not an error — the caller falls
      // back to showing the command so a headless or unusual desktop is still
      // a working path rather than a dead end.
      const launched = await launchLoginTerminal(body.provider, profile);
      sendJson(response, 200, { launched, profileKey: profile.profileKey, loginCommand: profile.loginCommand });
    } catch {
      sendJson(response, 400, { error: "Could not open a sign-in terminal for this profile." });
    }
    return;
  }
  if (url.pathname === "/api/providers/claude/connect" && method === "POST") {
    if (!localConnectorRequest(request)) {
      sendJson(response, 403, { error: "Claude connection is available only through the loopback app." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const profile = await providerProfile("claude", body.profileKey);
      const result = await readClaudeIdentity({ environment: profile.environment, cwd: appDirectory });
      // Live windows come from Anthropic's usage endpoint, which spends no
      // inference quota — so Claude refreshes on demand just like Codex.
      // identityOnly is what the "waiting for you to finish signing in" poll
      // uses. Reading usage on every poll would put a request to Anthropic's
      // endpoint on the wire every few seconds for as long as the user takes
      // to log in, which is both rude and a good way to get rate limited —
      // and the poll only needs to know whether the login landed yet.
      let usage = null;
      let usageError = null;
      if (result.connected && body.identityOnly !== true) {
        try {
          usage = await readClaudeUsage({ configDirectory: profile.directory });
        } catch (error) {
          usageError = error instanceof Error ? error.message : "Could not read Claude usage.";
        }
      }
      sendJson(response, 200, {
        ...result,
        ...(usage ?? {}),
        usageError,
        profileKey: profile.profileKey,
        loginCommand: result.connected ? null : profile.loginCommand,
        checkedAt: usage?.checkedAt ?? new Date().toISOString(),
      });
    } catch {
      sendJson(response, 503, { error: "Could not inspect the local Claude Code account. Confirm that Claude Code is installed." });
    }
    return;
  }
  if (url.pathname === "/api/providers/claude/sync" && method === "POST") {
    if (!localConnectorRequest(request)) {
      sendJson(response, 403, { error: "Claude usage sync is available only through the loopback app." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const profile = await providerProfile("claude", body.profileKey);
      const identity = await readClaudeIdentity({ environment: profile.environment, cwd: appDirectory });
      if (!identity.connected) {
        sendJson(response, 200, { ...identity, profileKey: profile.profileKey, loginCommand: profile.loginCommand });
        return;
      }
      const usage = await readClaudeUsage({ configDirectory: profile.directory });
      sendJson(response, 200, { ...identity, ...usage, profileKey: profile.profileKey });
    } catch (error) {
      sendJson(response, 503, { error: error instanceof Error ? error.message : "Could not sync Claude usage." });
    }
    return;
  }
  if (url.pathname === "/api/providers/codex/connect" && method === "POST") {
    if (!localConnectorRequest(request)) {
      sendJson(response, 403, { error: "Codex connection is available only through the loopback app." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const profile = await providerProfile("codex", body.profileKey);
      const result = await readCodexSnapshot({ environment: profile.environment, cwd: appDirectory });
      sendJson(response, 200, { ...result, profileKey: profile.profileKey, loginCommand: result.connected ? null : profile.loginCommand });
    } catch {
      sendJson(response, 503, { error: "Could not inspect the local Codex account. Confirm that Codex CLI is installed." });
    }
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" }, { Allow: "GET, HEAD" });
    return;
  }
  if (url.pathname === "/api/usage") {
    try {
      sendJson(response, 200, await readUsage());
    } catch {
      sendJson(response, 503, { error: "Usage data unavailable" });
    }
    return;
  }
  await serveStatic(decodeURIComponent(url.pathname), response);
});

function openInBrowser(address) {
  const [command, args] = process.platform === "win32"
    ? ["cmd", ["/c", "start", "", address]]
    : process.platform === "darwin"
      ? ["open", [address]]
      : ["xdg-open", [address]];
  try {
    spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
    // Opening a browser is a convenience. The printed address still works.
  }
}

// A double-clicked executable has no shell to report into: when the port is
// already taken the console window closes again before anyone can read why.
// A bundled launch therefore states the reason and waits for a keypress.
function holdWindowOpen() {
  if (!bundled || !process.stdin.isTTY) return false;
  process.stdout.write("\nPress any key to close this window.\n");
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(1));
  return true;
}

server.once("error", (error) => {
  process.stderr.write(`${error?.code === "EADDRINUSE"
    ? `Port ${port} is already in use. Close the other AI Quota Meter window, or set AI_QUOTA_METER_PORT to a free port.`
    : `AI Quota Meter could not start: ${error?.message ?? error}`}\n`);
  if (!holdWindowOpen()) process.exitCode = 1;
});

// AI_QUOTA_METER_OPEN forces the browser open ("1") or suppresses it ("0");
// unset keeps the default, which is to open only for a double-clicked
// single-file build. The explicit "0" is what the desktop shell passes: it
// supplies its own window, so a browser tab opening on top of it would be a
// second copy of the same dashboard. An earlier `bundled || OPEN === "1"`
// could never see that opt-out, because the sidecar is itself a bundled
// build and short-circuited to true before looking.
function shouldOpenBrowser() {
  const requested = process.env.AI_QUOTA_METER_OPEN;
  if (requested === "0") return false;
  if (requested === "1") return true;
  return bundled;
}

server.listen(port, host, () => {
  const address = `http://${host}:${port}`;
  const mode = usageFile ? "external snapshot feed" : "empty local vault";
  process.stdout.write(`AI Quota Meter: ${address} (${mode})\n`);
  if (bundled && shouldOpenBrowser()) process.stdout.write("Keep this window open while you use the dashboard. Press Ctrl+C to stop.\n");
  if (shouldOpenBrowser()) openInBrowser(address);
});
