import assert from "node:assert/strict";
import test from "node:test";
import { buildResetTimeline, evaluateAccount, formatCountdown, validateUsageDocument } from "../usage-core.js";

const NOW = new Date("2026-08-28T12:00:00Z");

function account(overrides = {}) {
  return {
    id: "a",
    label: "Claude A",
    provider: "claude",
    observedAt: "2026-08-28T11:58:00Z",
    weeklyReservePercent: 15,
    windows: [
      { id: "five_hour", label: "5-hour", usedPercent: 40, durationMinutes: 300, resetsAt: "2026-08-28T14:00:00Z", burnRatePerHour: 5 },
      { id: "seven_day", label: "Weekly", usedPercent: 30, durationMinutes: 10080, resetsAt: "2026-09-02T12:00:00Z", burnRatePerHour: 0.1 },
    ],
    ...overrides,
  };
}

test("stale accounts fail closed", () => {
  const result = evaluateAccount(account({ observedAt: "2026-08-28T10:00:00Z" }), { now: NOW });
  assert.equal(result.status, "stale");
  assert.equal(result.eligible, false);
});

test("weekly reserve changes an account from ready to conserve", () => {
  const constrained = account({
    id: "b",
    windows: [
      { id: "five_hour", label: "5-hour", usedPercent: 5, durationMinutes: 300, resetsAt: "2026-08-28T15:00:00Z" },
      { id: "seven_day", label: "Weekly", usedPercent: 80, durationMinutes: 10080, resetsAt: "2026-09-02T12:00:00Z" },
    ],
  });
  const result = evaluateAccount(constrained, { now: NOW });
  assert.equal(result.reserveConstrained, true);
  assert.equal(result.status, "conserve");
});

test("expired reset timestamps are marked expected and sort first", () => {
  const expired = account({
    windows: [{ id: "five_hour", label: "5-hour", usedPercent: 88, durationMinutes: 300, resetsAt: "2026-08-28T11:00:00Z" }],
  });
  const [event] = buildResetTimeline([expired], NOW);
  assert.equal(event.resetExpected, true);
  assert.equal(formatCountdown(event.resetsAt, NOW), "confirmation pending");
});

test("schema validation rejects impossible percentages", () => {
  assert.throws(() => validateUsageDocument({
    schemaVersion: 1,
    accounts: [account({ windows: [{ id: "five_hour", usedPercent: 101, resetsAt: "2026-08-28T14:00:00Z" }] })],
  }), /invalid usage window/);
});
