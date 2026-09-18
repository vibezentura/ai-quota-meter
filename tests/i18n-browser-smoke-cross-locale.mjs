// Regression check for a bug class neither i18n-browser-smoke.mjs (Arabic
// only, always via English) nor i18n-browser-smoke-ltr.mjs (English<->French,
// English<->German, never each other) ever exercised: switching directly
// between two NON-English locales (Arabic->German, German->French, ...)
// without passing back through English in between.
//
// Root cause this guards against: translateTextNode/translateElementAttributes
// in i18n.js used to assume "whatever is currently on screen" was safe to
// treat as the true English source the moment the target locale wasn't "en".
// That was only true when the previous state was English — true for a
// two-locale (en/ar) app, false the moment a third locale exists. Switching
// Arabic -> German fed Arabic text into rule tables keyed by English source
// strings, which cannot match, so the text silently stayed Arabic — and the
// bug permanently overwrote the cached "original" with that Arabic text too,
// so even switching back to English afterward would not have recovered the
// real original for the affected nodes. Reported via a mixed
// German/Arabic screenshot of the Settings dialog; confirmed via temporary
// console instrumentation before being fixed.
//
// Not run by the unit test glob; starts Chrome and expects the local server.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const browserPath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const value = probe.address().port; probe.close(() => resolve(value)); });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root, stdio: "ignore", windowsHide: true,
  env: { ...process.env, AI_QUOTA_METER_HOST: "127.0.0.1", AI_QUOTA_METER_PORT: String(port), AI_QUOTA_METER_OPEN: "0", AI_QUOTA_METER_USAGE_FILE: "" },
});
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* Server is starting. */ }
  if (attempt === 79) throw new Error("Local test server did not become ready.");
  await wait(100);
}
const temporary = await mkdtemp(path.join(os.tmpdir(), "aqm-i18n-cross-smoke-"));
const browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${temporary}`, "--no-first-run", "about:blank"], { stdio: "ignore", windowsHide: true });

// Static header/chrome attributes that persist across renders (never
// recreated by render()), the exact class of element the bug affected —
// verified directly against the user's real repro log, which showed these
// same strings stuck in Arabic after switching to German.
// English/German/French expected values come from this project's own
// catalogs (typed and already covered by the parity tests), so they're
// trustworthy to hardcode here. The Arabic expected value is instead
// captured live from the page's own cold-start render just below \u2014 safer
// than hand-transcribing Arabic Unicode escapes into this file by hand.
const CHECKS = [
  { selector: "a.brand", attribute: "aria-label", en: "AI Quota Meter home", de: "AI Quota Meter Startseite", fr: "Accueil d\u2019AI Quota Meter" },
  { selector: "#refresh-button", attribute: "aria-label", en: "Refresh all usage", de: "Gesamte Nutzung aktualisieren", fr: "Actualiser toute l\u2019utilisation" },
  { selector: "#provider-filter", attribute: "aria-label", en: "Provider lane", de: "Anbieterfilter", fr: "Filtre par fournisseur" },
  { selector: ".local-trust-label", attribute: "aria-label", en: "Local-only privacy", de: "Ausschlie\u00dflich lokaler Datenschutz", fr: "Confidentialit\u00e9 strictement locale" },
];

try {
  let devtoolsPort;
  for (let attempt = 0; attempt < 80 && !devtoolsPort; attempt += 1) {
    try { devtoolsPort = (await readFile(path.join(temporary, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { /* Browser is starting. */ }
    await wait(100);
  }
  if (!devtoolsPort) throw new Error("Chrome debugging port did not become ready.");
  const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json();
  const socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  };
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const readAttributes = () => evaluate(`(${JSON.stringify(CHECKS.map((c) => ({ selector: c.selector, attribute: c.attribute })))}).map(({selector, attribute}) => document.querySelector(selector)?.getAttribute(attribute))`);

  await command("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('quota-local:language:v1','ar');" });
  await command("Page.navigate", { url: `${origin}/?demo=1` });
  for (let attempt = 0; attempt < 80 && !(await evaluate("document.querySelectorAll('.account-card').length > 0")); attempt += 1) await wait(100);

  // Captured live rather than hand-transcribed: this is the ground truth for
  // "ar" further down. Sanity-checked only for "not still English" and
  // "contains Arabic script" — the Arabic browser smoke test already
  // verifies these specific strings translate correctly on cold start; this
  // script's job is what happens on the NEXT switch, not the first one.
  const initial = await readAttributes();
  const arabicExpected = {};
  CHECKS.forEach((check, i) => {
    if (initial[i] === check.en || !/[؀-ۿ]/.test(initial[i] ?? "")) {
      throw new Error(`Cold start into Arabic: ${check.selector}[${check.attribute}] does not look translated, got ${JSON.stringify(initial[i])}`);
    }
    arabicExpected[check.selector] = initial[i];
  });

  // Match the reported repro: open the Settings dialog (a persistent,
  // never-torn-down subtree) before switching, so translateElementAttributes
  // has to re-translate elements that are still showing Arabic in place.
  await evaluate("document.querySelector('#vault-button').click()");
  await wait(150);

  // Chain THREE direct non-English -> non-English switches: ar -> de -> fr
  // -> ar. Every hop here skips English entirely, which is exactly the
  // transition the original bug never handled correctly.
  const chain = [
    { to: "de", expectKey: "de" },
    { to: "fr", expectKey: "fr" },
    { to: "ar", expectKey: "ar" },
  ];
  for (const { to, expectKey } of chain) {
    await evaluate(`(() => {
      const select = document.querySelector('#settings-dialog .language-select');
      select.value = '${to}';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await wait(200);
    const values = await readAttributes();
    CHECKS.forEach((check, i) => {
      const expected = expectKey === "ar" ? arabicExpected[check.selector] : check[expectKey];
      if (values[i] !== expected) {
        throw new Error(`After switching to ${to}: ${check.selector}[${check.attribute}] expected ${JSON.stringify(expected)}, got ${JSON.stringify(values[i])} (leftover from a previous locale if this doesn't match)`);
      }
    });
  }

  // Full circle: after chaining through de/fr/ar with no English in between,
  // switching back to English must still restore the REAL original text —
  // proving textOriginal/attributeOriginal were never permanently
  // overwritten with non-English text anywhere along the chain.
  await evaluate(`(() => {
    const select = document.querySelector('#settings-dialog .language-select');
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await wait(200);
  const restored = await readAttributes();
  CHECKS.forEach((check, i) => {
    if (restored[i] !== check.en) {
      throw new Error(`English restore after ar->de->fr->ar->en chain failed: ${check.selector}[${check.attribute}] expected ${JSON.stringify(check.en)}, got ${JSON.stringify(restored[i])}`);
    }
  });

  process.stdout.write("Cross-locale (non-English -> non-English) switching smoke passed: ar -> de -> fr -> ar -> en, all with Settings open.\n");
  await command("Browser.close");
  socket.close();
} finally {
  if (browser.exitCode === null) browser.kill();
  if (server.exitCode === null) server.kill();
  await wait(300);
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
