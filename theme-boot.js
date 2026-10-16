// Applies a stored theme choice before the first paint.
//
// This is a separate, *synchronously* loaded file rather than a few lines
// inside app.js for two reasons: app.bundle.js is deferred, so by the time it
// ran the page would already have painted in the wrong palette and visibly
// flipped; and the server's Content-Security-Policy is `script-src 'self'`,
// which rules out an inline <script> in the head.
//
// The storage key is deliberately duplicated in app.js (THEME_STORAGE_KEY)
// because this file cannot import anything and still stay pre-paint — change
// the two together. Keep the "quota-local:" prefix itself unchanged even
// after the AI Quota Meter rebrand: it's a real user's already-stored
// preference, not display text — see app.js for why renaming a storage key
// orphans data instead of relabeling it.
(() => {
  try {
    // Dark is the default: only an explicit "light" or "system" choice changes
    // it. "system" leaves no data-theme attribute, which is the "match the OS"
    // state the stylesheet already handles with a media query.
    const stored = localStorage.getItem("quota-local:theme:v1");
    if (stored !== "system") document.documentElement.dataset.theme = stored === "light" ? "light" : "dark";
  } catch {
    // Private windows and blocked site data throw on access; fall back to the
    // same dark default.
    document.documentElement.dataset.theme = "dark";
  }
})();
