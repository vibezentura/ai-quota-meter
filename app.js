import { LocalEncryptedVault } from "./crypto-vault.js";
import { createDemoData } from "./demo-data.js";
import { summarizeDeepSeekAmountCsv } from "./deepseek-usage.js";
import { AI_QUOTA_LOCALE_EN } from "./locales-en.js";
import { AI_QUOTA_LOCALE_AR } from "./locales-ar.js";
import { AI_QUOTA_LOCALE_FR } from "./locales-fr.js";
import { AI_QUOTA_LOCALE_DE } from "./locales-de.js";
import { createAiQuotaLocalization } from "./i18n.js";
import {
  SESSION_GAP_MINUTES,
  balanceSeries,
  burnRate,
  computeIntervals,
  groupSessions,
  intervalsInRange,
  layoutBars,
  ledgerRows,
  ledgerTotals,
  projectX,
  readLedger,
  recordRefresh,
  refreshRows,
  scalePoints,
  summarizeAccount,
  toCsv,
  windowSeries,
  withMeasuredBurnRates,
} from "./refresh-ledger.js";
import {
  buildResetTimeline,
  classifyWindows,
  enrichWindow,
  evaluateAccount,
  formatCountdown,
  validateUsageDocument,
} from "./usage-core.js";

const encryptedVault = new LocalEncryptedVault();
const localization = createAiQuotaLocalization({ en: AI_QUOTA_LOCALE_EN, ar: AI_QUOTA_LOCALE_AR, fr: AI_QUOTA_LOCALE_FR, de: AI_QUOTA_LOCALE_DE });
// The "quota-local:" prefix on every key below is the app's old name and is
// deliberately NOT renamed to match the rebrand to AI Quota Meter — these are
// localStorage key *names*, not display text. Renaming one silently orphans
// whatever a real user already has stored under it: the app would look under
// a new key, find nothing, and the vault (or a remembered sign-in, or a
// theme choice) would appear to have vanished even though the old data is
// still sitting right there in the browser. Same class of trap as the
// %LOCALAPPDATA%\QuotaLocal folder name in server.mjs — a stable identifier
// beats a stable name once real data is keyed on it.
const REMEMBER_STORAGE_KEY = "quota-local:remember-key:v1";
const MASK_EMAIL_STORAGE_KEY = "quota-local:mask-email:v1";
// Also hardcoded in theme-boot.js, which has to read it before this
// bundle is parsed — change both together (and never the string itself).
const THEME_STORAGE_KEY = "quota-local:theme:v1";
const PROVIDER_LANE_STORAGE_KEY = "quota-local:provider-lane:v1";
const LEDGER_RANGE_STORAGE_KEY = "quota-local:ledger-range:v1";
const state = {
  document: { schemaVersion: 1, mode: "empty", accounts: [], generatedAt: new Date().toISOString() },
  source: "loading",
  // The dashboard controls used to be <select>s read straight off the
  // DOM. They are segmented pill groups now, so their value lives here and
  // the pressed state is painted from it — one source of truth either way.
  // Both persist across reloads (see PILL_CONTROLS' storageKey below)
  // — a stored value is validated against the known-good set before use,
  // the same way ACCOUNT_COLORS.includes(...) guards a stale/corrupted
  // colour elsewhere, so a hand-edited or future-format localStorage value
  // can never leave a pill group pressed on something nothing matches.
  providerLane: ["all", "claude", "codex", "deepseek"].includes(localStorage.getItem(PROVIDER_LANE_STORAGE_KEY))
    ? localStorage.getItem(PROVIDER_LANE_STORAGE_KEY) : "all",
  localConnector: false,
  vaultData: null,
  demoMode: false,
  openAccountAfterUnlock: false,
  pendingUsageAccountId: null,
  previewActive: false,
  pendingProfileKey: null,
  ledgerRangeHours: [6, 24, 168].includes(Number(localStorage.getItem(LEDGER_RANGE_STORAGE_KEY)))
    ? Number(localStorage.getItem(LEDGER_RANGE_STORAGE_KEY)) : 24,
  ledgerDetailAccountId: null,
  // Deliberately not persisted — this is the Charts & data dialog's own
  // range, scoped to whichever account it was last opened for, not a
  // dashboard-wide preference like the three above.
  detailRange: "24",
  relinkAccountId: null,
  renameAccountId: null,
  languageSwitching: false,
  // Incremented whenever a sign-in wait should stop (dialog closed, provider
  // switched, a new attempt started). A poll loop compares the token it
  // started with against this and exits if they no longer match, so a
  // cancelled wait can never revive a dialog the user has moved on from.
  signInToken: 0,
  // A display-only preference, not vault data: it applies before any vault
  // is unlocked and should not force a re-encrypt just to flip a checkbox.
  maskEmail: localStorage.getItem(MASK_EMAIL_STORAGE_KEY) === "1",
  // "system" | "dark" | "light". Same reasoning as maskEmail — a theme is not
  // vault content, and has to work on the lock screen before anything is
  // decrypted.
  theme: localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light"
    : localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "system",
};

const elements = Object.fromEntries([
  "account-dialog", "account-dialog-status", "account-dialog-title", "account-form", "accounts-grid",
  "add-account-button", "account-color-picker", "rename-color-picker", "capacity-list", "chart-tooltip", "configured-accounts", "confirm-passphrase-field",
  "theme-button", "theme-select",
  "cli-command-row-a", "cli-command-label-a", "cli-login-command-a", "cli-command-row-b", "cli-command-label-b", "cli-login-command-b",
  "cli-command-row-c", "cli-command-label-c", "cli-login-command-c",
  "cli-setup-copy", "cli-setup-result", "cli-setup-title",
  "signin-spinner", "signin-reopen-button", "signin-manual-toggle", "signin-manual",
  "relink-spinner", "relink-step-title", "relink-step-copy", "relink-manual-toggle", "relink-manual",
  "deepseek-security-banner", "deepseek-security-copy", "deepseek-usage-input", "delete-vault-button", "explore-demo-button",
  "export-vault-button", "demo-note",
  "import-snapshot-button", "import-vault-button", "ledger-detail-body", "ledger-detail-dialog",
  "ledger-detail-export", "ledger-detail-subtitle", "ledger-detail-title",
  "ledger-footnote", "ledger-grid", "ledger-totals", "lock-vault-button", "mask-email-toggle",
  "relink-command-row-a", "relink-command-label-a", "relink-command-a",
  "relink-command-row-b", "relink-command-label-b", "relink-command-b",
  "relink-command-row-c", "relink-command-label-c", "relink-command-c",
  "relink-dialog", "relink-lead", "relink-status", "relink-title", "relink-verify-button",
  "rename-dialog", "rename-dialog-meta", "rename-dialog-title", "rename-dialog-status",
  "rename-form", "rename-input", "rename-save-button",
  "refresh-button", "save-account-button",
  "security-summary", "settings-add-button", "settings-dialog", "settings-dialog-status",
  "sign-out-button", "snapshot-input", "timeline-list", "timezone-chip", "vault-button", "vault-dialog",
  "vault-dialog-lead", "vault-dialog-status", "vault-dialog-title", "vault-form", "vault-import-input",
  "vault-lock-state", "vault-passphrase", "vault-passphrase-confirm", "vault-remember", "vault-submit-button",
].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

elements.mask_email_toggle.checked = state.maskEmail;

const lightSchemeQuery = window.matchMedia("(prefers-color-scheme: light)");

// What the user is actually looking at, which is not the same as their choice:
// "system" resolves to whatever the OS is currently asking for.
function effectiveTheme() {
  return state.theme === "system" ? (lightSchemeQuery.matches ? "light" : "dark") : state.theme;
}

// The stylesheet does the work; this only decides whether to pin an explicit
// data-theme (overriding the OS) or remove it and let the media query apply.
function applyTheme() {
  const effective = effectiveTheme();
  if (state.theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;

  // Which icon shows is left entirely to CSS, driven by the same cascade as
  // the palette — so the icon cannot disagree with the colours on screen.
  // Doing it here in JS was in fact broken: `hidden` is an HTMLElement IDL
  // property and an <svg> is an SVGElement, so `svg.hidden = true` quietly
  // set a JS expando instead of the content attribute, and both icons stayed
  // visible. Only the label, which CSS cannot set, is updated here.
  const label = effective === "dark" ? "Switch to light theme" : "Switch to dark theme";
  elements.theme_button.setAttribute("aria-label", label);
  elements.theme_button.title = label;
  elements.theme_select.value = state.theme;
}

function setTheme(choice) {
  state.theme = choice;
  if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
  else localStorage.setItem(THEME_STORAGE_KEY, choice);
  applyTheme();
}

// One click always lands on an explicit theme — the opposite of what is on
// screen. "Match system" is reachable from the Display settings instead,
// because a three-way cycle on a single icon is not guessable.
elements.theme_button.addEventListener("click", () => {
  setTheme(effectiveTheme() === "dark" ? "light" : "dark");
});
elements.theme_select.addEventListener("change", () => setTheme(elements.theme_select.value));
// Only matters while following the OS, but the icon would otherwise go stale
// the moment the system flips to night mode with the dashboard open.
lightSchemeQuery.addEventListener("change", () => { if (state.theme === "system") applyTheme(); });
applyTheme();

// The dashboard's segmented controls. Each is a group of buttons
// carrying one data-* attribute; the pressed state is painted from state, so
// a control can never disagree with the value the render actually used.
// storageKey is only set on the two dashboard-wide ones — see the
// "Deliberately not persisted" note on state.detailRange for why the
// dialog's own range picker is the one exception.
const PILL_CONTROLS = [
  { attribute: "providerLane", selector: "[data-provider-lane]", storageKey: PROVIDER_LANE_STORAGE_KEY, apply: (value) => { state.providerLane = value; } },
  { attribute: "ledgerRange", selector: "[data-ledger-range]", storageKey: LEDGER_RANGE_STORAGE_KEY, apply: (value) => { state.ledgerRangeHours = Number(value) || 24; } },
  { attribute: "detailRange", selector: "[data-detail-range]", apply: (value) => { state.detailRange = value; } },
];

function pillValue(control) {
  if (control.attribute === "providerLane") return state.providerLane;
  if (control.attribute === "detailRange") return state.detailRange;
  return String(state.ledgerRangeHours);
}

function paintPills() {
  for (const control of PILL_CONTROLS) {
    const current = pillValue(control);
    document.querySelectorAll(control.selector).forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset[control.attribute] === current));
    });
  }
}

document.addEventListener("click", (event) => {
  for (const control of PILL_CONTROLS) {
    const button = event.target.closest(control.selector);
    if (!button) continue;
    const value = button.dataset[control.attribute];
    control.apply(value);
    if (control.storageKey) localStorage.setItem(control.storageKey, value);
    render();
    return;
  }
});

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function providerName(provider) {
  return ({ claude: "Claude", codex: "Codex", deepseek: "DeepSeek" })[provider] ?? provider;
}

// Provider shapes identify the service; saved accent colors distinguish profiles.
const ACCOUNT_COLORS = ["rose", "gold", "lime", "cyan", "sky", "indigo", "violet", "pink"];

function accountAccentClass(color) {
  return ACCOUNT_COLORS.includes(color) ? `account-accent-${color}` : "";
}

// Least-used colour first, so a freshly added account never lands on one
// already sitting on screen unless every colour is already spoken for —
// then the least-crowded one, tie-broken by palette order so the pick is at
// least deterministic instead of arbitrary.
function pickAutoColor(accounts, excludingAccountId = null) {
  const counts = Object.fromEntries(ACCOUNT_COLORS.map((color) => [color, 0]));
  for (const account of accounts) {
    if (account.id === excludingAccountId) continue;
    if (account.color in counts) counts[account.color] += 1;
  }
  return ACCOUNT_COLORS.reduce((best, color) => (counts[color] < counts[best] ? color : best), ACCOUNT_COLORS[0]);
}

// Shared by the add-account and edit-account dialogs. Real radio inputs
// (visually hidden via clip, not display:none) rather than a bespoke
// click-only widget, so the picker keyboard-navigates and reads out like any
// other radio group.
function updateProviderIconPreview() {
  const color = new FormData(elements.account_form).get("accentColor");
  for (const icon of elements.account_form.querySelectorAll(".provider-logo")) {
    for (const accent of ACCOUNT_COLORS) icon.classList.toggle(`account-accent-${accent}`, accent === color);
  }
}

