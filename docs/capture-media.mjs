// Real UI captures, using only Node built-ins and an installed Chromium browser.
// See media.md for prerequisites, scope, and the optional GIF encoder.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "docs/assets");
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
].find(existsSync);
if (!chrome) throw new Error("Set CHROME_PATH to a Chrome/Chromium/Edge executable.");
if (!globalThis.WebSocket) throw new Error("Media capture requires Node.js 22 or newer.");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 100; i++) {
    const result = await check().catch(() => false);
    if (result) return result;
    await pause(100);
  }
  throw new Error(`Timed out: ${label}`);
}
const port = await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const value = socket.address().port;
    socket.close(() => resolve(value));
  });
});
const temporary = await mkdtemp(path.join(tmpdir(), "quota-docs-"));
const profile = path.join(temporary, "browser");
const origin = `http://127.0.0.1:${port}`;
let server, browser, ws;
const pending = new Map();
let sequence = 0;
const errors = [];
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await pause(250);
}
async function capture(name, selector, bottomSelector) {
  await evaluate("document.activeElement?.blur()");
  await pause(150);
  const clip = selector ? await evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    const bottom = ${JSON.stringify(bottomSelector ?? null)};
    const end = bottom ? document.querySelector(bottom).getBoundingClientRect().bottom : r.bottom;
    return { x: r.x + scrollX - 12, y: r.y + scrollY - 12, width: r.width + 24, height: end - r.y + 24, scale: 1 };
  })()`) : { x: 0, y: 0, width: 1440, height: 810, scale: 1 };
  const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip });
  await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`Captured ${name}.png`);
}
try {
  await mkdir(output, { recursive: true });
  const build = spawnSync(process.execPath, ["build.mjs"], { cwd: root, windowsHide: true, encoding: "utf8" });
  if (build.status !== 0) throw new Error(build.stderr || "Bundle build failed");
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: root, windowsHide: true, stdio: "ignore",
    env: { ...process.env, AI_QUOTA_METER_PORT: String(port), AI_QUOTA_METER_HOST: "127.0.0.1",
      AI_QUOTA_METER_OPEN: "0", AI_QUOTA_METER_USAGE_FILE: "", AI_QUOTA_METER_DATA_DIR: path.join(temporary, "data") },
  });
  server.on("error", (error) => errors.push(error.message));
  await until(async () => (await fetch(`${origin}/api/health`)).ok, "local server");
  browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"],
  { windowsHide: true, stdio: "ignore" });
  browser.on("error", (error) => errors.push(error.message));
  const debugPort = await until(async () => (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0], "browser debugger");
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  ws = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    // Fail closed: captures must never connect to a real provider or launch its CLI.
    if (message.method === "Fetch.requestPaused") {
      errors.push(`Blocked unexpected request: ${message.params.request.url}`);
      void command("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "BlockedByClient" });
    }
  };
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/providers/*" }] });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1060, deviceScaleFactor: 1, mobile: false });
  await command("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('quota-local:theme:v1', 'dark');
    const NativeDate = Date;
    const fixedNow = new NativeDate('2026-09-18T10:00:00Z').getTime();
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    };
  ` });
  await command("Page.navigate", { url: `${origin}/?demo=1` });
  await until(() => evaluate("document.querySelectorAll('[data-expand-ledger]').length > 0"), "demo dashboard");
  await capture("dashboard-dark");
  // Chained ar -> fr -> de -> en on purpose: every hop here switches between
  // two non-English languages directly, the exact transition that used to
  // corrupt static header attributes (see CLAUDE.md's Localization section).
  // Capturing this way doubles as a live check that the fix holds, not just
  // a screenshot run.
  await evaluate(`(() => { const select = document.querySelector('.language-select'); select.value = 'ar'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await pause(250);
  await capture("dashboard-arabic");
  await evaluate(`(() => { const select = document.querySelector('.language-select'); select.value = 'fr'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await pause(250);
  await capture("dashboard-french");
  await evaluate(`(() => { const select = document.querySelector('.language-select'); select.value = 'de'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await pause(250);
  await capture("dashboard-german");
  await evaluate(`(() => { const select = document.querySelector('.language-select'); select.value = 'en'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await pause(250);
  await click("#theme-button");
  await capture("dashboard-light");
  await click("#theme-button");
  // All providers: crop the first row to show both Claude profiles and Codex.
  await capture("usage-progress", ".ledger-block", "#ledger-grid > :nth-child(3)");
  await click('[data-provider-lane="claude"]');
  await capture("forecast-and-resets", ".insights-grid");
  await click('[data-expand-ledger="claude-a"]');
  await capture("charts-and-data", "#ledger-detail-dialog");
  await evaluate("document.querySelector('#ledger-detail-body').scrollTop = document.querySelector('#ledger-detail-body').scrollHeight");
  await capture("sessions-and-readings", "#ledger-detail-dialog");
  await click('[data-close-dialog="ledger-detail-dialog"]');
  const frames = [];
  for (const lane of ["all", "claude", "codex", "deepseek", "all"]) {
    await click(`[data-provider-lane="${lane}"]`);
    if (lane === "deepseek") await capture("deepseek-credits", "#accounts-grid > :first-child");
    const shot = await command("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1440, height: 810, scale: 1 } });
    const filename = `frame-${frames.length}.png`;
    await writeFile(path.join(temporary, filename), Buffer.from(shot.data, "base64"));
    frames.push(filename);
  }
  await click("#add-account-button");
  await capture("setup-vault", "#vault-dialog");
  await evaluate(`document.querySelector('#vault-passphrase').value = 'Documentation demo only';
    document.querySelector('#vault-passphrase-confirm').value = 'Documentation demo only';
    document.querySelector('#vault-form').requestSubmit()`);
  await until(() => evaluate("document.querySelector('#account-dialog').open"), "account dialog");
  await capture("setup-claude", "#account-dialog");
  await click('[name="provider"][value="codex"]');
  await click('[name="codexProfileMode"][value="isolated"]');
  await capture("setup-codex", "#account-dialog");
  await click('[name="provider"][value="deepseek"]');
  await evaluate("document.querySelector('#account-dialog .dialog-scroll').scrollTop = document.querySelector('#account-dialog .dialog-scroll').scrollHeight");
  await capture("setup-deepseek", "#account-dialog");
  await click('[data-close-dialog="account-dialog"]');
  await click("#vault-button");
  await capture("display-and-backups", "#settings-dialog");
  if (errors.length) throw new Error(errors.join("\n"));
  if (process.argv.includes("--gif")) {
    await writeFile(path.join(temporary, "frames.txt"), frames.map((name) => `file '${name}'\nduration 2.4`).join("\n") + `\nfile '${frames.at(-1)}'\n`);
    const encoded = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", "frames.txt",
      "-filter_complex", "[0:v]fps=5,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
      "-t", "12", "-loop", "0", path.join(output, "provider-tour.gif")], { cwd: temporary, windowsHide: true, encoding: "utf8" });
    if (encoded.status !== 0) throw new Error(encoded.error?.message || encoded.stderr);
    console.log("Encoded provider-tour.gif");
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) await command("Browser.close").catch(() => {});
  ws?.close();
  for (const child of [browser, server]) {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), pause(2000)]);
    }
  }
  // Only this run's mkdtemp directory is removed; never use an existing browser profile.
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
