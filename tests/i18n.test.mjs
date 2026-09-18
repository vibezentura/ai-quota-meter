import assert from "node:assert/strict";
import test from "node:test";
import { AI_QUOTA_LOCALE_AR } from "../locales-ar.js";
import { AI_QUOTA_LOCALE_DE } from "../locales-de.js";
import { AI_QUOTA_LOCALE_EN } from "../locales-en.js";
import { AI_QUOTA_LOCALE_FR } from "../locales-fr.js";
import { formatAiQuotaMessage, validateAiQuotaCatalogs } from "../i18n.js";

const CATALOGS = { en: AI_QUOTA_LOCALE_EN, ar: AI_QUOTA_LOCALE_AR, fr: AI_QUOTA_LOCALE_FR, de: AI_QUOTA_LOCALE_DE };

test("all catalogs have matching keys and parameters", () => {
  assert.equal(validateAiQuotaCatalogs(CATALOGS), true);
});

test("message formatting preserves unknown placeholders and treats values as text", () => {
  assert.equal(formatAiQuotaMessage("Hello {name}; {missing}", { name: "<b>ليلى</b>" }), "Hello <b>ليلى</b>; {missing}");
});

test("every non-English catalog includes the primary navigation and accessibility labels", () => {
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    if (locale === "en") continue;
    for (const key of ["language.label", "dashboard.title", "action.addAccount", "action.close", "settings.title"]) {
      assert.ok(catalog[key], `${locale}.${key} is missing`);
      assert.notEqual(catalog[key], AI_QUOTA_LOCALE_EN[key], `${locale}.${key} was not translated`);
    }
  }
});

test("Arabic locale supports all plural categories needed by Arabic messages", () => {
  const rules = new Intl.PluralRules("ar");
  assert.deepEqual([0, 1, 2, 3, 11, 100].map((value) => rules.select(value)), ["zero", "one", "two", "few", "many", "other"]);
});

test("French treats 0 and 1 as the singular plural category, German only 1", () => {
  const fr = new Intl.PluralRules("fr");
  const de = new Intl.PluralRules("de");
  assert.deepEqual([0, 1, 2].map((value) => fr.select(value)), ["one", "one", "other"]);
  assert.deepEqual([0, 1, 2].map((value) => de.select(value)), ["other", "one", "other"]);
});

test("Arabic technical formatting can keep Latin digits and Gregorian dates", () => {
  const locale = "ar-EG-u-nu-latn-ca-gregory";
  assert.match(new Intl.NumberFormat(locale).format(1234), /1.*234/);
  assert.equal(new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(new Date("2026-01-01T00:00:00Z")), "2026");
});

test("French and German catalogs contain no leftover English UI strings", () => {
  const suspicious = /^(Settings|Language|Dashboard|Account|Weekly|Refresh)$/;
  for (const [locale, catalog] of Object.entries({ fr: AI_QUOTA_LOCALE_FR, de: AI_QUOTA_LOCALE_DE })) {
    for (const [key, value] of Object.entries(catalog)) {
      assert.ok(!suspicious.test(value), `${locale}.${key} looks untranslated: "${value}"`);
    }
  }
});