function colorPickerMarkup(inputName, selected, provider = null) {
  const preview = provider ? `<span class="provider-monogram ${escapeHtml(provider)} ${accountAccentClass(selected)}" aria-hidden="true"></span>` : "";
  return preview + ACCOUNT_COLORS.map((color) => {
    const checked = color === selected;
    return `<label class="color-swatch"><input type="radio" name="${escapeHtml(inputName)}" value="${color}" aria-label="${escapeHtml(color)}" ${checked ? "checked" : ""}><i class="account-accent-${color}" aria-label="${escapeHtml(color)}"></i></label>`;
  }).join("");
}

function observedAge(observedAt, now = new Date()) {
  const timestamp = Date.parse(observedAt ?? "");
  if (!Number.isFinite(timestamp)) return "Never synced";
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function formatLocalTime(timestamp, timezone, options = {}) {
  try {
    return localization.date(new Date(timestamp), { timeZone: timezone, hour: "numeric", minute: "2-digit", ...options });
  } catch {
    return localization.date(new Date(timestamp), { dateStyle: "medium", timeStyle: "short" });
  }
}

// Plain-language status. The underlying values are unchanged evaluator
// output; only what a person reads is friendlier, so nothing downstream has
// to know about the wording.
function statusLabel(status) {
  return ({
    ready: "Ready to go",
    stale: "Needs a check-in",
    unknown: "Not checked yet",
    blocked: "Time to recharge",
    "near-limit": "Running low",
    conserve: "Saving weekly energy",
  })[status] ?? status;
}

function identitySummary(account) {
  const identity = account.verifiedAccount;
  if (!identity) return state.demoMode ? "Fictional demo profile" : "Unverified legacy profile";
  return [identity.email, identity.planType].filter(Boolean).join(" · ") || "CLI identity verified";
}

function mergedAccounts() {
  const configuredIds = new Set((state.vaultData?.accounts ?? []).map((account) => account.id));
  const liveEntries = (state.document.accounts ?? []).filter((account) => state.previewActive || state.demoMode || configuredIds.has(account.id));
  const byId = new Map(liveEntries.map((account) => [account.id, { ...account }]));
  for (const configured of state.vaultData?.accounts ?? []) {
    const live = byId.get(configured.id) ?? {};
    byId.set(configured.id, { ...configured, ...live, label: configured.label, weeklyReservePercent: configured.weeklyReservePercent ?? live.weeklyReservePercent });
  }
  return [...byId.values()];
}

function quotaAccounts(accounts) {
  return accounts.filter((account) => account.provider !== "deepseek" && Array.isArray(account.windows));
}

function deepSeekReady(account) {
  return Boolean(account.deepseekBalance?.is_available);
}

// showModal() makes the background inert to clicks and keyboard focus, but
// it does not stop the page itself from scrolling — a wheel event over a
// part of the dialog with nothing left to scroll just falls through to the
// document underneath. Locking body scroll while any dialog is open is the
// standard fix. Driven by each dialog's own native "close" event (attached
// once, below) rather than only from closeDialog(), so this also catches
// Escape and any other close path that bypasses that wrapper.
const ALL_DIALOGS = [
  elements.vault_dialog, elements.account_dialog, elements.rename_dialog,
  elements.relink_dialog, elements.ledger_detail_dialog, elements.settings_dialog,
];

function syncBodyScrollLock() {
  document.body.classList.toggle("modal-open", ALL_DIALOGS.some((dialog) => dialog?.open));
}

for (const dialog of ALL_DIALOGS) {
  if (!dialog) continue;
  dialog.addEventListener("close", syncBodyScrollLock);
  // Escape (or any other close path) while the cursor happens to be sitting
  // over a chart point would otherwise leave the tooltip (and, for a line
  // chart, its crosshair/ghost dot) visibly stuck on screen after the
  // dialog itself is gone — cheap enough to just do unconditionally on
  // every dialog's close, not only the ledger one's. hideChartHover is a
  // function declaration further down the file, so it is hoisted and safe
  // to reference here even though this listener is registered first — it
  // only ever runs later, once a close actually happens.
  dialog.addEventListener("close", hideChartHover);
  // A click that lands on the backdrop is dispatched with the dialog
  // element itself as the target — nothing else can be, since .dialog-shell
  // fills the dialog's box edge to edge — so this is the standard way to
  // tell "outside the dialog's own content" from a click inside it.
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(dialog); });
}

function openDialog(dialog) {
  if (dialog && !dialog.open) dialog.showModal();
  syncBodyScrollLock();
}

function closeDialog(dialog) {
  // Closing either sign-in dialog abandons any wait it started, so a login
  // finished long afterwards cannot reopen or half-fill a dialog the user
  // has already walked away from.
  if (dialog === elements.account_dialog || dialog === elements.relink_dialog) state.signInToken += 1;
  if (dialog?.open) dialog.close();
}

function showVaultDialog(mode = encryptedVault.exists() ? "unlock" : "create") {
  const creating = mode === "create";
  elements.vault_dialog.dataset.mode = mode;
  elements.vault_dialog_title.textContent = creating ? "Create your private vault" : "Unlock your private vault";
  elements.vault_dialog_lead.textContent = creating
    ? "Provider settings and API keys are encrypted with AES-256-GCM before browser storage. Your passphrase is never saved."
    : "Decrypt your account settings locally. The passphrase stays in memory only while this tab is unlocked.";
  elements.confirm_passphrase_field.hidden = !creating;
  elements.vault_passphrase_confirm.required = creating;
  elements.vault_submit_button.textContent = creating ? "Create encrypted vault" : "Unlock vault";
  elements.explore_demo_button.hidden = !creating;
  elements.vault_dialog_status.textContent = "";
  elements.vault_form.reset();
  elements.vault_remember.checked = Boolean(localStorage.getItem(REMEMBER_STORAGE_KEY));
  openDialog(elements.vault_dialog);
  queueMicrotask(() => elements.vault_passphrase.focus());
}

async function tryRememberedUnlock() {
  if (!encryptedVault.exists()) return false;
  const stored = localStorage.getItem(REMEMBER_STORAGE_KEY);
  if (!stored) return false;
  try {
    state.vaultData = await encryptedVault.unlockWithRememberKey(stored);
    return true;
  } catch {
    localStorage.removeItem(REMEMBER_STORAGE_KEY);
    return false;
  }
}

function requireUnlockedVault(nextAction = "account") {
  if (encryptedVault.isUnlocked()) return true;
  state.openAccountAfterUnlock = nextAction === "account";
  showVaultDialog();
  return false;
}

function lockVault() {
  encryptedVault.lock();
  state.vaultData = null;
  closeDialog(elements.settings_dialog);
  render();
}

async function persistVault() {
  state.vaultData = await encryptedVault.save(state.vaultData);
}

function updateProviderFields() {
  const provider = new FormData(elements.account_form).get("provider") ?? "claude";
  document.querySelectorAll("[data-provider-fields]").forEach((section) => {
    const active = section.dataset.providerFields === provider;
    section.hidden = !active;
    section.querySelectorAll("input, select, button").forEach((control) => { control.disabled = !active; });
  });
  const connectorUnavailable = !state.localConnector;
  elements.save_account_button.disabled = connectorUnavailable;
  elements.save_account_button.textContent = connectorUnavailable
    ? "Run locally to connect"
    : provider === "deepseek"
      ? "Test connection and save"
      : provider === "codex" ? "Connect Codex account" : "Connect Claude account";
  elements.deepseek_security_banner.classList.toggle("unsafe", provider === "deepseek" && !state.localConnector);
  elements.deepseek_security_copy.textContent = state.localConnector
    ? "The key is encrypted in your browser and sent only to this loopback companion, which checks DeepSeek over TLS."
    : location.protocol === "file:"
      ? "Offline file mode keeps profiles local, but live DeepSeek checks need the loopback companion. Run npm start to connect."
      : "API-key connection is disabled on hosted origins. Run this app locally to connect DeepSeek safely.";
}

// value is null, { command } (one universal shell line), or
// { powershell, cmd, bash } (Windows: none of these syntaxes are
// interoperable — pasting one into another shell silently sets nothing).
function renderCliCommand(value) {
  const rows = value?.command
    ? [["", value.command]]
    : value
      ? [["PowerShell", value.powershell], ["Command Prompt (cmd.exe)", value.cmd], ["Git Bash / MSYS / WSL", value.bash]]
      : [];
  const slots = ["a", "b", "c"];
  for (const [index, slot] of slots.entries()) {
    elements[`cli_command_label_${slot}`].textContent = rows[index]?.[0] ?? "";
    elements[`cli_login_command_${slot}`].textContent = rows[index]?.[1] ?? "";
    elements[`cli_command_row_${slot}`].hidden = !rows[index];
  }
  return rows.length > 0;
}

// Asks the companion to open a terminal already running the provider's login
// command, so nobody has to know which shell they use or paste anything. The
// copy-it-yourself commands stay available behind a link for the cases this
// cannot cover (a headless box, an unusual desktop, a locked-down terminal).
async function openSignInWindow(provider, profileKey) {
  const result = await readLocalProvider("/api/providers/profile/login", { provider, profileKey });
  return result;
}

// Polls until the provider reports a signed-in identity, so finishing the
// login in the terminal is the last thing the user has to do — there is no
// second "verify" button to come back and press, which is what made the old
// flow feel like it had two identical steps.
async function waitForSignIn(provider, profileKey, token) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    if (state.signInToken !== token) return null;
    try {
      // identityOnly keeps this cheap: it asks the local CLI who is signed in
      // and skips the provider's usage endpoint until the login has landed.
      const result = await readLocalProvider(`/api/providers/${provider}/connect`, { profileKey, identityOnly: true });
      if (state.signInToken !== token) return null;
      if (result.connected) return result;
    } catch {
      // A CLI that is mid-login can fail a status read for a moment; keep
      // waiting rather than throwing away a sign-in that is still in progress.
    }
  }
  return null;
}

// Opens the sign-in terminal and waits for it to finish. Resolves to the
// full connect result (identity plus usage windows) once the login lands, or
// null if the user cancelled, switched provider, or ran out of time — in
// which case the dialog status already explains what happened.
async function runSignInFlow(provider, profileKey) {
  const token = ++state.signInToken;
  const name = providerName(provider);
  elements.cli_setup_title.textContent = `Waiting for you to sign in to ${name}`;
  elements.cli_setup_copy.textContent = "Opening a sign-in window…";
  elements.signin_manual.hidden = true;
  elements.signin_manual_toggle.setAttribute("aria-expanded", "false");
  setSignInWaiting(true);
  elements.account_dialog_status.textContent = "";

  let launch;
  try {
    launch = await openSignInWindow(provider, profileKey);
  } catch (error) {
    setSignInWaiting(false);
    throw error;
  }
  if (state.signInToken !== token) return null;
  renderCliCommand(launch.loginCommand);

  if (launch.launched) {
    elements.cli_setup_copy.textContent = `Finish signing in to ${name} in the window that just opened. This page continues on its own — you don't need to come back and press anything.`;
  } else {
    // No terminal could be opened (headless, or an unusual desktop). Fall
    // back to the old copy-a-command path, but show it immediately rather
    // than hiding it behind a link the user has no reason to look for.
    elements.cli_setup_copy.textContent = `AI Quota Meter could not open a terminal for you. Run this command yourself, and this page will still pick it up automatically.`;
    elements.signin_manual.hidden = false;
    elements.signin_manual_toggle.setAttribute("aria-expanded", "true");
  }

  const identity = await waitForSignIn(provider, profileKey, token);
  if (state.signInToken !== token) return null;
  if (!identity) {
    setSignInWaiting(false);
    elements.cli_setup_title.textContent = `Still not signed in to ${name}`;
    elements.cli_setup_copy.textContent = "Nothing arrived in the last five minutes. Open the sign-in window again when you're ready.";
    return null;
  }

  elements.cli_setup_copy.textContent = `Signed in as ${identity.identity?.email ?? name}. Reading your limits…`;
  const result = await readLocalProvider(`/api/providers/${provider}/connect`, { profileKey });
  if (state.signInToken !== token) return null;
  setSignInWaiting(false);
  elements.cli_setup_result.hidden = true;
  return result;
}

