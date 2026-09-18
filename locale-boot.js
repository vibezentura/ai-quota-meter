// Apply saved language and direction before CSS to avoid a visible LTR/RTL flip.
// Keep this locale/direction map in sync with the `supported` object in
// createAiQuotaLocalization() (i18n.js) — this file must stay import-free and
// synchronous, so it cannot just import that map.
(() => {
  const RTL_LOCALES = new Set(["ar"]);
  const SUPPORTED_LOCALES = new Set(["en", "ar", "fr", "de"]);
  try {
    const stored = localStorage.getItem("quota-local:language:v1");
    const language = SUPPORTED_LOCALES.has(stored) ? stored : "en";
    document.documentElement.lang = language;
    document.documentElement.dir = RTL_LOCALES.has(language) ? "rtl" : "ltr";
  } catch {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }
})();
