# AI Quota Meter — developer/AI notes

Local-first dashboard for Claude/Codex subscription usage and DeepSeek API credits. Read [README.md](README.md) first for what the product does; this file is about how the code is put together and the traps already found in it, for whoever (human or AI) touches it next.

## Architecture map

```
index.html + app.js ──build.mjs──► app.bundle.js   (browser bundle, no build tool — see below)
                                         │
server.mjs  ── HTTP + static file serving, connector routes, SEA asset serving,
                sign-in terminal launcher (writes a throwaway script, opens a
                real terminal in it — see "Guided sign-in" below)
  ├─ claude-connector.js   (spawns `claude`, reads/refreshes .credentials.json, hits Anthropic's usage endpoint)
  ├─ codex-connector.js    (spawns `codex app-server`, talks JSON-RPC over stdio)
  ├─ deepseek-connector.js (loopback-gated proxy to DeepSeek's balance endpoint)
  ├─ cli-locator.js        (finds the real claude/codex/node binaries — see "SEA builds resolve CLI tools differently" below)
  └─ usage-core.js         (pure functions: window math, recommendations, forecasting)
crypto-vault.js   — AES-256-GCM vault, runs in the browser (Web Crypto), not Node
refresh-ledger.js — derives burn rate / session totals from consecutive vault readings
demo-data.js      — fictional data for ?demo=1, no account needed

build.mjs      — concatenates browser modules into app.bundle.js (strips `export`, that's it)
build-exe.mjs  — turns the whole server + connectors into one Windows .exe (Node SEA)
desktop/       — Tauri shell wrapping that same .exe as a native window (see desktop/README.md)
```

Three ways to run this, all serving the *same* server.mjs/connector code:

1. `npm start` — plain Node, for development.
2. `dist/ai-quota-meter.exe` (`npm run build:exe`) — single-file Windows build via Node's `--experimental-sea-config`, no Node install needed on the target machine.
3. `desktop/` — Tauri native window wrapping (2) as a "sidecar" child process.

The browser-side code (index.html/app.js/crypto-vault.js/usage-core.js/demo-data.js) also works opened directly from disk (`file://`) with zero server — everything except live provider connections and DeepSeek balance checks. This is deliberate: read `## Public deployment modes` in README.md before changing that boundary.

## Guided sign-in (adding a Claude/Codex account, and Fix login)

Originally, adding a second Claude/Codex account meant the dialog showing three shell commands (PowerShell/cmd/Git Bash) for the user to copy, run in a terminal themselves, and then come back and press a second button — confusing enough (two buttons that both effectively meant "check now") that it was the first thing flagged as needing simplification. The replacement, in order:

1. `POST /api/providers/profile/login` (`server.mjs`, `launchLoginTerminal`) writes a small throwaway script — `.cmd` on Windows via `start`, `.sh` elsewhere via the platform's terminal — that sets the one profile env var (`CLAUDE_CONFIG_DIR`/`CODEX_HOME`) and runs the provider's own login command, then opens a real terminal running it. Nothing user-supplied reaches the script: the provider is one of two literals and the profile key is already validated against `/^[a-zA-Z0-9-]{8,64}$/`.
2. `app.js`'s `runSignInFlow()` (add-account) and `verifyRelink()` (Fix login) call that, then `waitForSignIn()` polls `/api/providers/<provider>/connect` with `identityOnly: true` every 2.5s for up to 5 minutes until the login lands — no second button, the dialog finishes itself.
3. `identityOnly` exists specifically so that poll doesn't also read usage: reading usage on every poll would put a request against Anthropic's endpoint on the wire every 2.5s for as long as sign-in takes.
4. If `launched: false` comes back (headless box, unusual desktop), the three-command fallback is still there, just behind a "Run the command myself instead" link instead of always shown.
5. `state.signInToken` is incremented on every "this wait no longer applies" event — dialog closed, provider switched, which-account radio switched, a new attempt started — and every poll checks it before touching the DOM. Without this, a login finished after the user gave up and closed the dialog could reach back in and half-fill a dialog that's no longer showing that form.

