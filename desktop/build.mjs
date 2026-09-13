// Copies in the sidecar, then runs `tauri build` with the version stamped
// from the root project's package.json rather than whatever static value
// last happened to be committed in tauri.conf.json — otherwise every release
// after the first would silently ship an installer still labeled 0.1.0.
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(await readFile(path.join(directory, "..", "package.json"), "utf8"));

execFileSync(process.execPath, [path.join(directory, "prepare-sidecar.mjs")], { stdio: "inherit" });

// A recent Node security fix (CVE-2024-27980) made running a .cmd/.bat file
// — which is what npx resolves to on Windows — require shell:true, and
// shell:true on Windows hands the whole array to cmd.exe as one naively
// space-joined string, stripping every quote out of an inline JSON
// --config value before tauri ever sees it. Writing the override to a file
// and passing that path (which --config also accepts) sidesteps the
// quoting problem entirely instead of fighting cmd.exe's escaping rules.
const configOverride = path.join(os.tmpdir(), `ai-quota-meter-desktop-version-${process.pid}.json`);
await writeFile(configOverride, JSON.stringify({ version }));
try {
  execFileSync("npx", ["tauri", "build", "--config", configOverride], {
    cwd: directory,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} finally {
  await rm(configOverride, { force: true });
}
