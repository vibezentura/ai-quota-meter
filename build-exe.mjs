// Builds the double-clickable single-file app.
//
// Node's single-executable support can only run a CommonJS entry point, while
// the app is written as ES modules that also have to keep working under
// `npm start` and `node --test`. Rather than add a bundler dependency to a
// project that deliberately has none, this performs the same concatenation
// trick as build.mjs: each module becomes an immediately-invoked function that
// returns its exports, so no two modules can collide over a shared top-level
// name and every `import` becomes a lookup in one table.
//
// Everything the browser loads is embedded as a SEA asset rather than shipped
// beside the executable, so a release is exactly one file and there is no
// extraction directory for another process to tamper with.

import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const distribution = path.join(directory, "dist");
const windows = process.platform === "win32";
const executableName = `ai-quota-meter${windows ? ".exe" : ""}`;
const { version } = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));

// Node refuses to start a code-cached blob that was produced by a different
// build of Node than the one running it. That is fine for a release built in
// CI, but it turns a local rebuild after a Node upgrade into a confusing
// crash, so it stays opt-in.
const useCodeCache = process.env.AI_QUOTA_METER_CODE_CACHE === "1";

// Order matters: a module may only reference modules already defined above it.
const serverModules = [
  "cli-locator.js",
  "usage-core.js",
  "deepseek-connector.js",
  "codex-connector.js",
  "claude-connector.js",
];
const entryModule = "server.mjs";

// The exact set the server is willing to serve, mirrored from publicFiles in
// server.mjs. A name present there but missing here would 404 only in the
// bundled build, so the two lists are checked against each other below.
const browserAssets = [
  "app.bundle.js",
  "app.js",
  "crypto-vault.js",
  "deepseek-connector.js",
  "deepseek-usage.js",
  "demo-data.js",
  "favicon.svg",
  "index.html",
  "locale-boot.js",
  "styles.css",
  "theme-boot.js",
  "usage-core.js",
];

