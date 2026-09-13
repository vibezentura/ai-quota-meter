import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, summarizeDeepSeekAmountCsv } from "../deepseek-usage.js";

test("CSV parser handles quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('name,amount\n"Work, main","1"\n"A ""quote""",2\n'), [
    ["name", "amount"],
    ["Work, main", "1"],
    ['A "quote"', "2"],
  ]);
});

test("DeepSeek amount export is summarized by API key without retaining rows", () => {
  const summary = summarizeDeepSeekAmountCsv([
    "start_time_iso,end_time_iso,model,api_key_name,api_key,type,price,amount",
    "2026-08-01T00:00:00Z,2026-08-02T00:00:00Z,deepseek-v4-flash,Editor,sk-***123,request_count,,4",
    "2026-08-01T00:00:00Z,2026-08-02T00:00:00Z,deepseek-v4-flash,Editor,sk-***123,input_cache_miss_tokens,0.14,1200",
    "2026-08-01T00:00:00Z,2026-08-02T00:00:00Z,deepseek-v4-flash,Editor,sk-***123,output_tokens,0.28,300",
    "2026-08-02T00:00:00Z,2026-08-03T00:00:00Z,deepseek-v4-pro,Automation,sk-***999,output_tokens,0.87,500",
  ].join("\n"));
  assert.equal(summary.totalTokens, 2000);
  assert.equal(summary.totalRequests, 4);
  assert.deepEqual(summary.keys.map((key) => key.name), ["Editor", "Automation"]);
  assert.deepEqual(summary.models, ["deepseek-v4-flash", "deepseek-v4-pro"]);
  assert.equal(summary.periodStart, "2026-08-01T00:00:00.000Z");
  assert.equal(summary.periodEnd, "2026-08-03T00:00:00.000Z");
});

test("non-amount exports fail with a useful message", () => {
  assert.throws(() => summarizeDeepSeekAmountCsv("date,cost\n2026-08-01,2.00"), /amount CSV/);
});
