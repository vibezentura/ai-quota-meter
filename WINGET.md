# Windows Package Manager (winget)

AI Quota Meter is submitted to the [Windows Package Manager Community Repository](https://github.com/microsoft/winget-pkgs) so it can be installed with:

```powershell
winget install vibezentura.AIQuotaMeter
```

Package ID: `vibezentura.AIQuotaMeter`. It points at the desktop edition (`ai-quota-meter-desktop-setup-<version>.exe`) — see the README's [Download](README.md#download) section for how that compares to the other two editions. Only one edition is published to winget; adding the browser-based installer as a second package is a possible future addition, not done yet.

## Why this exists

winget downloads and runs installers itself rather than through a browser, so the file never picks up a Mark-of-the-Web — which means it does not trigger a SmartScreen "Windows protected your PC" prompt the way a direct download does. It is a mitigation for that warning, not a fix: a direct download from [Releases](https://github.com/vibezentura/ai-quota-meter/releases) still shows it until the [code signing policy](CODE_SIGNING.md) is active. See that file for the actual fix.

## Current status

- **Package version submitted:** 1.1.0
- **Submission PR:** [microsoft/winget-pkgs#436781](https://github.com/microsoft/winget-pkgs/pull/436781)
- Manifests are validated locally with `winget validate` before every submission, and the installer's silent switch and Add/Programs metadata are checked by hand against the manifest before opening the PR (see the PR's own comments for what was verified for 1.1.0).

Check the PR link for whether it has merged; this file is not kept in sync with that in real time.

## How the manifests are maintained

There is no `winget-releaser` automation in [`release.yml`](.github/workflows/release.yml) yet — every version bump is submitted by hand:

1. Fork of `microsoft/winget-pkgs` lives at `vibezentura/winget-pkgs` — sync it with upstream `master` first.
2. Manifests live at `manifests/v/vibezentura/AIQuotaMeter/<version>/`, three files: `vibezentura.AIQuotaMeter.yaml` (version), `vibezentura.AIQuotaMeter.installer.yaml` (installer URL, architecture, `InstallerSha256`, `AppsAndFeaturesEntries`), `vibezentura.AIQuotaMeter.locale.en-US.yaml` (metadata, description, tags).
3. For a new version: copy the previous version's folder, bump `PackageVersion` in all three files, update `InstallerUrl`/`ReleaseDate`/`AppsAndFeaturesEntries.DisplayVersion` in the installer file, and recompute `InstallerSha256` from the actual release asset — not from `SHA256SUMS.txt` blindly; download the file and hash it independently, since that's what winget's own CI does.
4. Validate locally before opening a PR: `winget validate --manifest <path-to-version-folder>`.
5. Open the PR against `microsoft/winget-pkgs` from the fork's branch. Their CI runs URL/domain validation, a malware scan, and an actual silent install/uninstall test; a first-time contributor also needs the CLA (one-time, see the bot's comment on the PR) and a manual moderator review, both already done for the initial submission.

## Automating future submissions

Once #436781 merges, `winget-releaser` becomes usable — it requires at least one version of the package to already exist upstream as a base. At that point, adding it to `release.yml` needs:

- A classic GitHub PAT with `public_repo` scope, stored as a repository secret (e.g. `WINGET_TOKEN`) — this has to be created by hand; it is not something CI can generate for itself.
- The `vibezentura/winget-pkgs` fork kept up to date (the action pushes new branches to it).
- A step using [`vedantmgoyal9/winget-releaser`](https://github.com/vedantmgoyal9/winget-releaser) with `identifier: vibezentura.AIQuotaMeter` and that token, added after the existing release-asset upload steps so the release (and its checksums) already exist when it runs.

Until that is wired up, repeat the manual steps above for each new tagged release.