If you touch this flow, the thing to re-verify by hand (there is no test for it — see Testing below) is: does closing the dialog mid-wait actually stop the poll, and does a login completed *after* an abandoned wait's 5-minute window silently do nothing rather than surprise-populate something.

## Theming

`styles.css` opens with the whole palette as tokens, then a light override. Two rules keep a theme a palette swap instead of a hunt through 2000 lines:

- **Nothing outside those blocks hardcodes a colour.** Every surface, line, and text colour is a token. Tokenizing this after the fact also turned up `--ink` and `--surface-dark` being *used but never defined* — they had been silently resolving to nothing.
- **Accent tints come from `*-rgb` triplets**, e.g. `rgba(var(--mint-rgb), 0.08)`, not literal `rgba(113, 230, 187, 0.08)`. A bright mint at 8% reads as a mint wash over near-black and as nothing at all over white, so light mode redefines the triplet to a darker mint and every wash and border built from it darkens with it. Reach for an existing `--surface-1/2/3` step for raised surfaces rather than inventing another hand-written alpha.

Three places decide the theme and they have to agree, in this cascade order: `:root` (dark default) → `@media (prefers-color-scheme: light)` guarded by `:root:not([data-theme="dark"])` → `:root[data-theme="light"]` / `[data-theme="dark"]`. The `:not()` guard is what lets an explicit dark choice beat a light OS preference. The theme-button icon rules mirror the same cascade, deliberately, so the icon can never disagree with the colours on screen.

`theme-boot.js` is a separate synchronously-loaded file for a reason: `app.bundle.js` is deferred, so a stored choice applied there would paint the wrong palette first and visibly flip, and the server's CSP (`script-src 'self'`) rules out an inline `<script>`. Its storage key is duplicated in `app.js` as `THEME_STORAGE_KEY` — change both together. Adding it also meant registering it in all three asset lists (the drift trap below), which is what that trap is about.

`styles.css` ends with a **playful layer** that is the app's actual visual
voice: chunky radii, a pressable 3D primary button, circular energy meters,
and a larger type scale. It is deliberately *last* and unscoped — there is one
interface, so it overrides the older component rules by source order rather
than by a wrapper class or an `html[data-ui]` attribute. Two consequences
worth knowing before editing it:

- The 3D press is a solid fill plus a darker `border-bottom`, not a shadow.
  `:active` trades border thickness for `translateY`; keep the two in step or
  the control appears to *grow* when pressed.
- It is the last rule wins, not the most specific. A bare element selector in
  the layer (`.stat-tile span`) can still lose to — or beat — an earlier rule
  on specificity, which is exactly the bug described in the traps below.

Light-mode contrast was measured, not eyeballed: every text and accent token clears WCAG AA (4.5:1) against both `--bg` and panel white, and white-on-mint-fill clears it too. If you retune the light palette, re-measure rather than trusting how it looks on one monitor.

## The zero-dependency rule, and where it's broken

Root project (`server.mjs` and everything it imports, plus the browser code) has **no** entries in `package.json` dependencies or devDependencies, on purpose — see README's "Development" section. `build-exe.mjs` and `installer/ai-quota-meter.iss`'s CI step reach for `postject`, `rcedit`, and Inno Setup via ad hoc `npx`/scratch-`npm install --prefix` calls rather than declaring them, specifically to keep that claim true for the *shipped* app.

`desktop/` is the one deliberate exception — it has real devDependencies (`@tauri-apps/cli`) and needs a Rust toolchain to build. This is documented in both READMEs; don't quietly extend it back into the root project without updating those.

## Renaming the product ≠ renaming every string

The app shipped as "Quota Local" through v0.2.2 and was rebranded to "AI Quota Meter." Every display string, filename, npm/Cargo package name, env var (`QUOTA_LOCAL_*` → `AI_QUOTA_METER_*`), and build artifact name was updated — except a specific set of internal identifiers that are stable references to something a real, already-running install depends on, not branding. Renaming these would not relabel a user's data; it would silently orphan it (the app looks under a new key/path/id, finds nothing, and whatever was there — a vault, a login, an install record — appears to have vanished, with no error explaining why). Left unchanged, on purpose:

- **The four `localStorage` key strings** (`quota-local:encrypted-vault:v1`, `:remember-key:v1`, `:mask-email:v1`, `:theme:v1` — in `crypto-vault.js`, `app.js`, `theme-boot.js`). This is where every real user's encrypted vault already lives.
- **The `%LOCALAPPDATA%\QuotaLocal` folder name** (`server.mjs`'s `dataDirectory` fallback). Isolated Claude/Codex CLI profiles — real signed-in logins — live under it.
- **The Tauri `identifier`, `com.msamyashash.quotalocal`** (`desktop/src-tauri/tauri.conf.json`). This is what Windows/Tauri keys the app's own local storage directory to, same reasoning as the folder above, one layer down.
- **The Inno Setup `AppId` GUID** (`installer/ai-quota-meter.iss`). This is how the installer recognizes "an existing install of this app" to upgrade in place rather than leaving a duplicate registry entry; it's arbitrary and was never meant to encode the product name.

If a future rename ever needs to touch one of these anyway (e.g. a deliberate storage-format migration), that requires a real migration step — copy the old key/path to the new one before the switch — not a find-and-replace. Don't rename them "for consistency" without reading this first.

## Traps already found (read before touching the build pipeline)

**`publicFiles` (server.mjs) / `browserAssets` (build-exe.mjs) / `files` (package.json) can silently drift apart.** Three separate lists name which browser-side files exist. `build-exe.mjs` has a `verifyAssetList()` guard that fails the build if `publicFiles` and `browserAssets` disagree — but nothing checks `package.json`'s `files` array against either. That gap is exactly how `cli-locator.js` and `favicon.svg` ended up missing from `files` after being added elsewhere (would have broken `npx ai-quota-meter` for anyone installing from npm — not yet published, so no live damage, but the same class of bug can recur). If you add a new browser-served file, update all three, by hand, in the same commit.

**CRLF breaks the ESM→CJS bundler in `build-exe.mjs`.** Its `transformModule()` walks source line-by-line with `$`-anchored regexes. A Windows Actions runner checks files out with CRLF depending on `core.autocrlf`, which used to leave a trailing `\r` on every line and silently fail every anchor. Fixed by splitting on `/\r?\n/` and by committing `.gitattributes` (`* text=auto eol=lf`) so this can't reappear from a different runner's git config. If you add another line-based transform anywhere in this file, split on `/\r?\n/`, not `"\n"`.

**`rcedit` must run *before* `postject`, not after.** Embedding the icon/version resource into an already-SEA-injected 92 MB exe sent `rcedit` into a multi-minute (1400+ CPU-second, still climbing) pathological resource rewrite — presumably confused by the injected section. Stamping the plain `node.exe` copy first, then injecting the blob, takes a couple of seconds. `build-exe.mjs` does this in the right order now; don't reorder it "for clarity."

**Icon PNGs must be RGBA, not RGB.** Playwright's screenshot encoder drops the alpha channel when there's nothing transparent to preserve. Tauri's tray-icon loader then fails the whole Rust build with an unhelpful `proc macro panicked: icon ... is not RGBA`. `assets/png-to-rgba.mjs` converts them — and it's a *real* PNG un-filter/re-filter (scanlines are delta-encoded per one of five filter types before compression), not a naive byte-splice. A naive version was tried first and corrupted every icon into diagonal banding; if you ever touch that script, verify the output by actually looking at the image, not just checking it parses.

**Windows `.cmd` shims (`npx`, `npm`) need `shell: true` to spawn at all** (Node's CVE-2024-27980 fix), but `shell: true` on Windows hands your whole `args` array to `cmd.exe` as one naively space-joined string — which strips every quote out of an inline JSON argument before the target program ever sees it. `desktop/build.mjs` sidesteps this by writing the JSON to a temp file and passing the *path* instead of the JSON itself. Reach for that pattern again rather than fighting cmd.exe's escaping rules.

**The desktop app's port must stay fixed — never make it dynamic again.** The vault lives in the webview's local storage, which is partitioned per *origin*, and origin includes the port. An earlier version asked the OS for a free port on every launch; every launch therefore got a fresh empty vault while the real data sat stranded under the previous launch's port. Fixed at 47313 now (`desktop/src-tauri/src/main.rs`, `DEFAULT_PORT`). See `desktop/README.md`'s "Why the port is fixed" for the full story and the recovery procedure if you ever have to debug a stranded vault.

**A tray click handler must match one specific mouse button.** `TrayIconEvent::Click { .. }` matches *every* button and both press states, so an `if let` that broad also fires on right-click. Calling `show_main_window()` (i.e. `set_focus()`) from there made the tray menu unreachable: Win32 tears a popup menu down the instant anything else takes focus, so the context menu was destroyed as fast as Windows created it, and **Quit could not be reached at all** — the only way out was Task Manager. Match `button: MouseButton::Left, button_state: MouseButtonState::Up` explicitly. Related: Tauri's `show_menu_on_left_click` defaults to **true**, which would pop the menu on left click too and collide with "left click reopens the window" — `desktop/src-tauri/src/main.rs` sets it to `false`.

**The sidecar must be tied to the shell with a Windows job object.** `CommandChild::kill()` on the tray's Quit path only covers an orderly exit. Anything else that stops the shell — a crash, or the user ending the task — used to leave `ai-quota-meter.exe` running: holding port 47313, visible in Task Manager, with no UI left to stop it. `kill_with_this_process()` assigns the sidecar to a job with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, so Windows terminates it whenever this process dies, however it dies (it also sweeps up any `claude`/`codex` child the sidecar spawned). The job handle is deliberately **never closed** — kill-on-close fires when the last handle goes away, so it has to stay open for the life of the app. This is also what keeps the "adopt an already-healthy sidecar" startup path from accumulating orphans.

**Radio buttons in different `<section>`s need different `name`s if only one section is visible at a time.** The Claude and Codex provider-fields sections both used `name="profileMode"` for their "which account" choice. A `name` attribute forms one radio group across the *entire document*, not per visible section — so Codex's radio (declared later in the markup) silently claimed the group, and Claude's `checked` default rendered as unselected even though Claude is the default-selected provider. Each now has its own name (`claudeProfileMode` / `codexProfileMode`); `app.js` reads whichever one matches the selected provider via `` data.get(`${provider}ProfileMode`) ``. Any new per-provider form control in `data-provider-fields` sections needs the same per-provider naming, not a shared one.

**Every button centers its contents from one shared rule, and a text glyph is not a substitute for an SVG.** `.icon-button`/`.secondary-button`/`.ghost-button`/`.primary-button` share `display:inline-flex; align-items:center; justify-content:center; line-height:1` in `styles.css` — `line-height:1` is load-bearing, not decorative: without it a button's content sits in a line box carrying the font's leading, so *centering the box* still leaves the glyph inside it off-center. Every dialog's close button used the `×` character (U+00D7) for its icon, which made this worse independent of the box: that glyph sits on the font's math axis, above center in essentially every font, so no amount of box-centering fixes it. All six were replaced with the same SVG cross used elsewhere. If you add a new icon-only button, use an SVG (with both `width` and `height` set — a missing one is sized from aspect ratio, which drifts the moment a viewBox isn't square), never a Unicode symbol, and rely on the shared centering rule rather than one-off `padding` nudges.

**`hidden` does nothing on an `<svg>`, and an author `display` rule beats it on anything.** Two separate traps that both look like "the hidden attribute is broken":

- `element.hidden = true` only works on `HTMLElement`. An `<svg>` is an `SVGElement`, which has no such IDL property — so the assignment quietly creates a JS expando and never sets the content attribute. The theme button showed both its sun and moon icons this way. Use `setAttribute`/`removeAttribute`, a class, or (as here) let CSS decide.
- `[hidden]` is only a *UA-stylesheet* rule, so any author rule setting `display` on the same element silently defeats it — and most things this app hides are flex or grid containers. `styles.css` now carries one global `[hidden] { display: none !important }`, which replaced a per-class `.hero-add-button[hidden]` patch someone had already been forced to write. Empty sign-in command rows were rendering as stray boxes for exactly this reason on platforms with a single shell command.

**A type selector in a later rule still loses to an earlier class+type rule.** The playful layer is appended at the end of `styles.css` and mostly relies on source order to win, which works right up until specificity disagrees. `.stat-tile span { color: var(--muted-bright) }` (0,1,1) silently repainted every stat-tile *icon* — `.stat-icon` is a `<span>` too, and its own rule is only (0,1,0), so the label colour won no matter which came last. It rendered as a dark blob on a dark tile and looked like a broken SVG, not a cascade problem. Scope label rules to the element they mean (`.stat-tile > div > span`) rather than trusting position in the file.

**A card's optional badge must not sit above content that has to line up across cards.** The "Suggested for your next session" flag only renders on the recommended account. Placed above the energy meters, it pushed that card's rings ~49px below its neighbours' in the same grid row — the cards were all the same height, so nothing looked obviously wrong, the meters were just subtly ragged. It now renders *below* the meters, where the card's `margin-top: auto` slack absorbs it. Anything else conditional belongs in the same place, or the meters go crooked again. The way this was found is the way to check it: measure `getBoundingClientRect().top` of every `.ring` and assert they are equal, not squint at a screenshot.

**The three dashboard pickers are segmented buttons, not `<select>`s.** Work size, provider lane, and the ledger range (plus the Charts & data dialog's own range) are `aria-pressed` button groups driven by `PILL_CONTROLS` in `app.js`. Their value lives in `state` (`taskClass`, `providerLane`, `ledgerRangeHours`, `detailRange`) and `paintPills()` repaints the pressed state from `state` on every render — so a control can never disagree with the value the render actually used. Adding a fourth picker means one entry in `PILL_CONTROLS`, one line in `pillValue()`, and markup carrying the matching `data-*`; do not reach for `elements.<id>.value`, those ids are `<div>`s now.

**Provider lane filters the whole page, not just the recommendation.** It used to be a hero-only "which lane do I rank" control. It now filters the account grid, ledger, capacity watch, and timeline as well, because two different meanings for one visible control is what made the old pair of dashboards confusing. `render()` narrows `allAccounts` once, near the top; anything reading the unfiltered list needs `allAccounts`, not `accounts` (the empty state does, to tell "no accounts at all" from "none in this lane").

**The capacity-watch donut reuses the ring's four score classes with the thresholds flipped, on purpose.** `ringScoreClass()` in `app.js` colors an energy ring by *remaining* percent, where higher is better (band 4, mint, at ≥75). `capacityScoreClass()` colors the capacity-watch meter by *projected-unused* percent, where higher is the bad outcome (quota about to be wasted) — so it reuses the same `ring-score-1..4` CSS classes (and the matching `--coral-rgb`/`--amber-rgb`/`--scale-yellow-rgb`/`--mint-rgb` tints on `.capacity-meter` in `styles.css`) but assigns them by descending thresholds instead of ascending ones. Don't "fix" one function's threshold direction to match the other — they're deliberately mirrored, not inconsistent. The donut fill itself is an SVG `stroke-dasharray` (`pathLength="100"`), not a `conic-gradient` with an inline `--pct`, for the same CSP reason documented above for the energy rings: `style-src 'self'` silently drops inline `style="…"` written via `innerHTML`.

**SEA builds resolve CLI tools differently than `npm start` does.** `process.execPath` is Node itself under `npm start`, but is *this app* inside the single-file build — so the old "look beside `process.execPath`" trick for finding `claude.exe`/`codex.js`/a real `node` binary silently breaks in the packaged build only. `cli-locator.js` centralizes the fix (scans `PATH`, `%APPDATA%\npm`, and `process.execPath` only when not bundled). Any new provider connector that shells out to a CLI needs to go through this, not reinvent path lookup.

## Compliance boundary — do not build a hosted multi-account version

This came up explicitly during an investigation into making the dashboard "global" and is **not written down anywhere else in the repo**, so it's easy to rediscover the hard way:

Anthropic's [Authentication and credential use policy](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) prohibits third parties from collecting, storing, or intermediating Claude.ai OAuth tokens or session credentials — sign-in must complete through Anthropic's own flow. `claude-connector.js` reads and refreshes the OAuth token **only from the user's own local `.credentials.json`, on their own machine, for their own login** — that's the permitted "configuring a credential for the customer's own authorized users" case, not the prohibited one. The moment any of that token handling moves to a server that isn't the user's own machine — a hosted dashboard where people "add their account," a cloud sync feature that stores the refresh token, anything like that — it crosses into exactly what the policy forbids, and Anthropic has enforced this against other tools. The same reasoning applies to OpenAI/Codex credentials. See `SECURITY.md`'s "Hosted deployment rule" for the parallel (already-written) rule about DeepSeek keys, and extend that same boundary to Claude/Codex if you're ever asked to build a hosted or multi-user version.

Legitimate paths to "more than one machine" that don't cross this line: a hosted view of *derived, non-credential* metrics the user's own local instance pushes up (percentages, timestamps — never tokens), or a provider's own **Admin API** (`sk-ant-admin-*` / OpenAI's usage/cost endpoints) for API-key/org accounts, which is a different, hostable, credential type entirely.

## Testing

```bash
npm test              # 56 tests, Node's built-in test runner, tests/*.test.mjs
node --check app.js
node --check server.mjs
```

Coverage gaps worth knowing about: `app.js` (1242 lines, the entire browser UI) has no dedicated test file — it's exercised only indirectly through the modules it imports (`usage-core.js`, `crypto-vault.js`, `refresh-ledger.js`, `demo-data.js`, each of which does have direct tests). `desktop/` (the Rust/Tauri shell) has **no automated tests at all** — everything about it (sidecar spawn, hide-to-tray, single-instance refocus, tray icon rendering, the full install/shortcut/registry/uninstall cycle) was verified by hand: build it, launch it, screenshot it, check `Get-Process`/`Get-NetTCPConnection`/the registry directly. If you change `desktop/src-tauri/src/main.rs`, re-verify manually the same way — there's no CI signal that would catch a regression there before a release ships.

For UI/CSS changes to `index.html`/`app.js`/`styles.css` there's a working pattern even without a test file: run `npm start`, drive the page, and *measure* rather than eyeball. Playwright's MCP tools are the easy path; when that browser profile is already locked by another session, headless Chrome over CDP works with no dependencies at all — `--headless=new --remote-debugging-port=...`, then `Runtime.evaluate` from a throwaway script using Node's global `WebSocket`. Either way the point is the same: measure — `getBoundingClientRect()` on a button vs. its icon/label to confirm actual centering, not a screenshot someone has to squint at. That's how the button-centering trap above was confirmed fixed (icon-to-button-center offset of exactly `0, 0`, symmetric content gaps on icon+label buttons) rather than assumed from the CSS looking right. A screenshot is still worth taking to catch what geometry can't (color, whether an element is visible at all), but geometry claims should be measured.

## Releasing

Tag-triggered: `git tag vX.Y.Z && git push origin vX.Y.Z` fires `.github/workflows/release.yml`, which runs the test suite, then builds and publishes three Windows artifacts plus a checksum file:

- `ai-quota-meter.exe` — portable SEA build.
- `ai-quota-meter-setup-<version>.exe` — Inno Setup installer around the same portable exe (browser-based).
- `ai-quota-meter-desktop-setup-<version>.exe` — Tauri NSIS installer around the desktop shell.

All three read their version from the root `package.json` — bump that (and `desktop/package.json` / `desktop/src-tauri/Cargo.toml` for consistency, though only the root one is functionally load-bearing) before tagging. The desktop build is the slow part: a fresh Rust dependency compile takes ~15 minutes on a cold cache; `Swatinem/rust-cache` should make subsequent releases faster. All three builds are unsigned by design (cost tradeoff, not an oversight) — see README's Download section for the SmartScreen caveat that goes in every release's notes.

If you ever add signing, do the version-bump-and-tag dance on a real (not `-test`) version — CI publishes a GitHub Release on every matching tag push, and there's no draft/staging step.