function setSignInWaiting(waiting) {
  elements.signin_spinner.hidden = !waiting;
  elements.cli_setup_result.hidden = false;
  elements.signin_reopen_button.disabled = false;
}

// Same shape as renderCliCommand, but for the standalone relink dialog. An
// account whose stored login can no longer be renewed needs a way back
// without being deleted and re-added — deleting it would throw away its
// display name, reserve, and its whole refresh ledger.
function renderRelinkCommand(value) {
  const rows = value?.command
    ? [["", value.command]]
    : value
      ? [["PowerShell", value.powershell], ["Command Prompt (cmd.exe)", value.cmd], ["Git Bash / MSYS / WSL", value.bash]]
      : [];
  for (const [index, slot] of ["a", "b", "c"].entries()) {
    elements[`relink_command_label_${slot}`].textContent = rows[index]?.[0] ?? "";
    elements[`relink_command_${slot}`].textContent = rows[index]?.[1] ?? "";
    elements[`relink_command_row_${slot}`].hidden = !rows[index];
  }
  return rows.length > 0;
}

async function showRelinkDialog(accountId) {
  const account = state.vaultData?.accounts.find((item) => item.id === accountId);
  if (!account?.connector) return;
  state.relinkAccountId = accountId;
  state.signInToken += 1;
  elements.relink_title.textContent = `Fix ${account.label}`;
  elements.relink_lead.textContent = `${providerName(account.provider)} needs a fresh sign-in for this account. Its name, settings, and usage history all stay exactly where they are.`;
  elements.relink_status.textContent = "";
  elements.relink_step_title.textContent = "Sign in to reconnect";
  elements.relink_step_copy.textContent = "Select Open sign-in window below. Follow the steps in the window that opens — this page reconnects on its own when you're done.";
  elements.relink_spinner.hidden = true;
  elements.relink_verify_button.disabled = false;
  elements.relink_manual.hidden = true;
  elements.relink_manual_toggle.setAttribute("aria-expanded", "false");
  renderRelinkCommand(null);
  openDialog(elements.relink_dialog);
  try {
    const profile = await readLocalProvider("/api/providers/profile/prepare", {
      provider: account.provider,
      profileKey: account.connector.profileKey,
    });
    renderRelinkCommand(profile.loginCommand);
  } catch (error) {
    elements.relink_status.textContent = error instanceof Error ? error.message : "Could not read the login command for this profile.";
  }
}

// One button for the whole repair: open the sign-in window, wait for the
// login to land, then reconnect. The old version asked the user to run a
// command from step 1 and then press a separate "verify" button in step 2,
// which read as two ways of saying the same thing.
async function verifyRelink() {
  const account = state.vaultData?.accounts.find((item) => item.id === state.relinkAccountId);
  if (!account?.connector) return;
  const provider = account.provider;
  const profileKey = account.connector.profileKey;
  const token = ++state.signInToken;
  const name = providerName(provider);
  elements.relink_verify_button.disabled = true;
  elements.relink_spinner.hidden = false;
  elements.relink_status.textContent = "";
  elements.relink_step_title.textContent = `Waiting for you to sign in to ${name}`;
  elements.relink_step_copy.textContent = "Checking whether this account still needs a sign-in…";
  try {
    // A login that has quietly started working again (renewed elsewhere, or
    // fixed by hand) should not get a terminal window thrown at it.
    const existing = await readLocalProvider(`/api/providers/${provider}/connect`, { profileKey, identityOnly: true });
    if (state.signInToken !== token) return;
    if (existing.connected) {
      elements.relink_step_copy.textContent = "Already signed in. Reading your limits…";
      await refreshSubscriptionAccount(account);
      if (account.connectorError) throw new Error(account.connectorError);
      elements.relink_status.textContent = `${account.label} is reconnected.`;
      closeDialog(elements.relink_dialog);
      return;
    }

    elements.relink_step_copy.textContent = "Opening a sign-in window…";
    const launch = await openSignInWindow(provider, profileKey);
    if (state.signInToken !== token) return;
    renderRelinkCommand(launch.loginCommand);
    if (launch.launched) {
      elements.relink_step_copy.textContent = `Finish signing in to ${name} in the window that just opened. This page reconnects on its own.`;
    } else {
      elements.relink_step_copy.textContent = "AI Quota Meter could not open a terminal for you. Run this command yourself and this page will still reconnect automatically.";
      elements.relink_manual.hidden = false;
      elements.relink_manual_toggle.setAttribute("aria-expanded", "true");
    }

    const identity = await waitForSignIn(provider, profileKey, token);
    if (state.signInToken !== token) return;
    if (!identity) {
      elements.relink_step_title.textContent = `Still not signed in to ${name}`;
      elements.relink_step_copy.textContent = "Nothing arrived in the last five minutes. Try opening the sign-in window again.";
      return;
    }

    elements.relink_step_copy.textContent = "Signed in. Reading your limits…";
    await refreshSubscriptionAccount(account);
    if (account.connectorError) throw new Error(account.connectorError);
    elements.relink_status.textContent = `${account.label} is reconnected.`;
    closeDialog(elements.relink_dialog);
  } catch (error) {
    elements.relink_status.textContent = error instanceof Error ? error.message : "Could not reconnect this account.";
  } finally {
    if (state.signInToken === token) {
      elements.relink_spinner.hidden = true;
      elements.relink_verify_button.disabled = false;
    }
    render();
  }
}

// Renaming only ever touches the private local label — never the connector,
// the provider login, or the refresh ledger — so it is safe from either the
// dashboard grid or the vault's account list, with no re-verification.
function showRenameDialog(accountId) {
  const account = state.vaultData?.accounts.find((item) => item.id === accountId);
  if (!account) return;
  state.renameAccountId = accountId;
  elements.rename_dialog_meta.textContent = `${providerName(account.provider)} · ${account.verifiedAccount?.email ?? (account.provider === "deepseek" ? "API key" : "local CLI")}`;
  elements.rename_dialog_title.textContent = "Edit account";
  elements.rename_dialog_status.textContent = "";
  elements.rename_input.value = account.label;
  // A legacy account created before this feature exists has no colour yet —
  // auto-pick one on first open rather than leaving no swatch selected.
  elements.rename_color_picker.innerHTML = colorPickerMarkup("accentColor", account.color ?? pickAutoColor(state.vaultData?.accounts ?? [], accountId), account.provider);
  openDialog(elements.rename_dialog);
  queueMicrotask(() => { elements.rename_input.focus(); elements.rename_input.select(); });
}

function showAccountDialog() {
  if (!requireUnlockedVault("account")) return;
  elements.account_form.reset();
  state.pendingProfileKey = crypto.randomUUID();
  state.signInToken += 1;
  elements.cli_setup_result.hidden = true;
  elements.signin_spinner.hidden = true;
  elements.signin_manual.hidden = true;
  elements.signin_manual_toggle.setAttribute("aria-expanded", "false");
  renderCliCommand(null);
  elements.account_dialog_status.textContent = "";
  elements.account_dialog_title.textContent = "Add an account";
  elements.account_color_picker.innerHTML = colorPickerMarkup("accentColor", pickAutoColor(state.vaultData?.accounts ?? []));
  updateProviderFields();
  updateProviderIconPreview();
  openDialog(elements.account_dialog);
}

// One circular meter per window. The ring carries the whole story at a
// glance; the countdown and the forecast under it are the same detail the
// old progress bar carried, just arranged so the number is the hero.
// Every render() rebuilds account cards from a fresh HTML string, so a
// plain CSS transition on stroke-dasharray never actually fires — the
// circle is a brand-new DOM node each time, already painted at its final
// value, with no "before" state on that node for the browser to animate
// from. This map is that missing memory: keyed per ring (account + window),
// it remembers the last percentage actually shown so a genuine change can
// be drawn as a fill instead of just appearing. A render triggered by
// something unrelated (such as switching the provider lane) sees the same
// value as last time and animates nothing.
const ringMemory = new Map();

// A red-to-green scale for the ring's own percentage readout, referencing
// ColorBrewer's RdYlGn diverging palette (colorbrewer2.org) — the standard
// reference for "how good is this number" gauges, quartered into four
// bands (0-25/25-50/50-75/75-100) rather than interpolated continuously:
// this app's CSP is `style-src 'self'` with no 'unsafe-inline', which
// silently drops any `style="…"` written into an HTML string and parsed
// via innerHTML (confirmed by testing it — the attribute lands in the DOM,
// getAttribute("style") shows it, but the browser never applies it, so
// getComputedStyle never reflects it either). A CSS class reused from the
// stylesheet has no such problem, and four solid bands is arguably truer
// to how discrete ColorBrewer scales are meant to be read anyway — 25%
// steps rather than a per-pixel gradient a screenshot can't really show.
function ringScoreClass(remaining) {
  if (remaining < 25) return "ring-score-1";
  if (remaining < 50) return "ring-score-2";
  if (remaining < 75) return "ring-score-3";
  return "ring-score-4";
}

// Same four-band scale as ringScoreClass, but inverted: a capacity-watch
// amount is "% projected unused at reset", so a *high* number is the bad
// outcome (quota about to be wasted) rather than the good one a ring shows.
function capacityScoreClass(amount) {
  if (amount >= 75) return "ring-score-1";
  if (amount >= 50) return "ring-score-2";
  if (amount >= 25) return "ring-score-3";
  return "ring-score-4";
}

function windowMarkup(window, timezone, now, ringKey) {
  if (!window) {
    return `<div class="energy-ring empty-ring"><span class="ring-label">No limit yet</span>
      <div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="50"/></svg><div class="ring-value"><strong>?</strong><small>left</small></div></div>
      <small class="ring-reset">Check in to fill this meter</small></div>`;
  }
  const enriched = enrichWindow(window, now);
  const remaining = Math.max(0, Math.min(100, Math.round(enriched.remainingPercent)));
  const tone = remaining <= 15 ? "low" : remaining <= 40 ? "medium" : "good";
  const due = Date.parse(window.resetsAt) <= now.getTime();
  const label = window.label ?? window.id;
  const forecast = enriched.projectedUnusedPercent === null
    ? "Forecast starts after two check-ins"
    : `~${Math.round(enriched.projectedUnusedPercent)}% may go unused`;
  // A never-seen ring (this account's first-ever render) just shows its
  // value directly — animating every ring in from zero on first page load
  // would read as flicker, not motion, for data that was not "just
  // measured." Only a value that has actually moved since last time draws
  // the change: the circle is born at the old percentage and a follow-up
  // pass (queued from render(), see animateRingFills()) nudges it to the
  // new one a frame later, which is what makes the CSS transition fire.
  const previous = ringMemory.get(ringKey);
  const startAt = previous !== undefined ? previous : remaining;
  const animateTo = previous !== undefined && previous !== remaining ? ` data-animate-to="${remaining}"` : "";
  ringMemory.set(ringKey, remaining);
  return `<div class="energy-ring ${tone}">
    <span class="ring-label">${escapeHtml(label)}</span>
    <div class="ring" role="meter" aria-label="${escapeHtml(label)} remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${remaining}" aria-valuetext="${remaining}% left">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="50"/><circle class="ring-fill" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="${startAt} 100"${animateTo}/></svg>
      <div class="ring-value"><strong class="${ringScoreClass(remaining)}">${remaining}<span>%</span></strong><small>left</small></div>
    </div>
    <small class="ring-reset" title="${escapeHtml(formatLocalTime(window.resetsAt, timezone))}">${due ? "Recharge due &middot; check in" : `Refills in ${escapeHtml(formatCountdown(window.resetsAt, now))}`}</small>
    <small class="ring-forecast">${escapeHtml(forecast)}</small>
  </div>`;
}

// Bumps every freshly-inserted ring that has somewhere to go from its
// birth value to its real one. Two rAFs, not one: the first only gets
// scheduled after the browser has committed the initial paint, so the
// second is guaranteed to run on a later frame — collapsing to one rAF
// risks both the "born at" and "moved to" values landing in the same
// frame, which paints the final state directly with no visible fill.
function animateRingFills() {
  const pending = document.querySelectorAll(".ring-fill[data-animate-to]");
  if (!pending.length) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pending.forEach((circle) => {
        circle.setAttribute("stroke-dasharray", `${circle.dataset.animateTo} 100`);
        circle.removeAttribute("data-animate-to");
      });
    });
  });
}

