// Copies the already-built portable exe (../dist/ai-quota-meter.exe, produced
// by `npm run build:exe` in the project root) into src-tauri/binaries under
// the target-triple-suffixed name Tauri's sidecar mechanism requires. This
// shell has no server logic of its own to build — it only ever wraps
// whatever the root project already produced.
import { copyFile, mkdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(directory, "..", "dist", "ai-quota-meter.exe");
const binaries = path.join(directory, "src-tauri", "binaries");

try {
  await stat(source);
} catch {
  throw new Error(`${source} does not exist yet. Run "npm run build:exe" in the project root first.`);
}

// rustc knows the exact triple for whatever toolchain is actually installed
// (x86_64 vs. arm64, msvc vs. gnu) — hardcoding "x86_64-pc-windows-msvc"
// would silently produce a sidecar Tauri can't find on any other host.
const triple = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
  .split("\n")
  .find((line) => line.startsWith("host: "))
  ?.slice("host: ".length)
  .trim();
if (!triple) throw new Error("Could not determine the Rust host target triple from `rustc -vV`.");

await mkdir(binaries, { recursive: true });
const destination = path.join(binaries, `ai-quota-meter-${triple}.exe`);
await copyFile(source, destination);
process.stdout.write(`Copied sidecar to ${path.relative(directory, destination)}\n`);
