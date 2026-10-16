import { OFFICIAL_INSTALLERS, standaloneBinaryPaths } from "./cli-locator.js";

// The text of the throwaway sign-in script server.mjs opens in a terminal,
// kept here as pure functions so the exact lines (quoting, the installer step,
// which binary runs) are unit-tested without opening a window or installing
// anything.
//
// Nothing here is user-supplied: the provider is one of two literals, and the
// profile directory is built from a key already validated against
// /^[a-zA-Z0-9-]{8,64}$/, so neither can inject shell syntax. Paths that come
// from the environment (a Windows user name) are still quoted and escaped.

export const LOGIN_HEADINGS = Object.freeze({ claude: "Claude", codex: "Codex" });

// Codex uses its normal browser sign-in. `--device-auth` only works after the
// user has switched device-code login on in their ChatGPT security settings,
// which most people never have, so it failed for exactly the users who needed
// this to be easy.
export const LOGIN_ARGS = Object.freeze({ claude: "auth login --claudeai", codex: "login" });

export function profileVariable(provider) {
  return provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
}

export function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function shellLiteral(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

// A .cmd file expands %NAME% even inside quotes, so a literal % in a path (a
// Windows user name may contain one) has to be doubled.
function cmdEscape(value) {
  return String(value).replaceAll("%", "%%");
}

// Where the official installer will have put the binary once it has run.
function installTarget(provider, options) {
  return standaloneBinaryPaths(provider, options)[0];
}

// How the script starts the CLI. A standalone executable is run by absolute
// path: the terminal inherits this app's environment, which predates any PATH
// change an installer made after the app started.
function windowsCliInvocation(provider, located, options) {
  if (!located) return `"${cmdEscape(installTarget(provider, options))}"`;
  if (located.shell) return located.command;
  return [located.command, ...located.prefixArgs].map((part) => `"${cmdEscape(part)}"`).join(" ");
}

// `located` is locateProviderCli()'s answer; null means the script installs
// the provider's official tool before signing in.
export function windowsSignInScript(provider, { directory = null, located = null, environment = process.env } = {}) {
  const options = { environment, platform: "win32" };
  const installer = OFFICIAL_INSTALLERS[provider];
  const installSteps = located ? [] : [
    `echo AI Quota Meter needs ${installer.name} to sign in to ${LOGIN_HEADINGS[provider]}.`,
    "echo Installing it now with the official installer. No administrator rights are needed.",
    "echo.",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${installer.windows}"`,
    `if not exist "${cmdEscape(installTarget(provider, options))}" (`,
    "  echo.",
    `  echo ${installer.name} did not finish installing. Check the messages above, then try again from AI Quota Meter.`,
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
  ];
  const lines = [
    "@echo off",
    "title AI Quota Meter - sign in",
    ...(directory ? [`set "${profileVariable(provider)}=${cmdEscape(directory)}"`] : []),
    ...installSteps,
    `echo Signing in to ${LOGIN_HEADINGS[provider]} for AI Quota Meter.`,
    "echo Follow the steps below. AI Quota Meter notices on its own when you are done.",
    "echo.",
    `${windowsCliInvocation(provider, located, options)} ${LOGIN_ARGS[provider]}`,
    "echo.",
    "echo Finished - you can close this window and go back to AI Quota Meter.",
    "pause",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function unixSignInScript(provider, { directory = null, located = null } = {}) {
  const installer = OFFICIAL_INSTALLERS[provider];
  const installSteps = located ? [] : [
    `echo "AI Quota Meter needs ${installer.name} to sign in to ${LOGIN_HEADINGS[provider]}."`,
    `echo "Installing it now with the official installer."`,
    "echo",
    `${installer.unix} || { echo; echo "${installer.name} did not finish installing. Check the messages above, then try again from AI Quota Meter."; exit 1; }`,
    // The installers put the binary in ~/.local/bin; this shell started before
    // any profile change they made, so add it here.
    'export PATH="$HOME/.local/bin:$PATH"',
    "echo",
  ];
  const invocation = located?.standalone ? shellLiteral(located.command) : provider;
  const lines = [
    "#!/bin/sh",
    ...(directory ? [`export ${profileVariable(provider)}=${shellLiteral(directory)}`] : []),
    ...installSteps,
    `echo "Signing in to ${LOGIN_HEADINGS[provider]} for AI Quota Meter."`,
    `echo "Follow the steps below. AI Quota Meter notices on its own when you are done."`,
    "echo",
    `${invocation} ${LOGIN_ARGS[provider]}`,
    "echo",
    `echo "Finished - you can close this window and go back to AI Quota Meter."`,
  ];
  return `${lines.join("\n")}\n`;
}

// The copy-it-yourself fallback when the tool is missing: the provider's own
// installer, then the sign-in, run by the path the installer just created.
// Windows gets a PowerShell line only — the installer itself is PowerShell.
export function manualInstallCommand(provider, directory, { environment = process.env, platform = process.platform } = {}) {
  const installer = OFFICIAL_INSTALLERS[provider];
  const variable = profileVariable(provider);
  if (platform === "win32") {
    const target = installTarget(provider, { environment, platform });
    const assignment = directory ? `$env:${variable}=${powershellLiteral(directory)}; ` : "";
    return { powershell: `${installer.windows}; ${assignment}& ${powershellLiteral(target)} ${LOGIN_ARGS[provider]}` };
  }
  const assignment = directory ? `${variable}=${shellLiteral(directory)} ` : "";
  return { command: `${installer.unix} && ${assignment}PATH="$HOME/.local/bin:$PATH" ${provider} ${LOGIN_ARGS[provider]}` };
}