// "You spent this much since the previous refresh" — the number the raw
// provider reading cannot give on its own.
function deltaChipMarkup(account, now) {
  const summary = summarizeAccount(account, { now });
  if (!summary.lastInterval) {
    return summary.samples ? '<div class="delta-strip pending"><span>First reading stored · refresh again to measure usage</span></div>' : "";
  }
  const chips = summary.windows.map((window) => {
    const spent = Number(window.lastDeltaPercent) > 0;
    return `<span class="delta-chip ${spent ? "spent" : "flat"}" title="${escapeHtml(window.label)} used since the previous refresh">${escapeHtml(window.label)} ${escapeHtml(formatDeltaPercent(window.lastDeltaPercent))}</span>`;
  });
  if (Number.isFinite(summary.lastBalanceDelta) && summary.lastBalanceDelta > 0) {
    chips.push(`<span class="delta-chip spent">${escapeHtml(currencyAmount(summary.lastBalanceDelta, summary.currency ?? "USD"))}</span>`);
  }
  if (!chips.length) return "";
  return `<div class="delta-strip"><small>Since last refresh · ${escapeHtml(formatHours(summary.lastInterval.minutes / 60) ?? "")} earlier</small><div>${chips.join("")}</div></div>`;
}

// Only accounts stored in the (unlocked) vault have a name worth editing —
// a demo or read-only preview account has nowhere to persist the change.
function isVaultAccount(accountId) {
  return Boolean(state.vaultData?.accounts.some((item) => item.id === accountId));
}

function renameActionMarkup(accountId, label) {
  return isVaultAccount(accountId)
    ? `<button type="button" class="icon-action" data-rename-account="${escapeHtml(accountId)}" aria-label="Edit ${escapeHtml(label)}" title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>`
    : "";
}

// Shared by every "check this account now" action — the header refresh
// button uses the same path, so a refresh always reads as the same icon
// wherever it appears.
function refreshActionMarkup(attribute, accountId, label) {
  return `<button type="button" class="icon-action" data-${attribute}="${escapeHtml(accountId)}" aria-label="Check ${escapeHtml(label)} now" title="Check now"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-3M4 4v4h4M4 13a8.1 8.1 0 0 0 15.5 3M20 20v-4h-4"/></svg></button>`;
}

function chartButtonMarkup(account) {
  return `<button type="button" class="chart-button" data-expand-ledger="${escapeHtml(account.id)}" aria-label="Charts and data for ${escapeHtml(account.label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16h16M8 14l4-5 4 3 4-7"/></svg>Charts &amp; data<span aria-hidden="true">&rarr;</span></button>`;
}

function quotaAccountMarkup(account, timezone, now) {
  const evaluation = evaluateAccount(account, { now });
  const { short, weekly } = classifyWindows(account);
  const status = account.connectorError ? "blocked" : evaluation.status;
  const action = refreshActionMarkup("refresh-subscription", account.id, account.label);
  // classifyWindows falls back to the only window it has when a provider
  // reports no active 5-hour window, which would otherwise render the weekly
  // window twice under two different headings.
  const shortSlot = short && short === weekly ? null : short;
  const relink = account.connectorError && account.connector
    ? `<button type="button" class="fix-login-button" data-relink-account="${escapeHtml(account.id)}">Fix login</button>`
    : "";
  return `<article class="account-card ${escapeHtml(account.provider)} ${escapeHtml(status)}">
    <div class="card-top">
      <span class="provider-monogram ${escapeHtml(account.provider)} ${accountAccentClass(account.color)}" aria-hidden="true"></span>
      <div class="card-id"><h3><bdi dir="auto" data-i18n-skip>${escapeHtml(account.label)}</bdi></h3><span>${escapeHtml(providerName(account.provider))} &middot; ${escapeHtml(account.verifiedAccount?.planType ?? "local CLI")}</span>${state.maskEmail ? "" : `<small class="verified-identity" ${account.verifiedAccount ? 'dir="auto" data-i18n-skip' : ""}>${escapeHtml(identitySummary(account))}</small>`}</div>
      <span class="status-pill ${escapeHtml(status)}"><i></i>${escapeHtml(account.connectorError ? "Check login" : statusLabel(status))}</span>
    </div>
    <div class="energy-rings">${windowMarkup(shortSlot, timezone, now, shortSlot && `${account.id}:${shortSlot.id}`)}${windowMarkup(weekly, timezone, now, weekly && `${account.id}:${weekly.id}`)}</div>
    ${deltaChipMarkup(account, now)}
    ${account.connectorError ? `<p class="connector-error">${escapeHtml(account.connectorError)}</p>` : ""}
    ${chartButtonMarkup(account)}
    <div class="card-bottom"><small>Checked ${escapeHtml(observedAge(account.observedAt, now))} &middot; holds back ${Math.round(Number(account.weeklyReservePercent ?? 15))}% weekly</small><div class="card-actions">${relink}${renameActionMarkup(account.id, account.label)}${account.connector ? action : ""}</div></div>
  </article>`;
}

function currencyAmount(amount, currency) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
  try {
    return localization.number(numeric, { style: "currency", currency, minimumFractionDigits: 2 });
  } catch {
    return `${numeric.toFixed(2)} ${currency}`;
  }
}

function compactNumber(value) {
  return localization.number(Number(value) || 0, { notation: "compact", maximumFractionDigits: 1 });
}

function deepSeekAccountMarkup(account, now) {
  const balances = account.deepseekBalance?.balance_infos ?? [];
  const primary = balances[0];
  const status = account.connectorError ? "blocked" : deepSeekReady(account) ? "ready" : account.deepseekBalance ? "blocked" : "unknown";
  const usage = account.deepseekUsage;
  return `<article class="account-card deepseek-card deepseek ${status}">
    <div class="card-top">
      <span class="provider-monogram deepseek ${accountAccentClass(account.color)}" aria-hidden="true"></span>
      <div class="card-id"><h3><bdi dir="auto" data-i18n-skip>${escapeHtml(account.label)}</bdi></h3><span>DeepSeek &middot; API credits</span></div>
      <span class="status-pill ${status}"><i></i>${escapeHtml(status === "ready" ? "Ready to go" : statusLabel(status))}</span>
    </div>
    <div class="credit-hero">
      <span class="credit-label">Credits available</span>
      <strong>${primary ? escapeHtml(currencyAmount(primary.total_balance, primary.currency)) : "&mdash;"}</strong>
      <span>${balances.length > 1 ? `${balances.length} currencies` : escapeHtml(primary?.currency ?? "Connect to read credits")}</span>
    </div>
    <div class="credit-breakdown">
      <div><span>Granted</span><strong>${primary ? escapeHtml(currencyAmount(primary.granted_balance, primary.currency)) : "&mdash;"}</strong></div>
      <div><span>Topped up</span><strong>${primary ? escapeHtml(currencyAmount(primary.topped_up_balance, primary.currency)) : "&mdash;"}</strong></div>
    </div>
    ${usage ? `<div class="usage-import-summary"><div><span>Imported key usage</span><strong>${escapeHtml(compactNumber(usage.totalTokens))} tokens</strong></div><div><span>${escapeHtml(compactNumber(usage.totalRequests))} requests &middot; ${usage.keys.length} ${usage.keys.length === 1 ? "key" : "keys"}</span><strong>${usage.keys[0]?.name ? `<bdi dir="auto" data-i18n-skip>${escapeHtml(usage.keys[0].name)}</bdi>` : "No key label"}</strong></div></div>` : '<div class="usage-import-empty"><span>No per-key usage imported yet</span><small>Add DeepSeek\u2019s amount CSV export to see tokens per key</small></div>'}
    ${deltaChipMarkup(account, now)}
    ${account.connectorError ? `<p class="connector-error">${escapeHtml(account.connectorError)}</p>` : ""}
    ${chartButtonMarkup(account)}
    <div class="card-bottom"><small>Checked ${escapeHtml(observedAge(account.observedAt, now))}</small><div class="card-actions">${renameActionMarkup(account.id, account.label)}<button type="button" class="icon-action" data-import-deepseek-usage="${escapeHtml(account.id)}" aria-label="Import usage for ${escapeHtml(account.label)}" title="Import usage"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg></button>${refreshActionMarkup("refresh-deepseek", account.id, account.label)}</div></div>
  </article>`;
}

function formatDeltaPercent(value) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0%";
  return `+${value < 0.1 ? "<0.1" : value.toFixed(1)}%`;
}

function formatHours(hours) {
  if (!Number.isFinite(hours)) return null;
  if (hours >= 48) return `${Math.round(hours / 24)}d`;
  const totalMinutes = Math.max(1, Math.round(hours * 60));
  const whole = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return whole > 0 ? `${whole}h ${minutes}m` : `${minutes}m`;
}

// Small inline bar chart of the last few refresh intervals. Each bar is one
// refresh-to-refresh gap, scaled against the heaviest gap on the row, so the
// shape of a working session is readable without axes or a chart library.
function sparklineMarkup(intervals, windowId) {
  const recent = intervals.slice(-14).map((interval) => interval.windows.find((window) => window.id === windowId)?.deltaPercent ?? 0);
  if (!recent.some((value) => value > 0)) return "";
  const peak = Math.max(...recent);
  const bars = recent.map((value, index) => {
    const height = Math.max(2, Math.round((value / peak) * 22));
    return `<rect x="${index * 6}" y="${24 - height}" width="4" height="${height}" rx="1.5" class="${value > 0 ? "" : "idle"}"></rect>`;
  }).join("");
  return `<svg class="ledger-spark" viewBox="0 0 ${recent.length * 6} 24" preserveAspectRatio="none" role="img" aria-label="Usage per refresh, oldest to newest"><g>${bars}</g></svg>`;
}

function ledgerWindowMarkup(summary, window) {
  const rate = Number.isFinite(window.ratePerHour) && window.ratePerHour > 0 ? `${window.ratePerHour.toFixed(1)}%/h` : "idle";
  const eta = formatHours(window.hoursToLimit);
  const sessionCopy = Number.isFinite(window.sessionDeltaPercent) && window.sessionDeltaPercent > 0
    ? `${summary.sessionLive ? "this session" : "last session"} ${window.sessionDeltaPercent.toFixed(1)}%`
    : "no session usage yet";
  const budget = Number.isFinite(window.sessionsLeft) && Number.isFinite(window.typicalSessionPercent)
    ? `≈${window.sessionsLeft} more ${window.sessionsLeft === 1 ? "session" : "sessions"} at your typical ${window.typicalSessionPercent.toFixed(1)}%`
    : null;
  return `<div class="ledger-window">
    <div class="ledger-window-top">
      <span>${escapeHtml(window.label)}</span>
      <strong class="${window.lastDeltaPercent > 0 ? "spent" : "flat"}">${escapeHtml(formatDeltaPercent(window.lastDeltaPercent))}</strong>
    </div>
    <div class="ledger-window-meta"><span>${escapeHtml(rate)}</span><span>${eta ? `limit in ${escapeHtml(eta)}` : "no limit estimate"}</span></div>
    ${sparklineMarkup(summary.intervals, window.id)}
    <div class="ledger-window-session">${escapeHtml(sessionCopy)}</div>
    ${budget ? `<div class="ledger-window-budget">${escapeHtml(budget)}</div>` : ""}
    ${window.lastSpannedReset ? '<div class="ledger-window-note">Window reset in between — usage before the reset is not counted.</div>' : ""}
  </div>`;
}

