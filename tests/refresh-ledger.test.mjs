import assert from "node:assert/strict";
import test from "node:test";
import {
  balanceSeries,
  buildTimeScale,
  burnRate,
  computeIntervals,
  groupSessions,
  intervalsInRange,
  layoutBars,
  ledgerRows,
  ledgerTotals,
  projectX,
  recordRefresh,
  refreshRows,
  scalePoints,
  summarizeAccount,
  toCsv,
  windowSeries,
  withMeasuredBurnRates,
} from "../refresh-ledger.js";

const BASE = Date.parse("2026-05-01T09:00:00.000Z");
const at = (minutes) => new Date(BASE + minutes * 60_000);

function subscriptionAccount(usedShort, usedWeekly, resetOffsetMinutes = 300) {
  return {
    id: "claude-a",
    label: "Claude A",
    provider: "claude",
    windows: [
      { id: "five_hour", label: "5-hour", usedPercent: usedShort, durationMinutes: 300, resetsAt: new Date(BASE + resetOffsetMinutes * 60_000).toISOString() },
      { id: "seven_day", label: "Weekly", usedPercent: usedWeekly, durationMinutes: 10_080, resetsAt: new Date(BASE + 10_080 * 60_000).toISOString() },
    ],
  };
}

test("recordRefresh stores one compact sample per refresh", () => {
  const account = subscriptionAccount(10, 40);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 22;
  recordRefresh(account, at(30));
  assert.equal(account.refreshLedger.samples.length, 2);
  assert.deepEqual(account.refreshLedger.samples[1].w.five_hour.u, 22);
});

test("recordRefresh collapses an immediate duplicate refresh", () => {
  const account = subscriptionAccount(10, 40);
  recordRefresh(account, at(0));
  assert.equal(recordRefresh(account, new Date(BASE + 5_000)), null);
  assert.equal(account.refreshLedger.samples.length, 1);
});

test("recordRefresh keeps a repeated reading taken after a real gap", () => {
  const account = subscriptionAccount(10, 40);
  recordRefresh(account, at(0));
  recordRefresh(account, at(20));
  assert.equal(account.refreshLedger.samples.length, 2);
  assert.equal(computeIntervals(account)[0].idle, true);
});

test("recordRefresh trims the ledger to its cap", () => {
  const account = subscriptionAccount(0, 0);
  for (let index = 0; index < 12; index += 1) {
    account.windows[0].usedPercent = index;
    recordRefresh(account, at(index * 10), { maxSamples: 5 });
  }
  assert.equal(account.refreshLedger.samples.length, 5);
  assert.equal(account.refreshLedger.samples[4].w.five_hour.u, 11);
});

test("computeIntervals reports usage and rate between refreshes", () => {
  const account = subscriptionAccount(10, 40);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 25;
  account.windows[1].usedPercent = 43;
  recordRefresh(account, at(30));
  const [interval] = computeIntervals(account);
  const short = interval.windows.find((window) => window.id === "five_hour");
  assert.equal(interval.minutes, 30);
  assert.equal(short.deltaPercent, 15);
  assert.equal(short.ratePerHour, 30);
  assert.equal(short.spannedReset, false);
  assert.equal(interval.idle, false);
});

test("a window that reset counts only the new window and is flagged partial", () => {
  const account = subscriptionAccount(71.5, 84);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 3.2;
  account.windows[0].resetsAt = new Date(BASE + 600 * 60_000).toISOString();
  account.windows[1].usedPercent = 85.1;
  recordRefresh(account, at(160));
  const short = computeIntervals(account)[0].windows.find((window) => window.id === "five_hour");
  assert.equal(short.spannedReset, true);
  assert.equal(short.deltaPercent, 3.2);
});

test("groupSessions splits runs of refreshes on a long silence", () => {
  const account = subscriptionAccount(0, 0);
  const readings = [[0, 0], [20, 6], [45, 14], [400, 20], [420, 26]];
  for (const [minutes, used] of readings) {
    account.windows[0].usedPercent = used;
    recordRefresh(account, at(minutes));
  }
  const sessions = groupSessions(computeIntervals(account));
  assert.equal(sessions.length, 2, "the 355-minute silence should end the first session");
  assert.equal(sessions[0].windows.five_hour, 14);
  assert.equal(sessions[0].refreshes, 3);
  assert.equal(sessions[1].windows.five_hour, 6);
});

