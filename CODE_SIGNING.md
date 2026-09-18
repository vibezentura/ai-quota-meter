# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Status

AI Quota Meter has applied to the SignPath Foundation open-source program. Releases up to and including **v1.1.0 are unsigned**. Once signing is active, every Windows release asset from that version on is signed, and this section will name the first signed version.

## What gets signed

Each Windows release publishes three executables, and all three are signed:

| File | What it is |
| --- | --- |
| `ai-quota-meter-desktop-setup-<version>.exe` | Desktop app installer (Tauri, NSIS) |
| `ai-quota-meter-setup-<version>.exe` | Browser-based installer (Inno Setup) |
| `ai-quota-meter.exe` | Portable single-file build (Node SEA) |

Only binaries built from this repository's own source are signed. Third-party or upstream binaries are never signed with this certificate.

## How releases are built and signed

- **Source:** [github.com/vibezentura/ai-quota-meter](https://github.com/vibezentura/ai-quota-meter)
- **Build system:** GitHub Actions, [`.github/workflows/release.yml`](.github/workflows/release.yml), triggered by a version tag. Nothing is built or signed on a developer machine.
- **Origin verification:** SignPath verifies that each artifact submitted for signing was produced by that workflow in this repository.
- **Manual approval:** every signing request is approved by hand by an approver listed below. Nothing is signed automatically.
- **Metadata:** every signed binary carries the product name `AI Quota Meter` and the release version in its version resource, and SignPath enforces both.
- **Key storage:** the private key is held in SignPath's hardware security module; project members never have access to it.

The signing configuration is in [`.signpath/artifact-configuration.xml`](.signpath/artifact-configuration.xml).

## Team roles

| Role | Members |
| --- | --- |
| Committers and reviewers | [@vibezentura](https://github.com/vibezentura) |
| Approvers | [@vibezentura](https://github.com/vibezentura) |

Committers may change source code without a separate review. Contributions from anyone else are reviewed by a reviewer before they are merged. All team members use multi-factor authentication for both GitHub and SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

In practice, AI Quota Meter contacts a provider (Anthropic, OpenAI's local Codex App Server, or DeepSeek) only when you add or refresh an account for that provider. It has no telemetry, analytics, or update checks. See [SECURITY.md](SECURITY.md) for the full threat model.

## Verify a signed download

In File Explorer, right-click the file, choose **Properties**, open the **Digital Signatures** tab, and confirm the signer is **SignPath Foundation**. From PowerShell:

```powershell
Get-AuthenticodeSignature .\ai-quota-meter-desktop-setup-<version>.exe
```

`Status` should be `Valid`. Each release also publishes `SHA256SUMS.txt`, which is computed after signing.

## Reporting a problem

If you find a binary signed with this certificate that does not come from this project's releases, or that behaves suspiciously, do not run it. Report it privately as described in [SECURITY.md](SECURITY.md), and include the file's SHA-256 hash and where you downloaded it.
