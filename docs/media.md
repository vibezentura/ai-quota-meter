# README screenshots and GIF

The README uses captures of the real browser interface, not mockups. Dashboard
values come from `createDemoData()` in `demo-data.js`. Setup captures use a new,
empty vault with no provider accounts, identities, or API keys.

## Recreate the media

The capture helper requires **Node.js 22+** and an installed Chrome, Chromium, or
Edge browser. This tooling requirement does not change the app's Node.js 20+
requirement. It uses Node built-ins; no npm packages are needed.

From the repository root:

```sh
node docs/capture-media.mjs
```

For the GIF as well, install FFmpeg separately and put it on `PATH`, then run:

```sh
node docs/capture-media.mjs --gif
```

The script detects common browser locations. For another location, set
`CHROME_PATH` to the browser executable. `FFMPEG_PATH` can similarly point at the
FFmpeg executable. For example, in PowerShell:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node docs/capture-media.mjs --gif
```

The script rebuilds `app.bundle.js`, starts its own loopback server on an available
port, and opens a headless browser with a new temporary profile. It uses an isolated
app data directory and ignores any configured snapshot feed. Provider API routes
are blocked by the capture browser; encountering one makes capture fail. No provider
connect button is submitted and no sign-in terminal is opened.

The demo clock is fixed at **2026-09-18 10:00 UTC** so readings and countdowns remain
consistent between captures. Dark mode and disabled decorative animations are set
only in the temporary browser. The light screenshot uses the actual theme toggle.
The helper closes its browser and server and removes its temporary directory when
finished; it never uses your normal browser profile or vault.

## Capture inventory

| Asset in `assets/` | View and purpose |
| --- | --- |
| `dashboard-dark.png`, `dashboard-light.png` | Top of the dashboard, including provider filters and the three subscription cards; first impression and theme comparison. |
| `provider-tour.gif` | About 12 seconds cycling All → Claude → Codex → DeepSeek → All, with 2.4-second holds; shows filtering using actual UI states. |
| `usage-progress.png` | First row of progress cards in the All view: two Claude accounts and Codex, with measured usage and session estimates. |
| `forecast-and-resets.png` | Claude capacity forecasts and reset timeline. |
| `charts-and-data.png` | Top of Claude A's Charts & data dialog, including range and export controls. |
| `sessions-and-readings.png` | The same dialog scrolled down to sessions and raw readings. |
| `deepseek-credits.png` | Demo balance, imported token/request totals, and spend since the last refresh. |
| `setup-vault.png` | Empty passphrase fields and the create-vault action. |
| `setup-claude.png` | Claude using the existing local login. |
| `setup-codex.png` | Codex's separate-account choice before connecting. |
| `setup-deepseek.png` | DeepSeek setup scrolled to show the empty API key field, CSV chooser, and save action. |
| `display-and-backups.png` | Display preferences and backup actions in a new empty vault. |

The browser viewport is 1440 × 1060 at device scale 1. Hero images use a 1440 × 810
crop; dialogs and feature images are cropped to their actual element bounds with
12 pixels of surrounding space. The GIF is scaled to 960 × 540. Screenshots preserve
the app's real layout, including scrollable dialogs. They do not show the native
desktop shell, tray menu, installers, or provider-owned sign-in windows.

## Review before committing

Open the generated PNGs and GIF. Check that labels are readable, the illustrated
controls are visible, and each README caption still matches the screen. Verify the
GIF cycles through all four filters and returns to All. Recheck selectors in the
helper when UI markup changes; a missing element should fail the capture instead of
silently producing an outdated picture.

Keep the first dashboard image visible near the top of the README. Put optional
motion and the longer galleries in expandable sections, and keep setup instructions
in text as well as pictures. Every image needs descriptive alt text. Link both
themes explicitly so users can inspect either one regardless of their GitHub theme.

Prefer a few focused crops over a full-page image with unreadably small text.
The GIF is a sequence of genuine captured filter states, not a continuous cursor
recording; keep that scope clear in its caption. A target of under 1 MB for a short
GIF keeps repository media manageable. Without `--gif`, the existing GIF is left
untouched, so regenerate it too when changing the dashboard or filter controls.

If adding native installer, tray, or sign-in recordings later, capture them in a
disposable Windows account or VM. Show only the relevant window and inspect every
frame for account details, tokens, terminal paths, and unrelated desktop content.