// shell is opt-in per call: npm ships npx as a .cmd shim that Node refuses to
// spawn directly on Windows, while node.exe itself lives under a path with a
// space in it that a shell would split apart.
function run(command, args, options = {}) {
  const shell = options.shell === true;
  const finalArgs = shell && windows ? args.map((value) => (/[\s&|<>^]/.test(value) ? `"${value}"` : value)) : args;
  return new Promise((resolve, reject) => {
    const child = spawn(command, finalArgs, { cwd: directory, stdio: "inherit", ...options, shell });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

// Fetches a build-only tool into a scratch prefix and returns its resolved
// entry point, rather than adding it to package.json: the project's stated
// design is zero runtime AND zero declared dev dependencies, and postject
// (below) is already fetched the same ad hoc way. --no-save keeps that true
// even though something has to be on disk temporarily to do the work.
async function ensureBuildTool(name) {
  const prefix = path.join(distribution, ".tools");
  await run("npm", ["install", "--no-save", "--prefix", prefix, name], { shell: true });
  const packageDirectory = path.join(prefix, "node_modules", name);
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
  const entry = typeof manifest.exports === "string" ? manifest.exports : manifest.main ?? "index.js";
  return pathToFileURL(path.join(packageDirectory, entry)).href;
}

async function embedWindowsMetadata(executable) {
  const rceditUrl = await ensureBuildTool("rcedit");
  const { rcedit } = await import(rceditUrl);
  await rcedit(executable, {
    icon: path.join(directory, "assets", "icon.ico"),
    "version-string": {
      // rcedit's underlying binary takes these on a native command line and
      // silently mangles anything outside plain ASCII (an em dash and a
      // copyright sign both came out wrong in testing) — worth avoiding
      // rather than relying on however a given machine's codepage falls back.
      ProductName: "AI Quota Meter",
      FileDescription: "AI Quota Meter - local-first AI usage dashboard",
      CompanyName: "AI Quota Meter",
      OriginalFilename: path.basename(executable),
      LegalCopyright: `Copyright (c) ${new Date().getFullYear()} AI Quota Meter contributors. MIT licensed.`,
    },
    "file-version": version,
    "product-version": version,
  });
}

const nodeImportPattern = /^import\s+(?:(\{[^}]*\})|(\w+))\s+from\s+"(node:[\w/]+)";$/;
const localImportPattern = /^import\s+\{([^}]*)\}\s+from\s+"\.\/([\w.-]+)";$/;
const exportPattern = /^export\s+(?:async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/;

function transformModule(name, source) {
  const exported = [];
  // Windows checkouts can normalize line endings to CRLF depending on the
  // machine's core.autocrlf setting — a bare "\n" split then leaves a
  // trailing \r on every line, which silently breaks every "$"-anchored
  // pattern below. Splitting on \r?\n keeps the transform independent of
  // whatever line endings Git handed it.
  const lines = source.split(/\r?\n/).map((line) => {
    const nodeImport = nodeImportPattern.exec(line);
    if (nodeImport) {
      const binding = nodeImport[1] ?? nodeImport[2];
      return `const ${binding} = require("${nodeImport[3]}");`;
    }
    const localImport = localImportPattern.exec(line);
    if (localImport) {
      const target = localImport[2];
      if (!serverModules.includes(target)) throw new Error(`${name} imports ${target}, which is not in serverModules.`);
      return `const {${localImport[1]}} = __modules[${JSON.stringify(target)}];`;
    }
    if (/^import\s/.test(line)) throw new Error(`${name} has an import form the bundler does not understand: ${line}`);
    const exportName = exportPattern.exec(line);
    if (exportName) exported.push(exportName[1]);
    return line.replace(/^export\s+/, "");
  });
  return { body: lines.join("\n"), exported };
}

async function bundleServer() {
  const parts = [];
  for (const name of serverModules) {
    const { body, exported } = transformModule(name, await readFile(path.join(directory, name), "utf8"));
    parts.push(`__modules[${JSON.stringify(name)}] = (() => {\n${body}\nreturn { ${exported.join(", ")} };\n})();`);
  }

  let entry = await readFile(path.join(directory, entryModule), "utf8");
  // import.meta has no meaning in CommonJS, and inside the executable there is
  // no source directory anyway. The directory is only used as the working
  // directory for the provider CLIs, so the executable's own location is the
  // honest answer.
  const appDirectoryLine = "const appDirectory = path.dirname(fileURLToPath(import.meta.url));";
  if (!entry.includes(appDirectoryLine)) throw new Error(`${entryModule} no longer defines appDirectory the way the bundler expects.`);
  entry = entry.replace(appDirectoryLine, "const appDirectory = path.dirname(process.execPath);");

  const transformedEntry = transformModule(entryModule, entry);
  // fileURLToPath survives as an unused import after the replacement above;
  // leaving the require in place is harmless and keeps the transform dumb.
  parts.push(transformedEntry.body);

  const bundle = [
    "// Generated by npm run build:exe. Edit the source modules, not this file.",
    '"use strict";',
    "const __modules = Object.create(null);",
    ...parts,
  ].join("\n\n");

  const file = path.join(distribution, "ai-quota-meter.cjs");
  await writeFile(file, `${bundle}\n`, "utf8");
  return file;
}

async function verifyAssetList() {
  const source = await readFile(path.join(directory, entryModule), "utf8");
  const declared = /const publicFiles = new Set\(\[([^\]]*)\]\);/.exec(source);
  if (!declared) throw new Error(`Could not read publicFiles from ${entryModule}.`);
  const names = [...declared[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
  const missing = names.filter((name) => !browserAssets.includes(name));
  const extra = browserAssets.filter((name) => !names.includes(name));
  if (missing.length || extra.length) {
    throw new Error(`browserAssets is out of sync with publicFiles in ${entryModule}. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`);
  }
}

async function main() {
  await rm(distribution, { recursive: true, force: true });
  await mkdir(distribution, { recursive: true });

  // The interface the executable embeds has to be the current one.
  await run(process.execPath, ["build.mjs"]);
  await verifyAssetList();

  const entry = await bundleServer();
  // A syntax error in the generated bundle should fail the build here, not on
  // a user's machine after they double-click a 90 MB download.
  await run(process.execPath, ["--check", entry]);

  const configuration = path.join(distribution, "sea-config.json");
  await writeFile(configuration, `${JSON.stringify({
    main: path.relative(directory, entry).replaceAll("\\", "/"),
    output: "dist/ai-quota-meter.blob",
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache,
    assets: Object.fromEntries(browserAssets.map((name) => [name, name])),
  }, null, 2)}\n`, "utf8");

  await run(process.execPath, ["--experimental-sea-config", path.relative(directory, configuration).replaceAll("\\", "/")]);

  const executable = path.join(distribution, executableName);
  await copyFile(process.execPath, executable);

  // Icon and version metadata go in before postject, not after: rcedit
  // rewrites the PE resource directory, and doing that on a node.exe that
  // already has the multi-hundred-MB SEA blob injected as its own section
  // sent rcedit into a multi-minute pathological rewrite (observed:
  // 1400+ CPU-seconds and climbing on a 92 MB post-injection binary). A
  // stock node.exe copy has a normal, small resource section, so the same
  // edit finishes in a couple of seconds — then postject only has to append
  // a section, which it does regardless of what rcedit already wrote.
  if (windows) await embedWindowsMetadata(executable);

  const postjectArguments = [
    "--yes", "postject", executable, "NODE_SEA_BLOB", path.join(distribution, "ai-quota-meter.blob"),
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ];
  if (process.platform === "darwin") postjectArguments.push("--macho-segment-name", "NODE_SEA");
  await run("npx", postjectArguments, { shell: true });

  const { size } = await stat(executable);
  process.stdout.write(`\nBuilt ${path.relative(directory, executable)} (${(size / 1024 / 1024).toFixed(1)} MB)\n`);
  process.stdout.write("This build is unsigned: Windows SmartScreen will show \"Windows protected your PC\" until the user selects More info, then Run anyway.\n");
}

await main();