function ledgerRowMarkup(summary, now) {
  // summarizeAccount() (refresh-ledger.js) is pure usage-history math and has
  // no reason to know about an account's chosen colour, so it is looked up
  // here by the id it does carry.
  const accentClass = accountAccentClass(state.vaultData?.accounts.find((item) => item.id === summary.accountId)?.color);
  const since = summary.lastInterval ? observedAge(new Date(summary.lastInterval.endedAt).toISOString(), now) : "—";
  const gap = summary.lastInterval ? formatHours(summary.lastInterval.minutes / 60) : null;
  const spend = Number.isFinite(summary.lastBalanceDelta) && summary.lastBalanceDelta > 0
    ? currencyAmount(summary.lastBalanceDelta, summary.currency ?? "USD")
    : null;
  const windows = summary.windows.length
    ? summary.windows.map((window) => ledgerWindowMarkup(summary, window)).join("")
    : `<div class="ledger-window"><div class="ledger-window-top"><span>Credits spent</span><strong class="${spend ? "spent" : "flat"}">${escapeHtml(spend ?? "0")}</strong></div>
      <div class="ledger-window-meta"><span>${escapeHtml(summary.intervals.length)} tracked refreshes</span><span>${gap ? `${escapeHtml(gap)} gap` : ""}</span></div>
      <div class="ledger-window-session">${Number.isFinite(summary.sessionBalanceDelta) && summary.sessionBalanceDelta > 0 ? `${escapeHtml(summary.sessionLive ? "this session" : "last session")} ${escapeHtml(currencyAmount(summary.sessionBalanceDelta, summary.currency ?? "USD"))}` : "no session spend yet"}</div></div>`;
  return `<article class="ledger-row ${escapeHtml(summary.provider ?? "")}">
    <div class="ledger-row-heading">
      <div class="ledger-identity-row">
        <div class="account-identity"><span class="provider-monogram ${escapeHtml(summary.provider ?? "")} ${accentClass}" aria-hidden="true"></span><div><h3><bdi dir="auto" data-i18n-skip>${escapeHtml(summary.label)}</bdi></h3><span>${escapeHtml(since)} · ${escapeHtml(String(summary.samples))} readings${gap ? ` · ${escapeHtml(gap)} since previous` : ""}</span></div></div>
        <span class="ledger-session-pill ${summary.sessionLive ? "live" : ""}">${summary.sessionLive ? "Session active" : "Idle"}</span>
      </div>
      <div class="ledger-row-actions"><button type="button" class="ledger-expand-button" data-expand-ledger="${escapeHtml(summary.accountId)}">Charts &amp; data ↗</button></div>
    </div>
    <div class="ledger-windows">${windows}</div>
  </article>`;
}

function renderLedger(accounts, now) {
  const rangeHours = state.ledgerRangeHours;
  const summaries = ledgerRows(accounts, { now, lookbackHours: rangeHours });
  const totals = ledgerTotals(summaries, { now, sinceHours: rangeHours });
  const rangeLabel = rangeHours >= 168 ? "7 days" : `${rangeHours}h`;

  elements.ledger_totals.textContent = totals.refreshes
    ? `${totals.workingRefreshes} of ${totals.refreshes} refreshes recorded usage in the last ${rangeLabel}${totals.peakRatePerHour ? ` · peak ${totals.peakRatePerHour.toFixed(1)}%/h` : ""}${totals.spend > 0 ? ` · ${currencyAmount(totals.spend, totals.currency ?? "USD")} credits` : ""}`
    : "No refresh history yet";
  elements.ledger_grid.innerHTML = summaries.length
    ? summaries.map((summary) => ledgerRowMarkup(summary, now)).join("")
    : `<div class="empty-state compact-empty"><span class="empty-icon"><svg viewBox="0 0 24 24"><path d="M4 18V9M10 18V5M16 18v-6M22 18h-2"/></svg></span><p>Refresh an account twice to measure what the work in between cost. Readings stay in your encrypted local vault.</p></div>`;
  elements.ledger_footnote.textContent = summaries.length
    ? `Deltas compare consecutive refreshes of the same window. Refreshes more than ${SESSION_GAP_MINUTES} minutes apart start a new session. A window that reset in between counts only the new window's usage.`
    : "Each refresh stores one compact reading locally. Nothing is uploaded, and the raw readings never leave this browser.";
}

// --- Ledger detail dialog --------------------------------------------------
// The ledger cards above show only the latest delta. This dialog is the
// expanded view: a usage-over-time line per window, a per-refresh bar chart,
// the session log, and the raw readings as a sheet with a CSV export — so a
// user (or a script reading the export) can see the whole shape of an
// account's usage, not just the most recent change.