test("burnRate ignores intervals outside the lookback", () => {
  const account = subscriptionAccount(0, 0);
  for (const [minutes, used] of [[0, 0], [60, 10], [1000, 40]]) {
    account.windows[0].usedPercent = used;
    recordRefresh(account, at(minutes));
  }
  const intervals = computeIntervals(account);
  assert.equal(burnRate(intervals, "five_hour", { now: at(1000), lookbackHours: 2 }), null);
  assert.equal(burnRate(intervals, "five_hour", { now: at(60), lookbackHours: 6 }), 10);
});

test("summarizeAccount projects time to limit and a session budget", () => {
  const account = subscriptionAccount(0, 0);
  for (const [minutes, used] of [[0, 0], [60, 10], [120, 20], [240, 30], [300, 40]]) {
    account.windows[0].usedPercent = used;
    recordRefresh(account, at(minutes));
  }
  const summary = summarizeAccount(account, { now: at(300) });
  const short = summary.windows.find((window) => window.id === "five_hour");
  assert.equal(short.ratePerHour, 8);
  assert.equal(short.remainingPercent, 60);
  assert.equal(short.hoursToLimit, 7.5);
  assert.equal(short.lastDeltaPercent, 10);
  assert.equal(short.typicalSessionPercent, 15);
  assert.equal(short.sessionsLeft, 4);
  assert.equal(summary.sessionLive, true);
});

test("withMeasuredBurnRates fills the forecast field without mutating the account", () => {
  const account = subscriptionAccount(0, 0);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 12;
  recordRefresh(account, at(60));
  const enriched = withMeasuredBurnRates(account, { now: at(60) });
  assert.equal(enriched.windows[0].burnRatePerHour, 12);
  assert.equal(enriched.windows[0].burnRateSource, "measured");
  assert.equal(account.windows[0].burnRatePerHour, undefined);
});

test("DeepSeek refreshes measure credit spend between readings", () => {
  const account = {
    id: "deepseek-a",
    label: "DeepSeek",
    provider: "deepseek",
    deepseekBalance: { is_available: true, balance_infos: [{ currency: "USD", total_balance: "19.61", granted_balance: "0", topped_up_balance: "19.61" }] },
  };
  recordRefresh(account, at(0));
  account.deepseekBalance.balance_infos[0].total_balance = "19.08";
  recordRefresh(account, at(40));
  const summary = summarizeAccount(account, { now: at(40) });
  assert.equal(summary.lastBalanceDelta, 0.53);
  assert.equal(summary.currency, "USD");
  assert.equal(summary.windows.length, 0);
});

test("ledgerRows and ledgerTotals aggregate only tracked accounts", () => {
  const tracked = subscriptionAccount(0, 0);
  recordRefresh(tracked, at(0));
  tracked.windows[0].usedPercent = 9;
  recordRefresh(tracked, at(45));
  const untracked = subscriptionAccount(4, 4);
  untracked.id = "codex-a";

  const rows = ledgerRows([tracked, untracked], { now: at(45) });
  assert.equal(rows.length, 1);
  const totals = ledgerTotals(rows, { now: at(45), sinceHours: 24 });
  assert.equal(totals.refreshes, 1);
  assert.equal(totals.workingRefreshes, 1);
  assert.equal(totals.trackedAccounts, 1);
  assert.equal(totals.peakRatePerHour, 12);
});

test("windowSeries reports usedPercent over time and flags a reset", () => {
  const account = subscriptionAccount(20, 50);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 60;
  recordRefresh(account, at(60));
  account.windows[0].usedPercent = 5; // rolled over
  account.windows[0].resetsAt = new Date(BASE + 300 * 60_000).toISOString();
  recordRefresh(account, at(120));

  const series = windowSeries(account, "five_hour", { now: at(120) });
  assert.equal(series.points.length, 3);
  assert.deepEqual(series.points.map((point) => point.u), [20, 60, 5]);
  assert.equal(series.resets.length, 1);
  assert.equal(series.resets[0], at(120).getTime());
});

