<p align="center">
  <a href="../README.md"><img src="../assets/png/icon-256.png" width="80" height="80" alt="AI Quota Meter app icon"></a>
</p>

<h1 align="center">AI Quota Meter</h1>
<p align="center"><strong>Desktop app</strong></p>
<p align="center"><a href="../README.md">Project overview</a> · <a href="#build-it">Build</a> · <a href="#how-it-works">How it works</a> · <a href="#installer-updates">Updates</a></p>

A native window around the same [`ai-quota-meter.exe`](../README.md) the portable build and installer ship — no browser tab, a tray icon, minimize-to-tray instead of quit, one instance per machine. This directory is the only part of the project with build-time dependencies; the dashboard and its Node server (everything one level up) stay dependency-free.

## At a glance

| Detail | Desktop edition |
| --- | --- |
| Window | Native Tauri shell using the same local dashboard |
| Close button | Minimizes to the system tray |
| Exit | Right-click the tray icon → **Quit** |
| Local address | `http://127.0.0.1:47313/` |
| Windows installer | NSIS, with existing-install update detection |

## How it works

- `src-tauri/src/main.rs` spawns `ai-quota-meter.exe` as a sidecar on a **fixed** port (47313), and shows a small "Starting…" page (`dist-loading/`) while polling `/api/health` for it to come up.
- Once the sidecar answers, the window navigates to `http://127.0.0.1:47313/` — the real dashboard, served exactly as it is over `npm start`.
- Closing the window hides it to the tray instead of exiting; the sidecar keeps running so reopening is instant. **Left-click** the tray icon to reopen it, **right-click** for the menu, and Tray → **Quit** to actually stop it.
- The sidecar is assigned to a Windows job object tied to the shell's lifetime, so it cannot outlive the app even if the shell is force-killed rather than quit.
- Launching a second instance focuses the existing window instead of starting a second sidecar. If a sidecar from a previous run is still healthy on the port, it is adopted rather than duplicated.

Everything security-relevant — the vault, the loopback-only DeepSeek gate, the Claude/Codex connectors — lives in the sidecar and is unchanged. See the [root SECURITY.md](../SECURITY.md) and [../CLAUDE.md](../CLAUDE.md) (architecture notes and known traps for the whole project, including this shell).

### Why the port is fixed

The vault lives in the webview's local storage, and local storage is partitioned per **origin** — which includes the port. Asking the OS for a free port at startup (which this did before 0.2.1) therefore handed every launch a different origin, an empty vault, and a fresh "create your passphrase" prompt, while the real data sat unreachable under the previous launch's port.

47313 sits below Windows' ephemeral range, so the OS won't hand it out from under the app, and it deliberately isn't 4173 — the browser builds keep that one, so a desktop app and an `npm start` session can run side by side. `AI_QUOTA_METER_DESKTOP_PORT` overrides it if something else already holds the port.

That override is also how to reach a vault stranded by a pre-0.2.1 build: launch once with `AI_QUOTA_METER_DESKTOP_PORT` set to the old port (the one that was in the address of the browser tab those versions opened), then **Vault → export an encrypted backup**, relaunch normally, and import it.

## Build it

### Prerequisites

| Tool | Purpose |
| --- | --- |
| Node.js 20+ | Build the dashboard and run the Tauri CLI. |
| [Rust toolchain](https://rustup.rs/) | Compile the native shell. |
| [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) | On Windows, install **Desktop development with C++** for linking. |
| WebView2 | Render the native window; included with Windows 11. |

### Build commands

```bash
# from the project root
npm run build:exe        # builds dist/ai-quota-meter.exe — the sidecar

cd desktop
npm install
npm run build             # copies the sidecar in, then runs `tauri build`
```

Output: `src-tauri/target/release/bundle/nsis/AI Quota Meter_<version>_x64-setup.exe` — an installer, same unsigned-build caveat as the portable exe (SmartScreen → More info → Run anyway). The plain shell binary is at `src-tauri/target/release/ai-quota-meter-desktop.exe` if you want to run it without installing.

### Development mode

`npm run dev` does the same sidecar copy, then `tauri dev` for a faster edit-the-Rust-shell loop.

## Installer updates

The NSIS maintenance page detects an installed version. For an upgrade it shows `Update <installed> to <incoming>` and defaults to **Update** without running the old uninstaller. Existing accounts and settings stay in place. The same version offers **Reinstall** or **Uninstall**. An older installer warns about the newer installation and disables in-place downgrades.

<details>
<summary><strong>Installer implementation notes</strong></summary>

`src-tauri/windows/English.nsh` customizes Tauri's maintenance labels and sets the upgrade default through the standard MUI GUI initialization callback registered in `installer-hooks.nsh`. It relies on Tauri's `UNINSTKEY` and `ReinstallPageCheck` variables; recheck the wizard when updating the Tauri CLI. Keep `productName`, publisher, identifier, and installation scope stable so updates find existing installations and retain their data.

</details>

See [installer verification](../installer/README.md) for the test cases and framework references.

## Icons

`src-tauri/icons/` are copied from `../assets/png/*.png` and `../assets/icon.ico` — regenerate there (see [../assets/](../assets/)) rather than editing these directly if the mark ever changes. They need to be RGBA (`../assets/png-to-rgba.mjs` converts Playwright's RGB screenshots); Tauri's tray-icon loader rejects plain RGB with an unhelpful `proc macro panicked` build error.

<p align="center"><a href="../README.md">← Back to AI Quota Meter</a></p>
