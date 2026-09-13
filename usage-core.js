const TASK_COSTS = Object.freeze({
  light: 5,
  normal: 15,
  heavy: 30,
});

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function remainingPercent(window) {
  return clamp(100 - Number(window?.usedPercent ?? 0), 0, 100);
}

export function isFresh(account, now = new Date(), freshnessMinutes = 15) {
  const observedAt = Date.parse(account?.observedAt ?? "");
  if (!Number.isFinite(observedAt)) return false;
  return now.getTime() - observedAt <= freshnessMinutes * 60_000 && observedAt <= now.getTime() + 60_000;
}

export function classifyWindows(account) {
  const windows = Array.isArray(account?.windows) ? account.windows : [];
  const ordered = [...windows].sort((a, b) => Number(a.durationMinutes ?? Infinity) - Number(b.durationMinutes ?? Infinity));
  const short = windows.find((window) => /five|5.?hour|session|primary/i.test(`${window.id} ${window.label}`))
    ?? ordered.find((window) => Number(window.durationMinutes) <= 360)
    ?? ordered[0];
  const weekly = windows.find((window) => /seven|7.?day|week|secondary/i.test(`${window.id} ${window.label}`))
    ?? [...ordered].reverse().find((window) => Number(window.durationMinutes) >= 6 * 24 * 60);
  return { short, weekly };
}

export function enrichWindow(window, now = new Date()) {
  if (!window) return null;
  const resetMs = Date.parse(window.resetsAt ?? "");
  const durationMinutes = Number(window.durationMinutes ?? 0);
  const remaining = remainingPercent(window);
  const hoursRemaining = Number.isFinite(resetMs)
    ? Math.max(0, (resetMs - now.getTime()) / 3_600_000)
    : null;
  const burnRatePerHour = Number(window.burnRatePerHour);
  const hasForecast = Number.isFinite(burnRatePerHour) && burnRatePerHour >= 0 && hoursRemaining !== null;
  const projectedUsed = hasForecast
    ? clamp(Number(window.usedPercent) + burnRatePerHour * hoursRemaining, Number(window.usedPercent), 100)
    : null;
  const projectedUnused = projectedUsed === null ? null : Math.max(0, 100 - projectedUsed);
  const durationHours = durationMinutes > 0 ? durationMinutes / 60 : null;
  const elapsedFraction = durationHours && hoursRemaining !== null
    ? clamp(1 - hoursRemaining / durationHours, 0, 1)
    : null;
  const evenPaceUsed = elapsedFraction === null ? null : elapsedFraction * 100;
  const paceRatio = evenPaceUsed && evenPaceUsed > 0
    ? Number(window.usedPercent) / evenPaceUsed
    : null;

  return {
    ...window,
    remainingPercent: remaining,
    hoursRemaining,
    projectedUnusedPercent: projectedUnused,
    paceRatio,
    resetExpected: Number.isFinite(resetMs) && resetMs <= now.getTime(),
  };
}

export function evaluateAccount(account, options = {}) {
  const now = options.now ?? new Date();
  const freshnessMinutes = options.freshnessMinutes ?? 15;
  const taskClass = options.taskClass ?? "normal";
  const { short, weekly } = classifyWindows(account);
  const shortWindow = enrichWindow(short, now);
  const weeklyWindow = enrichWindow(weekly, now);
  const fresh = isFresh(account, now, freshnessMinutes);
  const taskCost = Number(account?.taskCosts?.[taskClass] ?? TASK_COSTS[taskClass] ?? TASK_COSTS.normal);
  const reserve = Number(account?.weeklyReservePercent ?? 15);
  const shortRemaining = shortWindow?.remainingPercent ?? 0;
  const weeklyRemaining = weeklyWindow?.remainingPercent ?? 100;
  const blocked = Boolean(account?.blocked) || shortRemaining <= 0 || weeklyRemaining <= 0;
  const reserveConstrained = weeklyRemaining - taskCost < reserve;
  const taskMayExhaust = shortRemaining < taskCost || weeklyRemaining < taskCost;

  let status = "ready";
  if (!fresh) status = account?.observedAt ? "stale" : "unknown";
  else if (blocked) status = "blocked";
  else if (taskMayExhaust) status = "near-limit";
  else if (reserveConstrained) status = "conserve";

  const weeklyRisk = weeklyWindow?.projectedUnusedPercent ?? weeklyRemaining;
  const shortRisk = shortWindow?.projectedUnusedPercent ?? shortRemaining;
  const weeklyUrgency = weeklyRisk / Math.max(weeklyWindow?.hoursRemaining ?? 168, 1);
  const shortUrgency = shortRisk / Math.max(shortWindow?.hoursRemaining ?? 5, 0.25);

  return {
    account,
    fresh,
    status,
    eligible: fresh && !blocked && !taskMayExhaust && !reserveConstrained,
    reserveConstrained,
    taskMayExhaust,
    shortWindow,
    weeklyWindow,
    urgencyScore: weeklyUrgency * 100 + shortUrgency,
  };
}

