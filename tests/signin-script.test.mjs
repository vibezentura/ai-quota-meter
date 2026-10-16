import assert from "node:assert/strict";
import test from "node:test";
import { manualInstallCommand, unixSignInScript, windowsSignInScript } from "../signin-script.js";

const environment = { USERPROFILE: "C:\\Users\\sam", LOCALAPPDATA: "C:\\Users\\sam\\AppData\\Local" };
const claudeTarget = "C:\\Users\\sam\\.local\\bin\\claude.exe";
const codexTarget = "C:\\Users\\sam\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe";

test("a missing Claude Code is installed with Anthropic's own installer, then signed in by full path", () => {
  const script = windowsSignInScript("claude", { environment });
  assert.match(script, /powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https:\/\/claude\.ai\/install\.ps1 \| iex"/);
  assert.ok(script.includes(`if not exist "${claudeTarget}" (`));
  assert.ok(script.includes(`"${claudeTarget}" auth login --claudeai`));
  // Install must come before sign-in, and a failed install must stop there.
  assert.ok(script.indexOf("install.ps1") < script.indexOf("auth login"));
  assert.match(script, /exit \/b 1/);
  assert.ok(script.endsWith("\r\n"));
});

test("a missing Codex uses OpenAI's installer and the browser sign-in, not device auth", () => {
  const script = windowsSignInScript("codex", { environment, directory: "C:\\Data\\profiles\\codex\\abcd1234" });
  assert.match(script, /irm https:\/\/chatgpt\.com\/codex\/install\.ps1 \| iex/);
  assert.ok(script.includes(`"${codexTarget}" login\r\n`));
  assert.doesNotMatch(script, /device-auth/);
  assert.ok(script.includes('set "CODEX_HOME=C:\\Data\\profiles\\codex\\abcd1234"'));
});

test("an installed tool skips the installer and runs the located binary", () => {
  const located = { command: claudeTarget, prefixArgs: [], standalone: true };
  const script = windowsSignInScript("claude", { environment, located });
  assert.doesNotMatch(script, /install\.ps1/);
  assert.ok(script.includes(`"${claudeTarget}" auth login --claudeai`));
  const viaNode = windowsSignInScript("codex", { environment, located: { command: "C:\\node\\node.exe", prefixArgs: ["C:\\npm\\codex.js"], standalone: false } });
  assert.ok(viaNode.includes('"C:\\node\\node.exe" "C:\\npm\\codex.js" login'));
});

test("a percent sign in a Windows path cannot expand as a cmd variable", () => {
  const script = windowsSignInScript("claude", { environment: { USERPROFILE: "C:\\Users\\100%sam" }, directory: "C:\\p\\50%off" });
  assert.ok(script.includes("C:\\Users\\100%%sam\\.local\\bin\\claude.exe"));
  assert.ok(script.includes('set "CLAUDE_CONFIG_DIR=C:\\p\\50%%off"'));
});

test("the macOS/Linux script installs, puts ~/.local/bin on PATH, and quotes the profile", () => {
  const script = unixSignInScript("claude", { directory: "/home/o'neil/profiles/claude/abcd1234" });
  assert.match(script, /curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash \|\| \{/);
  assert.ok(script.includes('export PATH="$HOME/.local/bin:$PATH"'));
  assert.ok(script.includes("export CLAUDE_CONFIG_DIR='/home/o'\\''neil/profiles/claude/abcd1234'"));
  assert.ok(script.includes("\nclaude auth login --claudeai\n"));
  assert.doesNotMatch(unixSignInScript("codex", { located: { command: "/usr/local/bin/codex", prefixArgs: [], standalone: true } }), /install\.sh/);
});

test("the copy-it-yourself fallback chains the installer and the sign-in", () => {
  assert.deepEqual(manualInstallCommand("claude", null, { environment, platform: "win32" }), {
    powershell: `irm https://claude.ai/install.ps1 | iex; & '${claudeTarget}' auth login --claudeai`,
  });
  const codex = manualInstallCommand("codex", "/tmp/profile", { environment: { HOME: "/home/sam" }, platform: "linux" });
  assert.equal(codex.command, `curl -fsSL https://chatgpt.com/codex/install.sh | sh && CODEX_HOME='/tmp/profile' PATH="$HOME/.local/bin:$PATH" codex login`);
});
