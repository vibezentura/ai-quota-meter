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
  for (const directory of toolDirectories(options.environment)) {
    const candidate = path.join(directory, "node_modules", ...segments);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// A package whose entry point is plain JavaScript needs a Node runtime to run
// it. The single-file build is not one, so it has to find a real node binary —
// normally the one sitting in the same directory as the shim it just resolved.
export function findNodeExecutable(options = {}) {
  if (!isSea()) return process.execPath;
  const name = process.platform === "win32" ? "node.exe" : "node";
  for (const directory of toolDirectories(options.environment)) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
