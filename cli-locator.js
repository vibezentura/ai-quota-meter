import { existsSync } from "node:fs";
import { isSea } from "node:sea";
import path from "node:path";

// npm installs a global package as a launcher shim (claude.cmd) sitting beside
// the node_modules tree that holds the real binary. Under `npm start` the
// running node.exe happens to live in that same directory, so a single
// process.execPath lookup was enough. Inside the single-file build
// process.execPath is this app, not Node — so the search has to consider every
// directory that could plausibly hold a global install instead.
export function toolDirectories(environment = process.env) {
  const directories = [];
  const add = (value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed && !directories.includes(trimmed)) directories.push(trimmed);
  };
  if (!isSea()) add(path.dirname(process.execPath));
  if (environment.APPDATA) add(path.join(environment.APPDATA, "npm"));
  for (const entry of (environment.PATH ?? environment.Path ?? "").split(path.delimiter)) add(entry);
  return directories;
}

// Resolves the real executable inside a globally installed npm package rather
// than the .cmd shim beside it: Node refuses to spawn .cmd without shell:true,
// and shell:true with array arguments is an injection risk.
export function findPackageBinary(segments, options = {}) {
  const exists = options.exists ?? existsSync;
  for (const directory of toolDirectories(options.environment)) {
    const candidate = path.join(directory, "node_modules", ...segments);
    if (exists(candidate)) return candidate;
  }
  return null;
}

// A package whose entry point is plain JavaScript needs a Node runtime to run
// it. The single-file build is not one, so it has to find a real node binary —
// normally the one sitting in the same directory as the shim it just resolved.
export function findNodeExecutable(options = {}) {
  if (!isSea()) return process.execPath;
  const exists = options.exists ?? existsSync;
  const name = process.platform === "win32" ? "node.exe" : "node";
  for (const directory of toolDirectories(options.environment)) {
    const candidate = path.join(directory, name);
    if (exists(candidate)) return candidate;
  }
  return null;
}

// The providers' own installers, run verbatim. Claude sign-in is only
// permitted through Anthropic's unmodified Claude Code binary (see CLAUDE.md,
// "Compliance boundary"), and Codex limits are only exposed by Codex itself,
// so when a tool is missing the app installs the official one rather than
// signing anyone in on its own. Neither installer needs Node.js or admin
// rights.
export const OFFICIAL_INSTALLERS = Object.freeze({
  claude: Object.freeze({
    name: "Claude Code",
    windows: "irm https://claude.ai/install.ps1 | iex",
    unix: "curl -fsSL https://claude.ai/install.sh | bash",
  }),
  codex: Object.freeze({
    name: "Codex",
    windows: "irm https://chatgpt.com/codex/install.ps1 | iex",
    unix: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
  }),
});

// Where each official standalone installer puts its binary. These are checked
// by exact path, not just through PATH: the installers add their folder to
// the *user* PATH, which only processes started afterwards inherit — so a tool
// installed while this app is running would otherwise stay invisible to it
// until the app restarted.
export function standaloneBinaryPaths(provider, options = {}) {
  const environment = options.environment ?? process.env;
  const windows = (options.platform ?? process.platform) === "win32";
  const join = windows ? path.win32.join : path.posix.join;
  const home = windows ? environment.USERPROFILE : environment.HOME;
  const paths = [];
  if (provider === "claude") {
    if (home) paths.push(join(home, ".local", "bin", windows ? "claude.exe" : "claude"));
    return paths;
  }
  if (environment.CODEX_INSTALL_DIR) paths.push(join(environment.CODEX_INSTALL_DIR, windows ? "codex.exe" : "codex"));
  if (windows && environment.LOCALAPPDATA) paths.push(join(environment.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "bin", "codex.exe"));
  if (!windows && home) paths.push(join(home, ".local", "bin", "codex"));
  return paths;
}

function findOnPath(fileName, environment, exists) {
  for (const entry of (environment.PATH ?? environment.Path ?? "").split(path.delimiter)) {
    const directory = entry.trim();
    if (!directory) continue;
    const candidate = path.join(directory, fileName);
    if (exists(candidate)) return candidate;
  }
  return null;
}

// Resolves how to run a provider CLI, or null when it is not installed.
// Returns { command, prefixArgs, shell?, standalone } — `standalone` marks a
// self-contained executable that a terminal script can run by absolute path.
export function locateProviderCli(provider, options = {}) {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  const windows = platform === "win32";
  const standalone = standaloneBinaryPaths(provider, { environment, platform }).find((candidate) => exists(candidate));
  const binary = (command) => ({ command, prefixArgs: [], standalone: true });

  if (provider === "claude") {
    const fromNpm = windows ? findPackageBinary(["@anthropic-ai", "claude-code", "bin", "claude.exe"], { environment, exists }) : null;
    const found = fromNpm ?? standalone ?? findOnPath(windows ? "claude.exe" : "claude", environment, exists);
    return found ? binary(found) : null;
  }

  if (provider === "codex") {
    // The standalone build is OpenAI's primary install route now, and a
    // native executable needs no Node runtime at all — so it wins.
    const native = standalone ?? findOnPath(windows ? "codex.exe" : "codex", environment, exists);
    if (native) return binary(native);
    if (!windows) return null;
    const scriptPath = findPackageBinary(["@openai", "codex", "bin", "codex.js"], { environment, exists });
    const nodeExecutable = scriptPath ? findNodeExecutable({ environment, exists }) : null;
    if (scriptPath && nodeExecutable) return { command: nodeExecutable, prefixArgs: [scriptPath], standalone: false };
    // Another package manager's shim (pnpm, yarn, bun). It can only start
    // through cmd.exe; the arguments passed to it are fixed literals.
    if (findOnPath("codex.cmd", environment, exists)) return { command: "codex.cmd", prefixArgs: [], shell: true, standalone: false };
    return null;
  }
  return null;
}

// Thrown (and recognised by the server) when a provider CLI is simply absent,
// so the dialog can offer to install it instead of showing a dead-end error.
export class CliNotInstalledError extends Error {
  constructor(provider) {
    super(`${OFFICIAL_INSTALLERS[provider]?.name ?? provider} is not installed on this computer.`);
    this.code = "CLI_NOT_INSTALLED";
    this.provider = provider;
  }
}
