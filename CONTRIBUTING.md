# Contributing to AI Quota Meter

Thanks for considering a contribution. This project is local-first and dependency-free by design (see [CLAUDE.md](CLAUDE.md)) — please read that file before touching connectors, storage, or the build pipeline. It documents the architecture and a list of traps already found the hard way; re-reading it first saves you from re-discovering them.

## Before you start

- **Bug fix or small improvement:** open a pull request directly.
- **New feature or anything that changes behavior users will notice:** open an issue first to discuss the approach. This is especially true for anything touching the Claude/Codex connectors or credential handling — see the "Compliance boundary" section in [CLAUDE.md](CLAUDE.md) before proposing a hosted or multi-user variant of anything.
- **Security issue:** see [SECURITY.md](SECURITY.md) rather than opening a public issue.

## Development setup

Requirements: Node.js 20 or newer. No `npm install` is needed for the root project — it has zero runtime or development dependencies on purpose.

```bash
npm start
```

Open <http://127.0.0.1:4173>, or add `?demo=1` to explore with fictional data without connecting any account.

## Before opening a pull request

```bash
npm run build          # regenerate app.bundle.js if you changed browser-side JS
npm test                # Node's built-in test runner, tests/*.test.mjs
node --check app.js
node --check server.mjs
```

- If you changed `app.js`, `crypto-vault.js`, `usage-core.js`, `demo-data.js`, or `theme-boot.js`, make sure `app.bundle.js` is regenerated and committed — `index.html` opened directly from disk depends on it.
- If you added a new browser-served file, update all three of `publicFiles` (`server.mjs`), `browserAssets` (`build-exe.mjs`), and `files` (`package.json`) in the same commit — nothing currently checks `package.json`'s list automatically.
- For UI/CSS changes, run the app and check the change in a browser rather than relying on the diff looking right — see the "Testing" section of [CLAUDE.md](CLAUDE.md) for a no-dependency way to measure geometry (element positions, centering) instead of eyeballing it.
- `desktop/` (the Tauri shell) has no automated tests — if you touch `desktop/src-tauri/src/main.rs`, verify by hand (build, launch, check tray/sidecar behavior) as described in CLAUDE.md.

## Pull request expectations

- Keep changes focused; unrelated cleanup makes a PR harder to review.
- Don't add new runtime or dev dependencies to the root project without discussing it first — the zero-dependency property is deliberate (`desktop/` is the one existing exception).
- Never commit real API keys, tokens, account identifiers, or `.env` files — the `.gitignore` already excludes vault/data files, keep it that way.
- Describe what changed and why, and mention which of the commands above you ran.

## Reporting bugs

Include the edition (portable/installer/desktop), version, and steps to reproduce. Keep API keys, tokens, and private account details out of reports and screenshots.
