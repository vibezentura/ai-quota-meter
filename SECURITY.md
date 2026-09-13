# Security policy and threat model

AI Quota Meter protects provider configuration from casual local disclosure and prevents the open-source hosted preview from becoming a credential-collecting service. It does not claim absolute security.

## Security properties

- Provider secrets are encrypted at rest with AES-256-GCM through the browser Web Crypto API.
- The encryption key is derived from the user's passphrase with a unique salt and PBKDF2-HMAC-SHA256 at 600,000 iterations.
- The passphrase and derived key are not stored. The key and decrypted vault remain in tab memory only while unlocked.
- Every save uses a new random IV.
- DeepSeek connection is rejected unless the server bind and request hostname are both explicit loopback values.
- The local server does not log request bodies or authorization headers and does not persist the DeepSeek key.
- The browser Content Security Policy allows scripts, styles, and connections from the same origin only.
- No analytics, remote JavaScript, remote fonts, or telemetry are included.

## What encryption does not protect

- Malware, a malicious browser extension, or another process controlling the browser while the vault is unlocked.
- A weak or reused master passphrase after an attacker copies the encrypted browser record.
- A compromised release, dependency, operating system, browser, or local Node runtime.
- Screenshots, shoulder surfing, or values deliberately copied from the UI.
- A public reverse proxy made to look like localhost through unusual host-header rewriting.
- Provider-side collection and retention once a request reaches the provider.

For the strongest boundary, review the source, run the app locally, keep the operating system/browser updated, use a unique high-entropy passphrase, and restrict provider keys to the minimum privileges the provider supports.

## Hosted deployment rule

Do not deploy `/api/providers/deepseek/balance` as a community cloud proxy. Public deployments are safe-preview mode only: encrypted profile metadata and snapshot import remain local to the browser, while API-key connection is disabled.

The same rule extends to Claude and Codex: never build a hosted or multi-user version that collects, stores, or intermediates a Claude.ai OAuth token, session credential, or Codex login on a server that isn't the user's own machine. `claude-connector.js` reads and refreshes tokens only from the local, per-user `.credentials.json` this app is running beside — that is the permitted case. A cloud version where people "add their account" is not, and Anthropic's [Authentication and credential use policy](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) is explicit that this is enforced. See [CLAUDE.md](CLAUDE.md) for the full reasoning and the deployment shapes that stay on the right side of it.

## Desktop app trust boundary

The [desktop app](desktop/) (`desktop/`) does not change any of the above. It is a native window around the exact same sidecar binary the portable build ships, reached over the same loopback HTTP the browser version uses — the vault, the DeepSeek loopback gate, and the connectors are unmodified code running unmodified. The Tauri shell adds only window chrome (no address bar, a tray icon, single-instance enforcement); it introduces no new network surface and stores no credentials of its own.

## Data removal

**Vault → Delete local vault** removes the encrypted record from this browser's local storage and clears decrypted in-memory state. It does not delete provider accounts, provider-side data, browser backups, operating-system snapshots, or an exported encrypted backup.

## Vulnerability reports

Before publishing this as its own repository, add a private security-reporting address or GitHub private vulnerability reporting. Reports should never include a real provider key, vault export, or passphrase.
