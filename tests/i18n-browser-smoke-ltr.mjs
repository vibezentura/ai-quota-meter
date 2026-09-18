// Manual browser-level localization regression check for the LTR languages
// (French, German). Mirrors tests/i18n-browser-smoke.mjs's mechanism but
// drops every RTL-specific geometry assertion (direction, mirrored icons,
// logical-edge alignment) — those only apply to Arabic. What stays: cold
// start, zero provider requests, translation completeness per dialog, and
// live-switch state preservation. Not run by the unit test glob; starts
// Chrome and expects the local server, same as the Arabic script.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AI_QUOTA_LOCALE_DE } from "../locales-de.js";
import { AI_QUOTA_LOCALE_EN } from "../locales-en.js";
import { AI_QUOTA_LOCALE_FR } from "../locales-fr.js";

const LOCALES = [
  { code: "fr", title: AI_QUOTA_LOCALE_FR["dashboard.title"], addLabel: AI_QUOTA_LOCALE_FR["action.add"] },
  { code: "de", title: AI_QUOTA_LOCALE_DE["dashboard.title"], addLabel: AI_QUOTA_LOCALE_DE["action.add"] },
];

// The Arabic smoke test's "any run of 4+ Latin letters is suspect" filter
// only works because Arabic script never produces a false match. French and
// German are Latin-script too, so a correctly translated sentence trips that
// same filter as often as a leftover English one. Check for actual English
// instead: the 130 static catalog values plus a curated set of fragments
// known to appear only in still-English composed template strings (the
// AI_QUOTA_FRAGMENTS/PATTERNS "from" side in i18n.js). This can't prove
// every composed string translated correctly, but it does prove none of them
// were skipped outright.
const ENGLISH_NEEDLES = [
  ...new Set(Object.values(AI_QUOTA_LOCALE_EN)),
  "Weekly", "5-hour", "ready to go", "RUNNING LOW", "READY TO GO", "SESSION ACTIVE",
  "Credits available", "Granted", "Topped up", "refreshes", "readings", "requests", "tokens",
  "Charts & data", "Imported key usage", "this session", "last session", "holds back",
  "recorded usage in the last", "peak", "currency", "currencies", "Refills in",
  "Checked ", " ago", "may go unused", " left", "tracked refreshes", "projected unused at reset",
  "Never synced", "Just now", "verified API key", "legacy profile", "Fictional demo profile",
  "before reset", "at reset", "since previous",
];

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
const temporary = await mkdtemp(path.join(os.tmpdir(), "aqm-i18n-ltr-smoke-"));
const browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${temporary}`, "--no-first-run", "about:blank"], { stdio: "ignore", windowsHide: true });

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
  const providerRequests = [];
  const exceptions = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === "Network.requestWillBeSent" && message.params.request.url.includes("/api/providers/")) providerRequests.push(message.params.request.url);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
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
  await command("Network.enable");
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // "Editor" is the demo DeepSeek key label (demo-data.js) — deliberately
  // untranslated user data, marked data-i18n-skip — and substring-matches
  // the "Edit" needle. "SESSION ACTIVE"/"Session active" is a genuine
  // French/English cognate (correct native French, not a missed
  // translation); German has no such overlap so it stays a real needle
  // there. Neither is a translation gap — both are expected exceptions to
  // strip before checking, the same way the Arabic script excludes "Editor"
  // from its own leftover-English line filter.
  const KNOWN_SAFE_LEFTOVERS = ["Editor"];
  // "All" is a short, generic needle that collides with its own correct
  // translation as a substring ("Alle" contains "All") rather than marking
  // a real leftover — same class of false positive as the fr exclusions
  // above, just from word-substring overlap instead of a shared cognate.
  const LOCALE_NEEDLE_EXCLUSIONS = { fr: ["SESSION ACTIVE", "Session active", "Sessions"], de: ["All", "optional"] };

  for (const { code, title, addLabel } of LOCALES) {
    const needlesJson = JSON.stringify(ENGLISH_NEEDLES.filter((needle) => !(LOCALE_NEEDLE_EXCLUSIONS[code] ?? []).includes(needle)));
    const safeJson = JSON.stringify(KNOWN_SAFE_LEFTOVERS);
    const remainingExpression = `(selector) => {
      const needles = ${needlesJson};
      const safe = ${safeJson};
      let text = document.querySelector(selector).innerText;
      for (const value of safe) text = text.replaceAll(value, '');
      return needles.filter((needle) => text.includes(needle));
    }`;
    await command("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('quota-local:language:v1','${code}');` });
    await command("Page.navigate", { url: `${origin}/?demo=1` });
    for (let attempt = 0; attempt < 80 && !(await evaluate("document.querySelectorAll('.account-card').length > 0")); attempt += 1) await wait(100);

    const initial = await evaluate(`({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title: document.querySelector('#accounts-heading').textContent,
      cards: document.querySelectorAll('.account-card').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      selectors: [...document.querySelectorAll('.language-select')].map((select) => select.value),
      remainingEnglish: (() => {
        const safe = ${safeJson};
        let text = document.body.innerText;
        for (const value of safe) text = text.replaceAll(value, '');
        return (${needlesJson}).filter((needle) => text.includes(needle));
      })(),
      remainingEnglishAttributes: (() => {
        const needles = ${needlesJson};
        const values = [...document.querySelectorAll('[aria-label], [title], [placeholder]')]
          .filter((element) => !element.closest('[data-i18n-skip]'))
          .flatMap((element) => ['aria-label', 'title', 'placeholder'].map((name) => element.getAttribute(name)).filter(Boolean));
        return needles.filter((needle) => values.some((value) => value.includes(needle)));
      })()
    })`);
    if (initial.lang !== code || initial.dir !== "ltr" || initial.title !== title) throw new Error(`[${code}] startup failed: ${JSON.stringify(initial)}`);
    if (initial.cards !== 4 || initial.overflow > 0 || initial.selectors.some((value) => value !== code) || initial.remainingEnglish.length || initial.remainingEnglishAttributes.length) {
      throw new Error(`[${code}] layout/state failed: ${JSON.stringify(initial)}`);
    }

    // Long German compound words are the real risk for an LTR language (no
    // RTL reflow to check, but overflow from word length is just as real).
    await command("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
    await wait(100);
    const narrow = await evaluate(`({
      overflow: document.documentElement.scrollWidth - innerWidth,
      width: innerWidth,
      offenders: [...document.querySelectorAll('body *')].map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ element, rect }) => rect.width && getComputedStyle(element).position !== 'fixed' && (rect.left < -1 || rect.right > innerWidth + 1))
        .slice(0, 12).map(({ element, rect }) => ({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }))
    })`);
    if (narrow.width !== 320 || narrow.overflow > 0) throw new Error(`[${code}] narrow layout overflowed: ${JSON.stringify(narrow)}`);
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await wait(100);

    await evaluate("document.querySelector('#add-account-button').click()");
    await wait(100);
    const vaultEnglish = await evaluate(`(${remainingExpression})('#vault-dialog')`);
    const preserved = await evaluate(`(() => {
      const input = document.querySelector('#vault-passphrase');
      input.value = 'do not lose this value';
      window.__languageInput = input;
      const select = document.querySelector('.compact-language-row .language-select');
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!preserved) throw new Error(`[${code}] could not trigger language switch.`);
    await wait(100);
    const final = await evaluate(`({
      sameNode: window.__languageInput === document.querySelector('#vault-passphrase'),
      value: document.querySelector('#vault-passphrase').value,
      dialogOpen: document.querySelector('#vault-dialog').open,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title: document.querySelector('#accounts-heading').textContent
    })`);
    if (!final.sameNode || final.value !== "do not lose this value" || !final.dialogOpen) throw new Error(`[${code}] form state was lost: ${JSON.stringify(final)}`);
    if (final.lang !== "en" || final.dir !== "ltr" || final.title !== "Your usage") throw new Error(`[${code}] English restore failed: ${JSON.stringify(final)}`);

    await evaluate(`(() => {
      const select = document.querySelector('.compact-language-row .language-select');
      select.value = '${code}'; select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#vault-passphrase').value = 'localization test';
      document.querySelector('#vault-passphrase-confirm').value = 'localization test';
      document.querySelector('#vault-form').requestSubmit();
    })()`);
    for (let attempt = 0; attempt < 80 && !(await evaluate("document.querySelector('#account-dialog').open")); attempt += 1) await wait(100);
    const accountEnglish = await evaluate(`(${remainingExpression})('#account-dialog')`);
    await evaluate("document.querySelector('[name=\"provider\"][value=\"deepseek\"]').click()");
    await wait(50);
    const deepseekEnglish = await evaluate(`(${remainingExpression})('#account-dialog')`);
    await evaluate("document.querySelector('[data-close-dialog=\"account-dialog\"]').click(); document.querySelector('#vault-button').click()");
    await wait(100);
    const settingsEnglish = await evaluate(`(${remainingExpression})('#settings-dialog')`);
    const settingsAddLabel = await evaluate("document.querySelector('#settings-add-button').textContent.trim()");
    if (settingsAddLabel !== addLabel) throw new Error(`[${code}] Settings Add button was not translated: ${JSON.stringify(settingsAddLabel)}`);
    await evaluate("document.querySelector('[data-close-dialog=\"settings-dialog\"]').click(); document.querySelector('[data-expand-ledger=\"claude-a\"]').click()");
    await wait(100);
    const chartEnglish = await evaluate(`(${remainingExpression})('#ledger-detail-dialog')`);
    await evaluate("document.querySelector('[data-close-dialog=\"ledger-detail-dialog\"]').click()");

    const fileUrl = `${pathToFileURL(path.resolve("index.html")).href}?demo=1`;
    await command("Page.navigate", { url: fileUrl });
    for (let attempt = 0; attempt < 80 && !(await evaluate("document.querySelectorAll('.account-card').length > 0")); attempt += 1) await wait(100);
    const offline = await evaluate("({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.querySelector('#accounts-heading').textContent, cards: document.querySelectorAll('.account-card').length })");
    if (offline.lang !== code || offline.dir !== "ltr" || offline.title !== title || offline.cards !== 4) throw new Error(`[${code}] offline startup failed: ${JSON.stringify(offline)}`);

    const untranslated = { vaultEnglish, accountEnglish, deepseekEnglish, settingsEnglish, chartEnglish };
    if (Object.values(untranslated).some((lines) => lines.length)) throw new Error(`[${code}] untranslated UI: ${JSON.stringify(untranslated)}`);
    process.stdout.write(`[${code}] passed: ${JSON.stringify({ initial, narrow, settingsAddLabel, offline })}\n`);
  }

  if (providerRequests.length || exceptions.length) throw new Error(JSON.stringify({ providerRequests, exceptions }));
  process.stdout.write("LTR localization browser smoke passed for: " + LOCALES.map((l) => l.code).join(", ") + "\n");
  await command("Browser.close");
  socket.close();
} finally {
  if (browser.exitCode === null) browser.kill();
  if (server.exitCode === null) server.kill();
  await wait(300);
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