export function recommendAccounts(accounts, options = {}) {
  const provider = options.provider ?? "claude";
  const candidates = (Array.isArray(accounts) ? accounts : [])
    .filter((account) => account.provider !== "deepseek" && (provider === "all" || account.provider === provider))
    .map((account) => evaluateAccount(account, options));
  const groups = new Map();

  for (const candidate of candidates) {
    const group = candidate.account.comparisonGroup ?? `${candidate.account.provider}-default`;
    const existing = groups.get(group) ?? [];
    existing.push(candidate);
    groups.set(group, existing);
  }

  return [...groups.entries()].map(([comparisonGroup, groupCandidates]) => {
    const eligible = groupCandidates
      .filter((candidate) => candidate.eligible)
      .sort((a, b) => b.urgencyScore - a.urgencyScore || String(a.account.id).localeCompare(String(b.account.id)));
    const best = eligible[0] ?? null;
    const reasons = [];

    if (best) {
      const others = groupCandidates.filter((candidate) => candidate !== best);
      if (others.some((candidate) => candidate.reserveConstrained)) reasons.push("OTHER_ACCOUNT_BELOW_WEEKLY_RESERVE");
      if ((best.weeklyWindow?.hoursRemaining ?? Infinity) <= (best.shortWindow?.hoursRemaining ?? -Infinity)) {
        reasons.push("WEEKLY_CAPACITY_EXPIRES_SOONER");
      } else {
        reasons.push("SHORT_WINDOW_CAPACITY_EXPIRES_SOONER");
      }
      if (groupCandidates.filter((candidate) => candidate.fresh).length === 1) reasons.push("ONLY_FRESH_ELIGIBLE_ACCOUNT");
    } else {
      reasons.push("NO_SAFE_RECOMMENDATION");
    }

    return { comparisonGroup, best, candidates: groupCandidates, reasons };
  });
}

export function buildResetTimeline(accounts, now = new Date()) {
  return (Array.isArray(accounts) ? accounts : [])
    .flatMap((account) => (account.windows ?? []).map((window) => ({
      accountId: account.id,
      accountLabel: account.label,
      provider: account.provider,
      windowId: window.id,
      windowLabel: window.label,
      resetsAt: window.resetsAt,
      remainingPercent: remainingPercent(window),
      resetExpected: Date.parse(window.resetsAt) <= now.getTime(),
    })))
    .filter((event) => Number.isFinite(Date.parse(event.resetsAt)))
    .sort((a, b) => Date.parse(a.resetsAt) - Date.parse(b.resetsAt));
}

export function formatCountdown(target, now = new Date()) {
  const difference = Date.parse(target) - now.getTime();
  if (!Number.isFinite(difference)) return "reset unknown";
  if (difference <= 0) return "confirmation pending";
  const totalMinutes = Math.ceil(difference / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function validateUsageDocument(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.accounts)) {
    throw new Error("Usage data must contain an accounts array.");
  }
  if (value.schemaVersion !== 1) throw new Error("Unsupported usage schema version.");
  for (const account of value.accounts) {
    if (!account.id || !account.label || !account.provider) {
      throw new Error("Every account needs id, label, and provider.");
    }
    if (account.provider === "deepseek") {
      if (account.deepseekBalance !== undefined && !Array.isArray(account.deepseekBalance?.balance_infos)) {
        throw new Error(`Account ${account.id} contains an invalid DeepSeek balance.`);
      }
      continue;
    }
    if (!Array.isArray(account.windows)) {
      throw new Error(`Account ${account.id} needs a windows array.`);
    }
    for (const window of account.windows) {
      const used = Number(window.usedPercent);
      if (!window.id || !Number.isFinite(used) || used < 0 || used > 100 || !Number.isFinite(Date.parse(window.resetsAt))) {
        throw new Error(`Account ${account.id} contains an invalid usage window.`);
      }
    }
  }
  return value;
}