test("windowSeries respects the lookback window", () => {
  const account = subscriptionAccount(0, 0);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 10;
  recordRefresh(account, at(600));
  const series = windowSeries(account, "five_hour", { now: at(600), hours: 2 });
  assert.equal(series.points.length, 1);
  assert.equal(series.points[0].u, 10);
});

test("balanceSeries reports the DeepSeek balance over time", () => {
  const account = { id: "d", label: "D", provider: "deepseek", deepseekBalance: { is_available: true, balance_infos: [{ currency: "USD", total_balance: "10", granted_balance: "0", topped_up_balance: "10" }] } };
  recordRefresh(account, at(0));
  account.deepseekBalance.balance_infos[0].total_balance = "9.5";
  recordRefresh(account, at(30));
  const series = balanceSeries(account, { now: at(30) });
  assert.deepEqual(series.points.map((point) => point.b), [10, 9.5]);
});

test("intervalsInRange filters computeIntervals by the lookback", () => {
  const account = subscriptionAccount(0, 0);
  for (const [minutes, used] of [[0, 0], [60, 5], [500, 15]]) {
    account.windows[0].usedPercent = used;
    recordRefresh(account, at(minutes));
  }
  assert.equal(intervalsInRange(account, { now: at(500), hours: 2 }).length, 1, "only the interval ending inside the lookback survives");
  assert.equal(intervalsInRange(account, { now: at(500) }).length, 2);
});

test("refreshRows carries a delta per reading and stays self-contained under a range filter", () => {
  const account = subscriptionAccount(0, 0);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 12;
  recordRefresh(account, at(30));
  account.windows[0].usedPercent = 27;
  recordRefresh(account, at(90));

  const all = refreshRows(account, { now: at(90) });
  assert.equal(all.length, 3);
  assert.equal(all[0].gapMinutes, null);
  assert.equal(all[1].windows.five_hour.deltaPercent, 12);
  assert.equal(all[2].windows.five_hour.deltaPercent, 15);
  assert.equal(all[2].windows.five_hour.ratePerHour, 15);

  const recent = refreshRows(account, { now: at(90), hours: 0.5 });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].windows.five_hour.deltaPercent, 15, "a filtered row keeps its own delta, not one recomputed against the range boundary");
});

test("toCsv emits one header and one row per reading", () => {
  const account = subscriptionAccount(0, 0);
  recordRefresh(account, at(0));
  account.windows[0].usedPercent = 8;
  recordRefresh(account, at(20));
  const csv = toCsv(account, { now: at(20) });
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^timestamp,gap_minutes,five_hour_used_pct/);
  assert.match(lines[2], /,8,8,24,/);
});

test("buildTimeScale and projectX place the first and last point at the padded edges", () => {
  const points = [{ t: 1000 }, { t: 2000 }, { t: 4000 }];
  const scale = buildTimeScale(points, { width: 100, padding: 10 });
  assert.equal(projectX(scale, 1000), 10);
  assert.equal(projectX(scale, 4000), 90);
  assert.equal(projectX(scale, 2000), 10 + (1000 / 3000) * 80);
});

test("scalePoints maps values into the pixel box with y inverted (higher value = smaller y)", () => {
  const points = [{ t: 0, u: 0 }, { t: 10, u: 100 }];
  const scaled = scalePoints(points, "u", { width: 100, height: 100, padding: 0, min: 0, max: 100 });
  assert.equal(scaled.points[0].y, 100);
  assert.equal(scaled.points[1].y, 0);
});

test("layoutBars spaces bars evenly and scales height to the max", () => {
  const entries = [{ deltaPercent: 10 }, { deltaPercent: 0 }, { deltaPercent: 20 }];
  const layout = layoutBars(entries, "deltaPercent", { width: 100, height: 50, padding: 0, gap: 0 });
  assert.equal(layout.bars.length, 3);
  assert.equal(Math.round(layout.bars[0].width), 33);
  assert.equal(layout.bars[2].height, 50, "the tallest bar fills the available height");
  assert.equal(layout.bars[1].height, 0.5, "a zero-value bar still renders a sliver, not nothing");
});