function chartAxisLabels(points, timezone) {
  if (points.length < 2) return "";
  const format = (t) => formatLocalTime(t, timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `<div class="chart-axis"><span>${escapeHtml(format(points[0].t))}</span><span>${escapeHtml(format(points.at(-1).t))}</span></div>`;
}

function lineChartMarkup(points, resets, options = {}) {
  if (points.length < 2) return '<div class="chart-empty">Refresh again to start a line for this range.</div>';
  const width = options.width ?? 640;
  const height = options.height ?? 140;
  const padding = 10;
  const valueKey = options.valueKey ?? "u";
  const scaled = scalePoints(points, valueKey, { width, height, padding, min: options.min, max: options.max });
  const path = scaled.points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const floor = height - padding;
  const area = `${path} L${scaled.points.at(-1).x.toFixed(1)},${floor} L${scaled.points[0].x.toFixed(1)},${floor} Z`;
  // Each dot is purely a visual marker now — nothing has to land a
  // pointer on one directly. A transparent .chart-capture rect spans the
  // *entire* plot area instead (drawn last, so it wins hit-testing without
  // hiding anything painted before it) and a delegated handler finds
  // whichever point's x is nearest the cursor, magnet-style, then moves
  // the crosshair line and ghost dot to it — see attachChartMagnet(). A
  // fixed 2.6px circle was a genuinely bad hover target on its own; "hover
  // anywhere over the chart" is the actual well-known interaction.
  const dots = scaled.points.map((point, index) => {
    const label = `${formatLocalTime(points[index].t, options.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${points[index][valueKey]}${options.suffix ?? "%"}`;
    return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.6" class="chart-point" data-tooltip="${escapeHtml(label)}"></circle>`;
  }).join("");
  const percentScale = options.min === 0 && options.max === 100;
  const gridlines = percentScale ? [0, 25, 50, 75, 100].map((mark) => {
    const y = height - padding - (mark / 100) * (height - padding * 2);
    return `<line x1="${padding}" x2="${width - padding}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="chart-grid"></line>`;
  }).join("") : "";
  const resetLines = (resets ?? []).map((t) => {
    const x = projectX(scaled.scale, t);
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${padding}" y2="${height - padding}" class="chart-reset-line"></line>`;
  }).join("");
  // The crosshair and ghost dot are repositioned in JS, so their starting
  // coordinates here are irrelevant — [hidden] keeps them out of the way
  // until the first hover. The capture rect's padding-to-padding data
  // attributes are how the handler clamps the ghost dot's y to the plotted
  // line itself rather than to wherever the cursor happens to be vertically.
  return `<svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel ?? "Usage over time")}">${gridlines}<path d="${area}" class="chart-area"></path><path d="${path}" class="chart-line"></path>${resetLines}${dots}<line class="chart-crosshair" x1="0" x2="0" y1="${padding}" y2="${height - padding}" hidden></line><circle class="chart-ghost" r="5.5" cx="0" cy="0" hidden></circle><rect class="chart-capture" x="0" y="0" width="${width}" height="${height}"></rect></svg>`;
}

function barChartMarkup(entries, valueKey, options = {}) {
  if (!entries.length) return '<div class="chart-empty">No refreshes recorded in this range.</div>';
  const width = options.width ?? 640;
  const height = options.height ?? 110;
  const layout = layoutBars(entries, valueKey, { width, height, padding: 4, gap: entries.length > 60 ? 1 : entries.length > 24 ? 2 : 3, max: options.max });
  const bars = layout.bars.map((bar) => {
    const value = Number(bar[valueKey]) || 0;
    const label = `${formatLocalTime(bar.endedAt ?? bar.t, options.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${options.suffix === "currency" ? currencyAmount(value, bar.currency ?? "USD") : `+${value}%`}${bar.spannedReset ? " (reset in between)" : ""}`;
    return `<rect x="${bar.x.toFixed(1)}" y="${bar.y.toFixed(1)}" width="${bar.width.toFixed(1)}" height="${bar.height.toFixed(1)}" rx="1.5" class="chart-hoverable ${bar.spannedReset ? "reset" : value > 0 ? "" : "idle"}" data-tooltip="${escapeHtml(label)}"></rect>`;
  }).join("");
  return `<svg class="bar-chart" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="none" role="img" aria-label="Usage per refresh">${bars}</svg>`;
}

function ledgerDetailWindowSection(account, window, options, timezone) {
  const series = windowSeries(account, window.id, options);
  const intervals = intervalsInRange(account, options).map((interval) => ({
    ...interval,
    ...(interval.windows.find((entry) => entry.id === window.id) ?? { deltaPercent: 0, spannedReset: false }),
  }));
  const rate = burnRateForRange(account, window.id, options);
  return `<section class="ledger-detail-section">
    <div class="ledger-detail-section-heading"><h3>${escapeHtml(window.label)}</h3><span>${rate ? `${rate.toFixed(1)}%/h average` : "idle in this range"}</span></div>
    <div class="chart-block"><p class="chart-label">Usage over time</p>${lineChartMarkup(series.points, series.resets, { min: 0, max: 100, timezone })}${chartAxisLabels(series.points, timezone)}</div>
    <div class="chart-block"><p class="chart-label">Usage per refresh</p>${barChartMarkup(intervals, "deltaPercent", { timezone })}</div>
  </section>`;
}

function ledgerDetailBalanceSection(account, options, timezone) {
  const series = balanceSeries(account, options);
  const values = series.points.map((point) => point.b);
  const max = values.length ? Math.max(...values) * 1.08 : 1;
  const intervals = intervalsInRange(account, options).filter((interval) => Number.isFinite(interval.balanceDelta));
  const spendBars = intervals.map((interval) => ({ ...interval, spend: Math.max(0, interval.balanceDelta) }));
  const latest = series.points.at(-1);
  return `<section class="ledger-detail-section">
    <div class="ledger-detail-section-heading"><h3>Balance</h3><span>${latest ? escapeHtml(currencyAmount(latest.b, latest.c ?? "USD")) : "—"}</span></div>
    <div class="chart-block"><p class="chart-label">Balance over time</p>${lineChartMarkup(series.points, [], { valueKey: "b", min: 0, max, suffix: "", timezone })}${chartAxisLabels(series.points, timezone)}</div>
    <div class="chart-block"><p class="chart-label">Credits spent per refresh</p>${barChartMarkup(spendBars, "spend", { timezone, suffix: "currency" })}</div>
  </section>`;
}

function ledgerDetailSessionSection(account, now, timezone) {
  const sessions = groupSessions(computeIntervals(account));
  if (!sessions.length) return "";
  const rows = sessions.slice(-10).reverse().map((session) => {
    const live = now.getTime() - session.endedAt <= SESSION_GAP_MINUTES * 60_000;
    const usageParts = Object.entries(session.windows).filter(([, value]) => value > 0).map(([id, value]) => `${escapeHtml(id === "five_hour" || id === "primary" ? "5-hour" : id === "seven_day" || id === "secondary" ? "weekly" : id)} +${value}%`);
    if (session.balanceDelta > 0) usageParts.push(escapeHtml(currencyAmount(session.balanceDelta, session.currency ?? "USD")));
    return `<div class="session-row ${live ? "live" : ""}">
      <span>${escapeHtml(formatLocalTime(session.startedAt, timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</span>
      <span>${escapeHtml(formatHours(session.minutes / 60) ?? "—")} · ${session.refreshes} refreshes</span>
      <span>${usageParts.length ? usageParts.join(" · ") : "no usage"}</span>
    </div>`;
  }).join("");
  return `<section class="ledger-detail-section"><div class="ledger-detail-section-heading"><h3>Sessions</h3><span>${sessions.length} total</span></div><div class="session-log">${rows}</div></section>`;
}

function ledgerDetailTableSection(account, options, timezone) {
  const rows = refreshRows(account, options);
  if (!rows.length) return "";
  const windowDefs = Array.isArray(account.windows) ? account.windows : [];
  const showBalance = account.provider === "deepseek";
  const head = ["Time", "Gap", ...windowDefs.flatMap((window) => [`${window.label} used`, `${window.label} Δ`]), ...(showBalance ? ["Balance", "Spent"] : [])];
  const body = rows.slice().reverse().map((row) => {
    const cells = [
      escapeHtml(formatLocalTime(row.t, timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })),
      row.gapMinutes != null ? escapeHtml(formatHours(row.gapMinutes / 60) ?? `${row.gapMinutes}m`) : "—",
      ...windowDefs.flatMap((window) => {
        const cell = row.windows[window.id];
        return [
          cell ? `${cell.usedPercent}%` : "—",
          cell && cell.deltaPercent !== null ? `${escapeHtml(formatDeltaPercent(cell.deltaPercent))}${cell.spannedReset ? " ↺" : ""}` : "—",
        ];
      }),
      ...(showBalance ? [
        row.balance !== null ? escapeHtml(currencyAmount(row.balance, row.currency ?? "USD")) : "—",
        row.balanceDelta !== null && row.balanceDelta > 0 ? escapeHtml(currencyAmount(row.balanceDelta, row.currency ?? "USD")) : "—",
      ] : []),
    ];
    return `<tr class="${row.idle ? "idle-row" : ""}">${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  }).join("");
  return `<section class="ledger-detail-section"><div class="ledger-detail-section-heading"><h3>Raw readings</h3><span>${rows.length} rows</span></div>
    <div class="ledger-table-wrap"><table class="ledger-table"><thead><tr>${head.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

// burnRate() takes pre-computed intervals and an explicit lookback; this
// wraps it so every detail section can just pass the account and the same
// range options ("All time" has no finite lookback, so it falls back to a
// year — long enough to just mean "the whole ledger").
function burnRateForRange(account, windowId, options) {
  const intervals = computeIntervals(account);
  const lookbackHours = Number.isFinite(options.hours) ? options.hours : 24 * 365;
  return burnRate(intervals, windowId, { now: options.now, lookbackHours });
}

// "All time" has no finite lookback; every caller treats Infinity as "the
// whole ledger", so the string lives in one place rather than three.
function detailRangeHours() {
  return state.detailRange === "all" ? Infinity : Number(state.detailRange) || 24;
}

function renderLedgerDetail() {
  const accountId = state.ledgerDetailAccountId;
  const account = mergedAccounts().find((item) => item.id === accountId);
  if (!account) {
    closeDialog(elements.ledger_detail_dialog);
    return;
  }
  const now = new Date();
  const timezone = state.document.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const options = { now, hours: detailRangeHours() };
  const readingCount = readLedger(account).length;

  elements.ledger_detail_title.textContent = account.label;
  elements.ledger_detail_subtitle.textContent = `${providerName(account.provider)} · ${readingCount} check-in${readingCount === 1 ? "" : "s"} kept on this device`;

  const sections = [];
  for (const window of account.windows ?? []) sections.push(ledgerDetailWindowSection(account, window, options, timezone));
  if (account.provider === "deepseek") sections.push(ledgerDetailBalanceSection(account, options, timezone));
  sections.push(ledgerDetailSessionSection(account, now, timezone));
  sections.push(ledgerDetailTableSection(account, options, timezone));

  elements.ledger_detail_body.innerHTML = readingCount
    ? sections.join("")
    : '<div class="empty-state compact-empty"><p>No check-ins stored for this account yet. Check it twice and your charts start here.</p></div>';
}

function openLedgerDetail(accountId) {
  state.ledgerDetailAccountId = accountId;
  renderLedgerDetail();
  openDialog(elements.ledger_detail_dialog);
}

// --- Chart tooltip ----------------------------------------------------
// One delegated listener on the dialog body, not one per chart element:
// renderLedgerDetail() replaces #ledger-detail-body's entire innerHTML on
// every range change, which would silently orphan any listener attached
// directly to a point/bar the moment the user picks a different range.
//
// Line charts use a "magnet" interaction rather than direct hover: a
// transparent .chart-capture rect spans the whole plot area (see
// lineChartMarkup()), and moving anywhere over it finds the nearest point
// by x and snaps a crosshair + ghost dot to it, regardless of where the
// cursor sits vertically — hovering a bare 2.6px dot exactly was the
// actual bug being fixed here, not a missing tooltip. Bar charts keep
// plain direct hover, since each bar is already a wide, easy target.

let hoveredBarTarget = null;
let activeMagnetSvg = null;

function positionChartTooltip(clientX, clientY) {
  const tooltip = elements.chart_tooltip;
  const margin = 8;
  const offset = 16;
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + offset;
  let top = clientY - rect.height - offset;
  // Flip to the other side of the cursor whenever the default placement
  // would run the tooltip off the dialog/viewport — the same edge-aware
  // behavior every well-known charting tooltip has, just computed by hand
  // against the two axes independently rather than one combined check.
  if (left + rect.width > window.innerWidth - margin) left = clientX - offset - rect.width;
  if (top < margin) top = clientY + offset;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function clearChartMagnet() {
  if (!activeMagnetSvg) return;
  // .hidden is an HTMLElement IDL property with no SVGElement equivalent —
  // setting it on a <circle>/<line> silently creates a do-nothing JS
  // expando instead of touching the actual `hidden` content attribute (the
  // same trap documented in CLAUDE.md for the theme button's icons), which
  // is exactly why the crosshair and ghost dot rendered as `display: none`
  // via the global [hidden] rule no matter what this set .hidden to.
  activeMagnetSvg.querySelector(".chart-crosshair").setAttribute("hidden", "");
  activeMagnetSvg.querySelector(".chart-ghost").setAttribute("hidden", "");
  activeMagnetSvg = null;
}

function hideChartHover() {
  clearChartMagnet();
  hoveredBarTarget = null;
  elements.chart_tooltip.hidden = true;
}

elements.ledger_detail_body.addEventListener("pointermove", (event) => {
  const capture = event.target.closest(".chart-capture");
  if (capture) {
    hoveredBarTarget = null;
    const svg = capture.ownerSVGElement;
    const points = [...svg.querySelectorAll(".chart-point")];
    const ctm = svg.getScreenCTM();
    if (!points.length || !ctm) {
      clearChartMagnet();
      elements.chart_tooltip.hidden = true;
      return;
    }
    // Map the cursor into the SVG's own coordinate space via its actual
    // screen transform, not a hand-rolled clientX/rect.width ratio — this
    // chart has no preserveAspectRatio="none" (unlike the bar chart), so
    // it can letterbox, and a manual ratio would silently misalign the
    // moment the rendered box's aspect ratio stops matching the viewBox's.
    const cursor = svg.createSVGPoint();
    cursor.x = event.clientX;
    cursor.y = event.clientY;
    const local = cursor.matrixTransform(ctm.inverse());
    let nearest = points[0];
    let nearestDistance = Infinity;
    for (const point of points) {
      const distance = Math.abs(Number(point.getAttribute("cx")) - local.x);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = point;
      }
    }
    const cx = Number(nearest.getAttribute("cx"));
    const cy = Number(nearest.getAttribute("cy"));
    const crosshair = svg.querySelector(".chart-crosshair");
    const ghost = svg.querySelector(".chart-ghost");
    crosshair.setAttribute("x1", cx);
    crosshair.setAttribute("x2", cx);
    crosshair.removeAttribute("hidden");
    ghost.setAttribute("cx", cx);
    ghost.setAttribute("cy", cy);
    ghost.removeAttribute("hidden");
    activeMagnetSvg = svg;
    elements.chart_tooltip.textContent = nearest.dataset.tooltip ?? "";
    elements.chart_tooltip.hidden = false;
    // The tooltip follows the matched point, not the raw cursor — that is
    // the whole point of "magnet": a cursor nowhere near the line
    // vertically still gets a tooltip anchored to where the value is.
    const screen = svg.createSVGPoint();
    screen.x = cx;
    screen.y = cy;
    const anchor = screen.matrixTransform(ctm);
    positionChartTooltip(anchor.x, anchor.y);
    return;
  }

  clearChartMagnet();
  const target = event.target.closest("[data-tooltip]");
  if (!target) {
    if (hoveredBarTarget) hideChartHover();
    return;
  }
  if (target !== hoveredBarTarget) {
    hoveredBarTarget = target;
    elements.chart_tooltip.textContent = target.dataset.tooltip ?? "";
    elements.chart_tooltip.hidden = false;
  }
  positionChartTooltip(event.clientX, event.clientY);
});

elements.ledger_detail_body.addEventListener("pointerleave", hideChartHover);

function renderCapacity(accounts, now) {
  const items = quotaAccounts(accounts).map((account) => {
    const evaluation = evaluateAccount(account, { now });
    const window = [evaluation.shortWindow, evaluation.weeklyWindow].filter(Boolean).filter((item) => item.projectedUnusedPercent !== null).sort((a, b) => b.projectedUnusedPercent - a.projectedUnusedPercent)[0];
    return { account, evaluation, window };
  }).filter((item) => item.window?.projectedUnusedPercent >= 10).sort((a, b) => b.window.projectedUnusedPercent - a.window.projectedUnusedPercent);
  elements.capacity_list.innerHTML = items.length ? items.slice(0, 4).map(({ account, evaluation, window }) => {
    const amount = Math.round(window.projectedUnusedPercent);
    const copy = evaluation.fresh ? `about ${amount}% projected unused` : `0–${Math.round(window.remainingPercent)}% potentially unused`;
    return `<div class="capacity-item"><div class="capacity-meter ${capacityScoreClass(amount)}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${amount}" aria-label="${escapeHtml(window.label)} projected unused"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="capacity-track" cx="22" cy="22" r="18"/><circle class="capacity-fill" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${amount} 100"/></svg><span>${amount}<small>%</small></span></div><div><strong><bdi dir="auto" data-i18n-skip>${escapeHtml(account.label)}</bdi> · ${escapeHtml(window.label)}</strong><span>${escapeHtml(copy)} at reset</span></div><time>${escapeHtml(formatCountdown(window.resetsAt, now))}</time></div>`;
  }).join("") : '<div class="empty-state compact-empty"><span class="empty-icon"><svg viewBox="0 0 24 24"><path d="m7 12 3 3 7-7"/></svg></span><p>No meaningful unused-capacity risk is projected.</p></div>';
  return items.length;
}

function renderTimeline(accounts, timezone, now) {
  const events = buildResetTimeline(quotaAccounts(accounts), now);
  const display = [...events.filter((event) => event.resetExpected).slice(0, 2), ...events.filter((event) => !event.resetExpected).slice(0, 5)].slice(0, 5);
  elements.timeline_list.innerHTML = display.length ? display.map((event, index) => `<div class="timeline-item ${event.resetExpected ? "expected" : ""}"><div class="timeline-rail"><span></span>${index < display.length - 1 ? "<i></i>" : ""}</div><div class="timeline-copy"><strong><bdi dir="auto" data-i18n-skip>${escapeHtml(event.accountLabel)}</bdi> · ${escapeHtml(event.windowLabel)}</strong><span>${event.resetExpected ? "Expected reset; waiting for confirmation" : `${Math.round(event.remainingPercent)}% left before reset`}</span></div><time><strong>${escapeHtml(formatLocalTime(event.resetsAt, timezone))}</strong><span>${escapeHtml(formatCountdown(event.resetsAt, now))}</span></time></div>`).join("") : '<div class="empty-state compact-empty"><span class="empty-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/></svg></span><p>Reset events appear after a local Claude or Codex connector reports usage.</p></div>';
}

function renderConfiguredAccounts() {
  const accounts = state.vaultData?.accounts ?? [];
  elements.configured_accounts.innerHTML = accounts.length ? accounts.map((account) => `<div class="configured-account"><span class="provider-monogram ${escapeHtml(account.provider)} ${accountAccentClass(account.color)}" aria-hidden="true"></span><div><strong><bdi dir="auto" data-i18n-skip>${escapeHtml(account.label)}</bdi></strong><span>${escapeHtml(providerName(account.provider))} · ${account.verifiedAccount?.email ? `<bdi dir="auto" data-i18n-skip>${escapeHtml(account.verifiedAccount.email)}</bdi>` : escapeHtml(account.provider === "deepseek" ? "verified API key" : "legacy profile")}</span></div><div class="configured-account-actions"><button type="button" class="rename-button" data-rename-account="${escapeHtml(account.id)}">Edit</button><button type="button" data-remove-account="${escapeHtml(account.id)}">Remove</button></div></div>`).join("") : '<p class="empty-config">No encrypted account profiles yet.</p>';
}

// Used to also paint #source-badge in the topbar ("Local live feed",
// "Fictional demo", etc.) — removed as redundant once the demo/refresh
// chips and every card's own "Checked Xm ago" already said the same thing.
// This is what is left: the settings dialog's own lock-state readout.
function renderVaultLockState() {
  elements.vault_lock_state.textContent = encryptedVault.isUnlocked() ? "Unlocked" : "Locked";
}

function render() {
  const now = new Date();
  // Measured burn rates replace the provider's (absent) forecast field, so the
  // capacity forecast and every projection below run on observed refresh deltas.
  const allAccounts = mergedAccounts().map((account) => withMeasuredBurnRates(account, { now, lookbackHours: state.ledgerRangeHours }));
  // One provider lane, one mental model: picking Claude narrows every
  // dashboard section to Claude.
  const accounts = state.providerLane === "all" ? allAccounts : allAccounts.filter((account) => account.provider === state.providerLane);
  const timezone = state.document.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  paintPills();
  elements.accounts_grid.innerHTML = accounts.length
    ? accounts.map((account) => account.provider === "deepseek" ? deepSeekAccountMarkup(account, now) : quotaAccountMarkup(account, timezone, now)).join("")
    : `<div class="empty-state large-empty"><span class="empty-icon plus-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><h3>${allAccounts.length ? `No ${escapeHtml(providerName(state.providerLane))} accounts yet` : "Build your little AI team"}</h3><p>Add Claude, Codex, or DeepSeek to see every limit in one happy place. Only DeepSeek needs an API key, and the app accepts it only on localhost.</p><button class="play-button" type="button" data-empty-add>Add an account <span aria-hidden="true">&#8594;</span></button></div>`;
  if (!state.languageSwitching) animateRingFills();
  elements.timezone_chip.textContent = timezone;
  elements.demo_note.hidden = !state.demoMode;
  elements.security_summary.textContent = state.localConnector
    ? "Loopback verified. Your secrets are encrypted at rest, and every provider check stays between this machine and that provider."
    : location.protocol === "file:"
      ? "Offline mode: the encrypted vault works here. Start the local companion for live DeepSeek credits."
      : "Hosted mode: API-key connectors are switched off. Run the app locally to connect DeepSeek.";
  renderLedger(accounts, now);
  renderCapacity(accounts, now);
  renderTimeline(accounts, timezone, now);
  renderConfiguredAccounts();
  renderVaultLockState();
  if (elements.ledger_detail_dialog.open) renderLedgerDetail();
  localization.apply();
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = await response.json();
    state.localConnector = Boolean(response.ok && health.localConnector && ["localhost", "127.0.0.1", "::1"].includes(location.hostname));
  } catch {
    state.localConnector = false;
  }
}

async function loadUsageFeed() {
  try {
    const response = await fetch("/api/usage", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error("Usage feed unavailable");
    if (!state.demoMode) {
      state.previewActive = false;
      state.document = validateUsageDocument(value);
      state.source = value.mode === "live" ? "live" : "empty";
    }
  } catch {
    if (!state.demoMode) state.source = "error";
  }
}

async function readDeepSeekBalance(apiKey) {
  if (!state.localConnector) throw new Error("Run AI Quota Meter on localhost before adding a DeepSeek key.");
  const response = await fetch("/api/providers/deepseek/balance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Could not read DeepSeek balance.");
  return value;
}

async function readLocalProvider(path, body) {
  if (!state.localConnector) throw new Error("Run AI Quota Meter on localhost to connect subscription accounts.");
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "The local provider check failed.");
  return value;
}

// options.persist === false leaves the vault write to the caller, so a bulk
// refresh can update every account and then save once instead of racing a
// full re-encrypt per account.
async function refreshSubscriptionAccount(account, options = {}) {
  const syncingClaude = account.provider === "claude" && options.sync === true;
  const path = syncingClaude ? "/api/providers/claude/sync" : `/api/providers/${account.provider}/connect`;
  const result = await readLocalProvider(path, { profileKey: account.connector.profileKey });
  if (!result.connected) throw new Error(result.reason ?? `${providerName(account.provider)} is not signed in.`);
  const originalEmail = account.verifiedAccount?.email?.toLowerCase();
  const currentEmail = result.identity?.email?.toLowerCase();
  if (originalEmail && currentEmail && originalEmail !== currentEmail) {
    account.connectorError = `Wrong account in this CLI profile. Expected ${account.verifiedAccount.email}, found ${result.identity.email}.`;
    if (options.persist !== false) await persistVault();
    return;
  }
  account.verifiedAccount = result.identity;
  account.connectorError = result.usageError ?? null;
  if (Array.isArray(result.windows) && result.windows.length) {
    account.windows = result.windows;
    account.observedAt = result.checkedAt;
  }
  account.verifiedAt = result.checkedAt ?? new Date().toISOString();
  recordRefresh(account, options.now ?? new Date());
  if (options.persist !== false) await persistVault();
}

async function refreshDeepSeek(accountId, statusElement = null, options = {}) {
  const account = state.vaultData?.accounts.find((item) => item.id === accountId && item.provider === "deepseek");
  if (!account) return;
  if (statusElement) statusElement.textContent = `Refreshing ${account.label}…`;
  try {
    const result = await readDeepSeekBalance(account.apiKey);
    account.deepseekBalance = result.balance;
    account.observedAt = result.checkedAt;
    account.connectorError = null;
    recordRefresh(account, options.now ?? new Date());
    if (options.persist !== false) await persistVault();
    if (statusElement) statusElement.textContent = `${account.label} balance refreshed.`;
  } catch (error) {
    // Surface the failure on the card too — a bulk refresh passes no status
    // element, so without this the account silently keeps stale credits.
    account.connectorError = error instanceof Error ? error.message : "Balance refresh failed.";
    if (options.persist !== false) await persistVault();
    if (statusElement) statusElement.textContent = account.connectorError;
  }
  if (options.render !== false) render();
}

// Refreshes in small batches: every account still gets refreshed, but we
// avoid spawning one CLI process per account all at once.
async function inBatches(items, size, worker) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.allSettled(items.slice(index, index + size).map(worker));
  }
}

async function refreshAll() {
  if (elements.refresh_button.disabled) return;
  elements.refresh_button.classList.add("spinning");
  elements.refresh_button.disabled = true;
  try {
    await Promise.all([loadHealth(), loadUsageFeed()]);
    if (encryptedVault.isUnlocked()) {
      const accounts = state.vaultData?.accounts ?? [];
      const deepSeekAccounts = accounts.filter((account) => account.provider === "deepseek");
      const subscriptions = accounts.filter((account) => account.connector && new Set(["claude", "codex"]).has(account.provider));
      await Promise.allSettled([
        inBatches(deepSeekAccounts, 3, (account) => refreshDeepSeek(account.id, null, { persist: false, render: false })),
        inBatches(subscriptions, 3, async (account) => {
          try {
            await refreshSubscriptionAccount(account, { persist: false });
          } catch (error) {
            account.connectorError = error instanceof Error ? error.message : "Provider refresh failed.";
          }
        }),
      ]);
      if (deepSeekAccounts.length || subscriptions.length) await persistVault();
    }
  } finally {
    elements.refresh_button.classList.remove("spinning");
    elements.refresh_button.disabled = false;
    render();
  }
}

elements.vault_form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = elements.vault_dialog.dataset.mode;
  const passphrase = elements.vault_passphrase.value;
  elements.vault_submit_button.disabled = true;
  elements.vault_dialog_status.textContent = mode === "create" ? "Encrypting your new local vault…" : "Decrypting locally…";
  try {
    if (mode === "create") {
      if (passphrase !== elements.vault_passphrase_confirm.value) throw new Error("The passphrases do not match.");
      state.vaultData = await encryptedVault.create(passphrase, { accounts: [], preferences: { createdAt: new Date().toISOString() } });
    } else {
      state.vaultData = await encryptedVault.unlock(passphrase);
    }
    if (elements.vault_remember.checked) {
      localStorage.setItem(REMEMBER_STORAGE_KEY, await encryptedVault.exportRememberKey(passphrase));
    } else {
      localStorage.removeItem(REMEMBER_STORAGE_KEY);
    }
    elements.vault_form.reset();
    closeDialog(elements.vault_dialog);
    render();
    if (state.openAccountAfterUnlock) {
      state.openAccountAfterUnlock = false;
      showAccountDialog();
    }
  } catch (error) {
    elements.vault_dialog_status.textContent = error instanceof Error ? error.message : "Could not unlock the vault.";
  } finally {
    elements.vault_submit_button.disabled = false;
  }
});

