import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { CliNotInstalledError, locateProviderCli, standaloneBinaryPaths } from "../cli-locator.js";

// The installer-location rules take a platform option, but PATH and npm
// lookups use the host's path module, so the lookup tests describe a layout
// built with path.join and run the same on any host.
const home = path.join(path.sep, "home", "sam");
const environment = {
  USERPROFILE: home,
  HOME: home,
  LOCALAPPDATA: path.join(home, "AppData", "Local"),
  APPDATA: path.join(home, "AppData", "Roaming"),
  PATH: "",
};
const platform = process.platform;
const exe = (name) => (platform === "win32" ? `${name}.exe` : name);
const only = (...files) => (candidate) => files.includes(candidate);

test("official installer locations match what each installer documents", () => {
  const windows = { USERPROFILE: "C:\\Users\\sam", LOCALAPPDATA: "C:\\Users\\sam\\AppData\\Local" };
  assert.deepEqual(standaloneBinaryPaths("claude", { environment: windows, platform: "win32" }), ["C:\\Users\\sam\\.local\\bin\\claude.exe"]);
  assert.deepEqual(standaloneBinaryPaths("codex", { environment: windows, platform: "win32" }), ["C:\\Users\\sam\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe"]);
  assert.equal(standaloneBinaryPaths("codex", { environment: { ...windows, CODEX_INSTALL_DIR: "D:\\tools\\codex" }, platform: "win32" })[0], "D:\\tools\\codex\\codex.exe");
  assert.deepEqual(standaloneBinaryPaths("claude", { environment: { HOME: "/home/sam" }, platform: "linux" }), ["/home/sam/.local/bin/claude"]);
});

test("a tool installed by its standalone installer is found without any PATH change", () => {
  const [claude] = standaloneBinaryPaths("claude", { environment, platform });
  const codex = standaloneBinaryPaths("codex", { environment, platform }).at(-1);
  assert.deepEqual(locateProviderCli("claude", { environment, platform, exists: only(claude) }), { command: claude, prefixArgs: [], standalone: true });
  assert.deepEqual(locateProviderCli("codex", { environment, platform, exists: only(codex) }), { command: codex, prefixArgs: [], standalone: true });
});

test("a tool on PATH is found by exact file, not assumed", () => {
  const bin = path.join(home, "bin");
  const claude = path.join(bin, exe("claude"));
  const withPath = { ...environment, PATH: bin };
  assert.equal(locateProviderCli("claude", { environment: withPath, platform, exists: only(claude) }).command, claude);
  assert.equal(locateProviderCli("claude", { environment: withPath, platform, exists: () => false }), null);
});

test("on Windows, standalone codex.exe wins over an npm install, and npm still works on its own", { skip: platform !== "win32" }, () => {
  const script = path.join(environment.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
  const codex = standaloneBinaryPaths("codex", { environment, platform }).at(-1);
  assert.equal(locateProviderCli("codex", { environment, platform, exists: only(script, codex) }).command, codex);
  const viaNpm = locateProviderCli("codex", { environment, platform, exists: only(script) });
  assert.deepEqual(viaNpm.prefixArgs, [script]);
  assert.equal(viaNpm.standalone, false);
});

test("a missing tool resolves to null, and its error is recognisable", () => {
  assert.equal(locateProviderCli("claude", { environment, platform, exists: () => false }), null);
  assert.equal(locateProviderCli("codex", { environment, platform, exists: () => false }), null);
  const error = new CliNotInstalledError("claude");
  assert.equal(error.code, "CLI_NOT_INSTALLED");
  assert.match(error.message, /Claude Code is not installed/);
});
