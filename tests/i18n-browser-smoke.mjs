// Manual browser-level localization regression check. The unit test glob does
// not run this file because it starts Chrome and expects the local server.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const temporary = await mkdtemp(path.join(os.tmpdir(), "aqm-i18n-smoke-"));
const browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${temporary}`, "--no-first-run", "about:blank"], { stdio: "ignore", windowsHide: true });

try {
  let port;
  for (let attempt = 0; attempt < 80 && !port; attempt += 1) {
    try { port = (await readFile(path.join(temporary, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { /* Browser is starting. */ }
    await wait(100);
  }
  if (!port) throw new Error("Chrome debugging port did not become ready.");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('quota-local:language:v1','ar');" });
  await command("Page.navigate", { url: `${origin}/?demo=1` });
  for (let attempt = 0; attempt < 80 && !(await evaluate("document.querySelectorAll('.account-card').length > 0")); attempt += 1) await wait(100);

  const initial = await evaluate(`({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    title: document.querySelector('#accounts-heading').textContent,
    cards: document.querySelectorAll('.account-card').length,
    overflow: document.documentElement.scrollWidth - innerWidth,
    selectors: [...document.querySelectorAll('.language-select')].map((select) => select.value),
    remainingEnglish: [...document.body.innerText.split('\\n')]
      .map((line) => line.trim()).filter((line) => !['Editor', 'AFRICA/CAIRO'].includes(line))
      .map((line) => line.replace(/Claude|Codex|DeepSeek|AI Quota Meter|Anthropic|PBKDF2-HMAC-SHA256|amount|API|CSV|AES|USD|UTC|TLS|JSON|CLI|English|Français|Deutsch/g, ''))
      .filter((line) => /[A-Za-z]{4}/.test(line)).slice(0, 30),
    remainingEnglishAttributes: [...document.querySelectorAll('[aria-label], [title], [placeholder]')]
      .filter((element) => !element.closest('[data-i18n-skip]'))
      .flatMap((element) => ['aria-label', 'title', 'placeholder'].map((name) => element.getAttribute(name)).filter(Boolean))
      .map((value) => value.replace(/Claude|Codex|DeepSeek|AI Quota Meter|API|CSV|AES|USD|UTC|TLS|CLI/g, ''))
      .filter((value) => /[A-Za-z]{4}/.test(value)).slice(0, 30)
  })`);
  if (initial.lang !== "ar" || initial.dir !== "rtl" || initial.title !== "استخدامك") throw new Error(`Arabic startup failed: ${JSON.stringify(initial)}`);
  if (initial.cards !== 4 || initial.overflow > 0 || initial.selectors.some((value) => value !== "ar") || initial.remainingEnglish.length || initial.remainingEnglishAttributes.length) throw new Error(`Arabic layout/state failed: ${JSON.stringify(initial)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
  await wait(100);
  const narrow = await evaluate(`({
    overflow: document.documentElement.scrollWidth - innerWidth,
    width: innerWidth,
    offenders: [...document.querySelectorAll('body *')].map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => rect.width && getComputedStyle(element).position !== 'fixed' && (rect.left < -1 || rect.right > innerWidth + 1))
      .slice(0, 12).map(({ element, rect }) => ({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }))
  })`);
  if (narrow.width !== 320 || narrow.overflow > 0) throw new Error(`Arabic narrow layout overflowed: ${JSON.stringify(narrow)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(100);

  await evaluate("document.querySelector('#add-account-button').click()");
  await wait(100);
  const remainingExpression = `(selector) => [...document.querySelector(selector).innerText.split('\\n')]
    .map((line) => line.trim()).filter((line) => !['Editor', 'AFRICA/CAIRO'].includes(line))
    .map((line) => line.replace(/Claude|Codex|DeepSeek|AI Quota Meter|Anthropic|PBKDF2-HMAC-SHA256|amount|API|CSV|AES|TLS|JSON|CLI|English|Français|Deutsch/g, ''))
    .filter((line) => /[A-Za-z]{4}/.test(line))`;
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
  if (!preserved) throw new Error("Could not trigger language switch.");
  await wait(100);
  const final = await evaluate(`({
    sameNode: window.__languageInput === document.querySelector('#vault-passphrase'),
    value: document.querySelector('#vault-passphrase').value,
    dialogOpen: document.querySelector('#vault-dialog').open,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    title: document.querySelector('#accounts-heading').textContent
  })`);
  if (!final.sameNode || final.value !== "do not lose this value" || !final.dialogOpen) throw new Error(`Form state was lost: ${JSON.stringify(final)}`);
  if (final.lang !== "en" || final.dir !== "ltr" || final.title !== "Your usage") throw new Error(`English restore failed: ${JSON.stringify(final)}`);
  await evaluate(`(() => {
    const select = document.querySelector('.compact-language-row .language-select');
    select.value = 'ar'; select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#vault-passphrase').value = 'localization test';
    document.querySelector('#vault-passphrase-confirm').value = 'localization test';
    document.querySelector('#vault-form').requestSubmit();
  })()`);
  for (let attempt = 0; attempt < 80 && !(await evaluate("document.querySelector('#account-dialog').open")); attempt += 1) await wait(100);
  const accountEnglish = await evaluate(`(${remainingExpression})('#account-dialog')`);
  const reserveFieldLayout = await evaluate(`(() => {
    const details = document.querySelector('[data-provider-fields="claude"] .advanced-options');
    details.open = true;
    const input = details.querySelector('[name="claudeReserve"]');
    const suffix = input.nextElementSibling;
    const inputStyle = getComputedStyle(input);
    const suffixStyle = getComputedStyle(suffix);
    const inputRect = input.getBoundingClientRect();
    const suffixRect = suffix.getBoundingClientRect();
    return {
      direction: inputStyle.direction,
      textAlign: inputStyle.textAlign,
      paddingRight: parseFloat(inputStyle.paddingRight),
      verticallyCentered: Math.abs((inputRect.top + inputRect.height / 2) - (suffixRect.top + suffixRect.height / 2)) < 1
    };
  })()`);
  if (reserveFieldLayout.direction !== "ltr" || reserveFieldLayout.textAlign !== "right" || reserveFieldLayout.paddingRight < 30 || !reserveFieldLayout.verticallyCentered) {
    throw new Error(`Arabic reserve suffix layout failed: ${JSON.stringify(reserveFieldLayout)}`);
  }
  await evaluate("document.querySelector('[name=\"provider\"][value=\"deepseek\"]').click()");
  await wait(50);
  const deepseekEnglish = await evaluate(`(${remainingExpression})('#account-dialog')`);
  await evaluate("document.querySelector('[data-close-dialog=\"account-dialog\"]').click(); document.querySelector('#vault-button').click()");
  await wait(100);
  const settingsEnglish = await evaluate(`(${remainingExpression})('#settings-dialog')`);
  const settingsAddLabel = await evaluate("document.querySelector('#settings-add-button').textContent.trim()");
  if (settingsAddLabel !== "+ إضافة") throw new Error(`Settings Add button was not translated: ${JSON.stringify(settingsAddLabel)}`);
  const languageIcon = await evaluate(`(() => {
    const icon = document.querySelector('#settings-dialog .language-row-copy > svg');
    const rect = icon?.getBoundingClientRect();
    return { found: Boolean(icon), decorative: icon?.getAttribute('aria-hidden'), width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0) };
  })()`);
  if (!languageIcon.found || languageIcon.decorative !== "true" || languageIcon.width < 20 || languageIcon.height < 20) {
    throw new Error(`Settings language icon failed: ${JSON.stringify(languageIcon)}`);
  }
  const settingsActionAlignment = await evaluate(`(() => {
    const button = document.querySelector('#export-vault-button');
    const copy = button.querySelector(':scope > span');
    const action = button.querySelector(':scope > b');
    const buttonRect = button.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    return {
      direction: getComputedStyle(button).direction,
      textAlign: getComputedStyle(copy).textAlign,
      copyStartGap: Math.round(buttonRect.right - copyRect.right),
      actionEndGap: Math.round(actionRect.left - buttonRect.left)
    };
  })()`);
  if (settingsActionAlignment.direction !== "rtl" || settingsActionAlignment.copyStartGap > 20 || settingsActionAlignment.actionEndGap > 20) {
    throw new Error(`Arabic settings actions are not aligned to their logical edges: ${JSON.stringify(settingsActionAlignment)}`);
  }
  await evaluate("document.querySelector('[data-close-dialog=\"settings-dialog\"]').click(); document.querySelector('[data-expand-ledger=\"claude-a\"]').click()");
  await wait(100);
  const chartEnglish = await evaluate(`(${remainingExpression})('#ledger-detail-dialog')`);
  const fileUrl = `${pathToFileURL(path.resolve("index.html")).href}?demo=1`;
  await command("Page.navigate", { url: fileUrl });
  for (let attempt = 0; attempt < 80 && !(await evaluate("document.querySelectorAll('.account-card').length > 0")); attempt += 1) await wait(100);
  const offline = await evaluate("({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.querySelector('#accounts-heading').textContent, cards: document.querySelectorAll('.account-card').length })");
  if (offline.lang !== "ar" || offline.dir !== "rtl" || offline.title !== "استخدامك" || offline.cards !== 4) throw new Error(`Offline Arabic startup failed: ${JSON.stringify(offline)}`);
  if (providerRequests.length || exceptions.length) throw new Error(JSON.stringify({ providerRequests, exceptions }));
  const untranslated = { vaultEnglish, accountEnglish, deepseekEnglish, settingsEnglish, chartEnglish };
  if (Object.values(untranslated).some((lines) => lines.length)) throw new Error(`Untranslated UI: ${JSON.stringify(untranslated)}`);
  process.stdout.write(`Localization browser smoke passed: ${JSON.stringify({ initial, narrow, final, reserveFieldLayout, settingsAddLabel, languageIcon, settingsActionAlignment, offline, untranslated })}\n`);
  await command("Browser.close");
  socket.close();
} finally {
  if (browser.exitCode === null) browser.kill();
  if (server.exitCode === null) server.kill();
  await wait(300);
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