elements.explore_demo_button.addEventListener("click", () => {
  state.demoMode = true;
  state.document = createDemoData();
  state.source = "demo";
  closeDialog(elements.vault_dialog);
  render();
});

elements.account_form.addEventListener("change", (event) => {
  if (event.target.name === "accentColor") updateProviderIconPreview();
  // Changing either the provider or which account to use abandons whatever
  // sign-in was in flight — it was for a different profile than the one the
  // form now describes.
  if (event.target.name === "provider" || event.target.name.endsWith("ProfileMode")) {
    state.signInToken += 1;
    elements.cli_setup_result.hidden = true;
    elements.signin_spinner.hidden = true;
    elements.account_dialog_status.textContent = "";
    if (event.target.name === "provider") updateProviderFields();
  }
});

elements.account_form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(elements.account_form);
  const provider = String(data.get("provider"));
  const requestedLabel = String(data.get("label") ?? "").trim();
  elements.save_account_button.disabled = true;
  elements.account_dialog_status.textContent = provider === "deepseek" ? "Checking your DeepSeek balance…" : `Checking your ${providerName(provider)} sign-in…`;
  try {
    const profileKey = provider === "deepseek" ? null : (data.get(`${provider}ProfileMode`) === "isolated" ? state.pendingProfileKey : "default");
    const accountId = provider === "deepseek" ? crypto.randomUUID() : `${provider}-${profileKey}`;
    if (provider !== "deepseek" && state.vaultData.accounts.some((existing) => existing.id === accountId)) {
      throw new Error(`This ${providerName(provider)} login is already in your vault. Choose "A different ${provider === "codex" ? "ChatGPT" : "Claude"} account" above to add another one.`);
    }
    const chosenColor = String(data.get("accentColor") ?? "");
    const account = {
      id: accountId,
      label: requestedLabel,
      provider,
      // Falls back to a fresh auto-pick rather than trusting the form's
      // value blindly — a stale radio value could in principle survive a
      // fast provider switch between render and submit.
      color: ACCOUNT_COLORS.includes(chosenColor) ? chosenColor : pickAutoColor(state.vaultData?.accounts ?? []),
    };
    if (provider === "deepseek") {
      const apiKey = String(data.get("apiKey") ?? "").trim();
      const result = await readDeepSeekBalance(apiKey);
      Object.assign(account, { label: requestedLabel || "DeepSeek API", apiKey, deepseekBalance: result.balance, observedAt: result.checkedAt });
      const usageFile = data.get("usageCsv");
      if (usageFile instanceof File && usageFile.size > 0) {
        if (usageFile.size > 20 * 1024 * 1024) throw new Error("Keep DeepSeek CSV imports under 20 MB.");
        account.deepseekUsage = { ...summarizeDeepSeekAmountCsv(await usageFile.text()), importedAt: new Date().toISOString(), sourceName: usageFile.name };
      }
    } else {
      let result = await readLocalProvider(`/api/providers/${provider}/connect`, { profileKey });
      if (!result.connected) {
        // Not an error any more: needing to sign in is the expected path for
        // a second account, so the app opens the terminal and waits instead
        // of stopping with a failure the user has to react to.
        result = await runSignInFlow(provider, profileKey);
        if (!result) return;
      }
      const duplicateEmail = state.vaultData.accounts.some((existing) => existing.id !== accountId && existing.provider === provider
        && (existing.verifiedAccount?.email && existing.verifiedAccount.email.toLowerCase() === result.identity?.email?.toLowerCase()));
      if (duplicateEmail) throw new Error(`This ${providerName(provider)} login is already connected under a different profile in this vault.`);
      account.weeklyReservePercent = Number(data.get(provider === "claude" ? "claudeReserve" : "codexReserve") ?? 15);
      account.label = requestedLabel || result.identity?.email || `${providerName(provider)} ${result.identity?.planType ?? "account"}`;
      account.connector = { type: `${provider}-cli`, profileKey: result.profileKey };
      account.verifiedAccount = result.identity;
      account.verifiedAt = result.checkedAt;
      account.windows = result.windows ?? [];
      account.observedAt = result.windows?.length ? result.checkedAt : null;
      account.connectorError = result.usageError ?? null;
    }
    // Store the reading taken at setup so the very next refresh already has a
    // baseline to measure against.
    recordRefresh(account, new Date());
    state.vaultData.accounts.push(account);
    await persistVault();
    elements.account_form.reset();
    render();
    closeDialog(elements.account_dialog);
  } catch (error) {
    elements.account_dialog_status.textContent = error instanceof Error ? error.message : "Could not add this account.";
  } finally {
    updateProviderFields();
  }
});

document.addEventListener("click", async (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) closeDialog(document.getElementById(closeButton.dataset.closeDialog));
  if (event.target.closest("#add-account-button, #settings-add-button, [data-empty-add]")) {
    closeDialog(elements.settings_dialog);
    showAccountDialog();
  }
  const toggle = event.target.closest("[data-toggle-password]");
  if (toggle) {
    const input = document.getElementById(toggle.dataset.togglePassword);
    input.type = input.type === "password" ? "text" : "password";
    toggle.textContent = input.type === "password" ? "Show" : "Hide";
  }
  const refresh = event.target.closest("[data-refresh-deepseek]");
  if (refresh) {
    // render() at the end of refreshDeepSeek() replaces this button with a
    // fresh one anyway, so there is nothing to clean up here on the way
    // out — same reasoning as the subscription branch below.
    refresh.disabled = true;
    refresh.classList.add("spinning");
    await refreshDeepSeek(refresh.dataset.refreshDeepseek, elements.settings_dialog_status);
  }
  const refreshSubscription = event.target.closest("[data-refresh-subscription]");
  if (refreshSubscription) {
    const account = state.vaultData?.accounts.find((item) => item.id === refreshSubscription.dataset.refreshSubscription);
    if (account) {
      // Disabling alone stops a second click but is easy to miss; the same
      // spin used on the header's refresh icon makes "this is working, do
      // not click again" obvious at a glance. The button node itself gets
      // discarded by render()'s innerHTML rebuild in `finally` either way,
      // so there is no matching classList.remove() needed on the way out.
      refreshSubscription.disabled = true;
      refreshSubscription.classList.add("spinning");
      try {
        await refreshSubscriptionAccount(account);
      } catch (error) {
        account.connectorError = error instanceof Error ? error.message : "Provider refresh failed.";
        await persistVault();
      } finally {
        render();
      }
    }
  }
  const relinkAccount = event.target.closest("[data-relink-account]");
  if (relinkAccount) await showRelinkDialog(relinkAccount.dataset.relinkAccount);
  const renameAccount = event.target.closest("[data-rename-account]");
  if (renameAccount) showRenameDialog(renameAccount.dataset.renameAccount);
  const expandLedger = event.target.closest("[data-expand-ledger]");
  if (expandLedger) openLedgerDetail(expandLedger.dataset.expandLedger);
  const importUsage = event.target.closest("[data-import-deepseek-usage]");
  if (importUsage) {
    state.pendingUsageAccountId = importUsage.dataset.importDeepseekUsage;
    elements.deepseek_usage_input.click();
  }
  const remove = event.target.closest("[data-remove-account]");
  if (remove && confirm(localization.translate("Remove this encrypted account profile from this browser vault? Provider credentials outside this app are not changed."))) {
    state.vaultData.accounts = state.vaultData.accounts.filter((account) => account.id !== remove.dataset.removeAccount);
    await persistVault();
    render();
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-target]");
  if (!button) return;
  const source = document.getElementById(button.dataset.copyTarget);
  const command = source?.textContent;
  if (!command) return;
  try {
    await navigator.clipboard.writeText(command);
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy"; }, 1500);
  } catch {
    const status = elements.relink_dialog.open ? elements.relink_status : elements.account_dialog_status;
    status.textContent = "Copy failed. Select the command text and copy it manually.";
  }
});

elements.vault_button.addEventListener("click", () => {
  if (!requireUnlockedVault("settings")) return;
  renderConfiguredAccounts();
  openDialog(elements.settings_dialog);
});
elements.refresh_button.addEventListener("click", refreshAll);
elements.relink_verify_button.addEventListener("click", verifyRelink);

for (const [toggle, panel] of [
  [elements.signin_manual_toggle, elements.signin_manual],
  [elements.relink_manual_toggle, elements.relink_manual],
]) {
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
  });
}

// Re-opening the terminal is the one thing worth retrying by hand: a window
// closed by accident, or a login abandoned halfway. The wait already running
// keeps going, so this only has to put the window back.
elements.signin_reopen_button.addEventListener("click", async () => {
  const provider = String(new FormData(elements.account_form).get("provider"));
  const profileKey = new FormData(elements.account_form).get(`${provider}ProfileMode`) === "isolated" ? state.pendingProfileKey : "default";
  elements.signin_reopen_button.disabled = true;
  try {
    const launch = await openSignInWindow(provider, profileKey);
    renderCliCommand(launch.loginCommand);
    if (!launch.launched) {
      elements.signin_manual.hidden = false;
      elements.signin_manual_toggle.setAttribute("aria-expanded", "true");
      elements.cli_setup_copy.textContent = "AI Quota Meter could not open a terminal for you. Run this command yourself and this page will still pick it up automatically.";
    }
  } catch (error) {
    elements.account_dialog_status.textContent = error instanceof Error ? error.message : "Could not open the sign-in window.";
  } finally {
    elements.signin_reopen_button.disabled = false;
  }
});
// Preview the new icon color without changing the saved account until Save.
elements.rename_color_picker.addEventListener("change", (event) => {
  if (event.target.name !== "accentColor") return;
  const icon = elements.rename_color_picker.querySelector(".provider-monogram");
  if (!icon) return;
  for (const accent of ACCOUNT_COLORS) icon.classList.toggle(`account-accent-${accent}`, accent === event.target.value);
});

elements.rename_form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const account = state.vaultData?.accounts.find((item) => item.id === state.renameAccountId);
  if (!account) return;
  const label = elements.rename_input.value.trim();
  if (!label) {
    elements.rename_dialog_status.textContent = "Enter a name.";
    return;
  }
  elements.rename_save_button.disabled = true;
  try {
    account.label = label;
    const chosenColor = new FormData(elements.rename_form).get("accentColor");
    if (ACCOUNT_COLORS.includes(chosenColor)) account.color = chosenColor;
    await persistVault();
    closeDialog(elements.rename_dialog);
    render();
  } catch (error) {
    elements.rename_dialog_status.textContent = error instanceof Error ? error.message : "Could not save this name.";
  } finally {
    elements.rename_save_button.disabled = false;
  }
});
elements.ledger_detail_export.addEventListener("click", () => {
  const account = mergedAccounts().find((item) => item.id === state.ledgerDetailAccountId);
  if (!account) return;
  const hours = detailRangeHours();
  try {
    const blob = new Blob([toCsv(account, { hours })], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(account.label)}-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    // Nothing to export yet — the button stays a no-op rather than throwing.
  }
});
elements.mask_email_toggle.addEventListener("change", () => {
  state.maskEmail = elements.mask_email_toggle.checked;
  localStorage.setItem(MASK_EMAIL_STORAGE_KEY, state.maskEmail ? "1" : "0");
  render();
});
elements.lock_vault_button.addEventListener("click", () => { lockVault(); showVaultDialog("unlock"); });
elements.sign_out_button.addEventListener("click", () => {
  localStorage.removeItem(REMEMBER_STORAGE_KEY);
  lockVault();
  showVaultDialog("unlock");
  elements.vault_dialog_status.textContent = "Signed out of this device. Enter your passphrase to unlock again.";
});
elements.export_vault_button.addEventListener("click", () => {
  try {
    const blob = new Blob([encryptedVault.exportEncrypted()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-quota-meter-vault-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    elements.settings_dialog_status.textContent = "Encrypted backup downloaded.";
  } catch (error) {
    elements.settings_dialog_status.textContent = error instanceof Error ? error.message : "Export failed.";
  }
});
elements.import_vault_button.addEventListener("click", () => elements.vault_import_input.click());
elements.vault_import_input.addEventListener("change", async () => {
  const [file] = elements.vault_import_input.files ?? [];
  if (!file) return;
  if (!confirm(localization.translate("Replace the encrypted vault currently stored in this browser? Export it first if needed."))) return;
  try {
    encryptedVault.importEncrypted(await file.text());
    localStorage.removeItem(REMEMBER_STORAGE_KEY);
    state.vaultData = null;
    closeDialog(elements.settings_dialog);
    showVaultDialog("unlock");
  } catch (error) {
    elements.settings_dialog_status.textContent = error instanceof Error ? error.message : "Import failed.";
  } finally {
    elements.vault_import_input.value = "";
  }
});
elements.import_snapshot_button.addEventListener("click", () => elements.snapshot_input.click());
elements.snapshot_input.addEventListener("change", async () => {
  const [file] = elements.snapshot_input.files ?? [];
  if (!file) return;
  try {
    state.document = validateUsageDocument(JSON.parse(await file.text()));
    state.document.generatedAt ??= new Date().toISOString();
    state.previewActive = true;
    state.source = "live";
    state.demoMode = false;
    elements.settings_dialog_status.textContent = `${state.document.accounts.length} snapshot accounts loaded for this tab.`;
    render();
  } catch (error) {
    elements.settings_dialog_status.textContent = error instanceof Error ? error.message : "Snapshot import failed.";
  } finally {
    elements.snapshot_input.value = "";
  }
});
elements.deepseek_usage_input.addEventListener("change", async () => {
  const [file] = elements.deepseek_usage_input.files ?? [];
  const account = state.vaultData?.accounts.find((item) => item.id === state.pendingUsageAccountId && item.provider === "deepseek");
  if (!file || !account) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("Keep DeepSeek CSV imports under 20 MB.");
    account.deepseekUsage = { ...summarizeDeepSeekAmountCsv(await file.text()), importedAt: new Date().toISOString(), sourceName: file.name };
    await persistVault();
    elements.settings_dialog_status.textContent = `${account.label} usage imported locally from ${file.name}.`;
    render();
  } catch (error) {
    elements.settings_dialog_status.textContent = error instanceof Error ? error.message : "Usage import failed.";
  } finally {
    state.pendingUsageAccountId = null;
    elements.deepseek_usage_input.value = "";
  }
});
elements.delete_vault_button.addEventListener("click", () => {
  if (!confirm(localization.translate("Permanently remove this encrypted vault from this browser? This cannot be recovered without an exported backup."))) return;
  localStorage.removeItem(REMEMBER_STORAGE_KEY);
  encryptedVault.clear();
  state.vaultData = null;
  closeDialog(elements.settings_dialog);
  render();
  showVaultDialog("create");
});

async function initialize() {
  if (new URLSearchParams(location.search).get("demo") === "1") {
    state.demoMode = true;
    state.document = createDemoData();
    state.source = "demo";
  }
  if (location.protocol === "file:") {
    state.source = state.demoMode ? "demo" : "offline";
    state.localConnector = false;
  } else {
    await Promise.all([loadHealth(), state.demoMode ? Promise.resolve() : loadUsageFeed()]);
  }
  render();
  if (!state.demoMode) {
    const unlocked = await tryRememberedUnlock();
    if (unlocked) {
      render();
    } else {
      showVaultDialog(encryptedVault.exists() ? "unlock" : "create");
    }
  }
}

function switchLanguage(language) {
  const active = document.activeElement;
  const activeId = active?.id;
  const scrollPositions = new Map([...document.querySelectorAll("dialog .dialog-scroll, #ledger-detail-body")]
    .map((element) => [element, element.scrollTop]));
  localization.setLocale(language);
  state.languageSwitching = true;
  try { render(); } finally { state.languageSwitching = false; }
  localization.apply();
  requestAnimationFrame(() => {
    for (const [element, top] of scrollPositions) element.scrollTop = Math.min(top, Math.max(0, element.scrollHeight - element.clientHeight));
    if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
  });
  const announcement = document.getElementById("language-announcement");
  if (announcement) announcement.textContent = localization.announcement(language);
}

document.addEventListener("change", (event) => {
  const select = event.target.closest?.(".language-select");
  if (select) switchLanguage(select.value);
});
document.querySelectorAll(".language-select").forEach((select) => { select.value = localization.locale; });
localization.apply();
localization.observe();

initialize();
