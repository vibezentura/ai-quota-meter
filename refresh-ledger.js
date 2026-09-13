// Refresh ledger: records one compact sample of every account's limits each
// time that account is refreshed, then derives the usage consumed between
// consecutive refreshes.
//
// Providers only ever report a point-in-time "percent used" for a rolling
// window. That answers "how much is left" but never "how much did that last
// hour of work actually cost me". Storing the samples locally turns the same
// readings into per-refresh deltas, measured burn rate, per-session cost, and
// a time-to-limit estimate — without sending anything anywhere.
//
// Samples use short keys because the whole ledger is re-encrypted into the
// vault on every save: t = recorded at (epoch ms), w = windows keyed by window
// id with u = usedPercent and r = resetsAt (epoch ms), b = DeepSeek balance,
// c = its currency.

export const LEDGER_VERSION = 1;
export const LEDGER_MAX_SAMPLES = 240;
export const SESSION_GAP_MINUTES = 90;
export const MIN_SAMPLE_GAP_SECONDS = 20;
export const DEFAULT_LOOKBACK_HOURS = 6;

// A window that reports less used than last time has rolled over. Providers
// also nudge resetsAt forward, but the usedPercent drop is the only signal
// that is reliable across Claude, Codex, and imported snapshots.
const RESET_DROP_TOLERANCE = 0.5;

function toEpoch(value) {
  const parsed = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value) * factor) / factor;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function primaryBalance(account) {
  const info = account?.deepseekBalance?.balance_infos?.[0];
  if (!info) return null;
  const total = Number(info.total_balance);
  return Number.isFinite(total) ? { total, currency: info.currency ?? "USD" } : null;
}

// Builds the sample for one account as it looks right now. Returns null when
// the account has nothing measurable yet, so an unconnected profile never
// grows a ledger of empty rows.
export function buildSample(account, now = new Date()) {
  const recordedAt = now instanceof Date ? now.getTime() : Number(now);
  const sample = { t: recordedAt };
  const windows = Array.isArray(account?.windows) ? account.windows : [];
  const measured = {};
  for (const window of windows) {
    const used = Number(window?.usedPercent);
    const resetsAt = toEpoch(window?.resetsAt);
    if (!window?.id || !Number.isFinite(used)) continue;
    measured[window.id] = { u: round(used), ...(resetsAt === null ? {} : { r: resetsAt }) };
  }
  if (Object.keys(measured).length) sample.w = measured;
  const balance = primaryBalance(account);
  if (balance) {
    sample.b = round(balance.total, 4);
    sample.c = balance.currency;
  }
  return sample.w || sample.b !== undefined ? sample : null;
}

function sameReading(a, b) {
  if (!a || !b) return false;
  if (a.b !== b.b) return false;
  const keys = new Set([...Object.keys(a.w ?? {}), ...Object.keys(b.w ?? {})]);
  for (const key of keys) {
    if ((a.w?.[key]?.u ?? null) !== (b.w?.[key]?.u ?? null)) return false;
  }
  return true;
}

export function readLedger(account) {
  const ledger = account?.refreshLedger;
  const samples = Array.isArray(ledger?.samples) ? ledger.samples : [];
  return samples.filter((sample) => Number.isFinite(sample?.t)).sort((a, b) => a.t - b.t);
}

// Appends the current reading to the account's ledger, in place, and returns
// the sample that was stored (or null when the reading was skipped). Two
// refreshes seconds apart with identical numbers collapse into one row so
// double-clicking Refresh does not manufacture a fake zero-usage interval.
export function recordRefresh(account, now = new Date(), options = {}) {
  const sample = buildSample(account, now);
  if (!sample) return null;
  const maximum = options.maxSamples ?? LEDGER_MAX_SAMPLES;
  const samples = readLedger(account);
  const previous = samples[samples.length - 1];
  if (previous && sample.t - previous.t < (options.minGapSeconds ?? MIN_SAMPLE_GAP_SECONDS) * 1000 && sameReading(previous, sample)) {
    return null;
  }
  samples.push(sample);
  account.refreshLedger = { version: LEDGER_VERSION, samples: samples.slice(-maximum) };
  return sample;
}

// Consumption between two consecutive samples of one window. When the window
// rolled over in between, everything spent in the tail of the old window is
// unknowable from percentages alone, so only the new window's usage is
// counted and the interval is flagged as partial.
export function windowDelta(previous, current) {
  if (!previous || !current) return null;
  const spannedReset = current.u < previous.u - RESET_DROP_TOLERANCE
    || (Number.isFinite(previous.r) && Number.isFinite(current.r) && current.r > previous.r + 60_000 && current.u <= previous.u);
  const deltaPercent = spannedReset ? current.u : Math.max(0, current.u - previous.u);
  return { deltaPercent: round(deltaPercent), spannedReset, usedPercent: current.u };
}

// Turns the stored samples into one record per gap between refreshes.
export function computeIntervals(account) {
  const samples = readLedger(account);
  const intervals = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const minutes = (current.t - previous.t) / 60_000;
    if (!(minutes > 0)) continue;
    const windowIds = [...new Set([...Object.keys(previous.w ?? {}), ...Object.keys(current.w ?? {})])];
    const windows = windowIds.flatMap((id) => {
      const delta = windowDelta(previous.w?.[id], current.w?.[id]);
      if (!delta) return [];
      return [{ id, ...delta, ratePerHour: round(delta.deltaPercent / (minutes / 60)) }];
    });
    const balanceDelta = Number.isFinite(previous.b) && Number.isFinite(current.b)
      ? round(previous.b - current.b, 4)
      : null;
    intervals.push({
      startedAt: previous.t,
      endedAt: current.t,
      minutes: round(minutes, 1),
      windows,
      balanceDelta,
      currency: current.c ?? previous.c ?? null,
      idle: windows.every((window) => window.deltaPercent === 0) && (balanceDelta === null || balanceDelta <= 0),
    });
  }
  return intervals;
}

// A "session" is a run of refreshes with no long silence between them: the
// unit a person actually thinks in ("what did this afternoon of work cost").
export function groupSessions(intervals, options = {}) {
  const gapMinutes = options.gapMinutes ?? SESSION_GAP_MINUTES;
  const sessions = [];
  let current = null;
  for (const interval of intervals) {
    // A silence longer than the threshold closes the session; the usage
    // measured across that gap belongs to no working session in particular.
    if (interval.minutes > gapMinutes) {
      current = null;
      continue;
    }
    if (!current) {
      current = { startedAt: interval.startedAt, endedAt: interval.startedAt, refreshes: 1, minutes: 0, windows: {}, balanceDelta: 0, currency: null };
      sessions.push(current);
    }
    current.endedAt = interval.endedAt;
    current.refreshes += 1;
    current.minutes = round(current.minutes + interval.minutes, 1);
    for (const window of interval.windows) {
      current.windows[window.id] = round((current.windows[window.id] ?? 0) + window.deltaPercent);
    }
    if (Number.isFinite(interval.balanceDelta)) current.balanceDelta = round(current.balanceDelta + Math.max(0, interval.balanceDelta), 4);
    if (interval.currency) current.currency = interval.currency;
  }
  return sessions;
}

// Average consumption per hour across the intervals inside a lookback, used
// both for the live burn-rate readout and to fill the forecast field that the
// core scoring already understands.
export function burnRate(intervals, windowId, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const lookbackMs = (options.lookbackHours ?? DEFAULT_LOOKBACK_HOURS) * 3_600_000;
  let deltaPercent = 0;
  let hours = 0;
  for (const interval of intervals) {
    // Judged by where the interval starts: a gap that reaches back before the
    // lookback would otherwise smear hours of old idle time into "recent".
    if (now - interval.startedAt > lookbackMs || interval.endedAt > now + 60_000) continue;
    const window = interval.windows.find((entry) => entry.id === windowId);
    if (!window) continue;
    deltaPercent += window.deltaPercent;
    hours += interval.minutes / 60;
  }
  if (hours <= 0) return null;
  return round(deltaPercent / hours);
}

export function summarizeAccount(account, options = {}) {
  const now = options.now ?? new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const intervals = computeIntervals(account);
  const sessions = groupSessions(intervals, options);
  const last = intervals[intervals.length - 1] ?? null;
  const lastSession = sessions[sessions.length - 1] ?? null;
  const sessionLive = Boolean(lastSession && nowMs - lastSession.endedAt <= (options.gapMinutes ?? SESSION_GAP_MINUTES) * 60_000);
  const windowIds = [...new Set(intervals.flatMap((interval) => interval.windows.map((window) => window.id)))];

  const windows = windowIds.map((id) => {
    const live = (account.windows ?? []).find((window) => window.id === id);
    const remaining = live ? Math.max(0, 100 - Number(live.usedPercent ?? 0)) : null;
    const rate = burnRate(intervals, id, { now: nowMs, lookbackHours: options.lookbackHours });
    const sessionCosts = sessions.map((session) => session.windows[id]).filter((value) => Number.isFinite(value) && value > 0);
    const typicalSessionPercent = median(sessionCosts);
    const lastWindow = last?.windows.find((window) => window.id === id) ?? null;
    return {
      id,
      label: live?.label ?? id,
      lastDeltaPercent: lastWindow?.deltaPercent ?? null,
      lastSpannedReset: Boolean(lastWindow?.spannedReset),
      ratePerHour: rate,
      remainingPercent: remaining,
      hoursToLimit: rate && rate > 0 && remaining !== null ? round(remaining / rate, 2) : null,
      sessionDeltaPercent: lastSession?.windows[id] ?? null,
      typicalSessionPercent: typicalSessionPercent === null ? null : round(typicalSessionPercent),
      sessionsLeft: typicalSessionPercent && typicalSessionPercent > 0 && remaining !== null
        ? Math.floor(remaining / typicalSessionPercent)
        : null,
    };
  });

  return {
    accountId: account?.id ?? null,
    label: account?.label ?? account?.id ?? "",
    provider: account?.provider ?? null,
    samples: readLedger(account).length,
    intervals,
    sessions,
    lastInterval: last,
    lastSession,
    sessionLive,
    windows,
    lastBalanceDelta: last?.balanceDelta ?? null,
    sessionBalanceDelta: lastSession?.balanceDelta ?? null,
    currency: last?.currency ?? null,
  };
}

// Returns a copy of the account whose windows carry the measured burn rate,
// so the existing forecast and capacity scoring run on observed numbers
// instead of whatever the provider did or did not supply.
export function withMeasuredBurnRates(account, options = {}) {
  if (!Array.isArray(account?.windows) || !account.windows.length) return account;
  const intervals = computeIntervals(account);
  if (!intervals.length) return account;
  const now = options.now ?? new Date();
  return {
    ...account,
    windows: account.windows.map((window) => {
      const rate = burnRate(intervals, window.id, { now, lookbackHours: options.lookbackHours });
      return rate === null ? window : { ...window, burnRatePerHour: rate, burnRateSource: "measured" };
    }),
  };
}

// Panel feed: one row per account that has at least one measured interval,
// heaviest recent consumption first.
export function ledgerRows(accounts, options = {}) {
  return (Array.isArray(accounts) ? accounts : [])
    .map((account) => summarizeAccount(account, options))
    .filter((summary) => summary.intervals.length > 0)
    .sort((a, b) => {
      const scoreOf = (summary) => Math.max(0, ...summary.windows.map((window) => window.lastDeltaPercent ?? 0), (summary.lastBalanceDelta ?? 0) * 10);
      return scoreOf(b) - scoreOf(a) || String(a.label).localeCompare(String(b.label));
    });
}

function withinRange(t, now, hours) {
  if (!Number.isFinite(hours)) return true;
  return now - t <= hours * 3_600_000;
}

// Every gap between refreshes that falls inside the given lookback — the
// per-refresh feed behind the expanded account view's bar chart and table.
export function intervalsInRange(account, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const hours = options.hours ?? Infinity;
  return computeIntervals(account).filter((interval) => withinRange(interval.endedAt, now, hours));
}

// Raw usedPercent-over-time for one window, for the expanded account view's
// line chart. `resets` marks the timestamps where the window rolled over, so
// the chart can draw them instead of a misleading downward slope.
export function windowSeries(account, windowId, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const hours = options.hours ?? Infinity;
  const samples = readLedger(account);
  const points = [];
  const resets = [];
  for (let index = 0; index < samples.length; index += 1) {
    const entry = samples[index].w?.[windowId];
    if (!entry) continue;
    const previousEntry = samples[index - 1]?.w?.[windowId];
    if (previousEntry && entry.u < previousEntry.u - RESET_DROP_TOLERANCE) resets.push(samples[index].t);
    points.push({ t: samples[index].t, u: entry.u });
  }
  return {
    points: points.filter((point) => withinRange(point.t, now, hours)),
    resets: resets.filter((t) => withinRange(t, now, hours)),
  };
}

// Raw balance-over-time for a DeepSeek account, for the same line chart.
export function balanceSeries(account, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const hours = options.hours ?? Infinity;
  const points = readLedger(account)
    .filter((sample) => Number.isFinite(sample.b))
    .map((sample) => ({ t: sample.t, b: sample.b, c: sample.c ?? null }));
  return { points: points.filter((point) => withinRange(point.t, now, hours)) };
}

// One row per stored reading, each carrying the delta from the reading
// before it — the data behind the expanded account view's sheet and its CSV
// export. Self-contained (does not lean on computeIntervals' index
// alignment) so a filtered range never desyncs a row from its delta.
export function refreshRows(account, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const hours = options.hours ?? Infinity;
  const samples = readLedger(account);
  const rows = samples.map((sample, index) => {
    const previous = samples[index - 1] ?? null;
    const gapMinutes = previous ? round((sample.t - previous.t) / 60_000, 1) : null;
    const windowIds = new Set([...Object.keys(previous?.w ?? {}), ...Object.keys(sample.w ?? {})]);
    const windows = {};
    for (const id of windowIds) {
      const current = sample.w?.[id];
      if (!current) continue;
      const delta = previous ? windowDelta(previous.w?.[id], current) : null;
      windows[id] = {
        usedPercent: current.u,
        deltaPercent: delta?.deltaPercent ?? null,
        ratePerHour: delta && gapMinutes ? round(delta.deltaPercent / (gapMinutes / 60)) : null,
        spannedReset: Boolean(delta?.spannedReset),
      };
    }
    const balanceDelta = previous && Number.isFinite(previous.b) && Number.isFinite(sample.b)
      ? round(previous.b - sample.b, 4)
      : null;
    const idle = previous ? Object.values(windows).every((window) => !window.deltaPercent) && !(balanceDelta > 0) : null;
    return {
      t: sample.t,
      gapMinutes,
      windows,
      balance: Number.isFinite(sample.b) ? sample.b : null,
      balanceDelta,
      currency: sample.c ?? previous?.c ?? null,
      idle,
    };
  });
  return rows.filter((row) => withinRange(row.t, now, hours));
}

// A dependency-free CSV export of the sheet above — plain ISO timestamps and
// numbers only, so no field ever needs quoting.
export function toCsv(account, options = {}) {
  const rows = refreshRows(account, options);
  const windowIds = [...new Set(rows.flatMap((row) => Object.keys(row.windows)))];
  const header = [
    "timestamp", "gap_minutes",
    ...windowIds.flatMap((id) => [`${id}_used_pct`, `${id}_delta_pct`, `${id}_rate_pct_per_hour`, `${id}_reset`]),
    "balance", "balance_delta", "currency",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const cells = [
      new Date(row.t).toISOString(),
      row.gapMinutes ?? "",
      ...windowIds.flatMap((id) => [
        row.windows[id]?.usedPercent ?? "",
        row.windows[id]?.deltaPercent ?? "",
        row.windows[id]?.ratePerHour ?? "",
        row.windows[id]?.spannedReset ? "1" : "",
      ]),
      row.balance ?? "",
      row.balanceDelta ?? "",
      row.currency ?? "",
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

// --- Chart geometry -------------------------------------------------------
// Pure layout math, kept separate from markup so it can be unit tested
// without a DOM. `t` is epoch ms on every point passed in.

// A shared timestamp-to-x mapping, so a line chart's data path and any extra
// markers (a window reset) land on the same axis.
export function buildTimeScale(points, options = {}) {
  const width = options.width ?? 260;
  const padding = options.padding ?? 4;
  if (!points.length) return { t0: 0, tSpan: 1, width, padding };
  const t0 = points[0].t;
  const tSpan = Math.max(1, points[points.length - 1].t - t0);
  return { t0, tSpan, width, padding };
}

export function projectX(scale, t) {
  return scale.padding + ((t - scale.t0) / scale.tSpan) * (scale.width - scale.padding * 2);
}

// Places each point's numeric field on an SVG canvas. `min`/`max` can be
// pinned (percent charts always run 0–100); otherwise they are read from the
// data, e.g. a balance chart that has no fixed ceiling.
export function scalePoints(points, valueKey, options = {}) {
  const width = options.width ?? 260;
  const height = options.height ?? 90;
  const padding = options.padding ?? 4;
  const scale = buildTimeScale(points, { width, padding });
  if (!points.length) return { points: [], min: options.min ?? 0, max: options.max ?? 100, width, height, scale };
  const values = points.map((point) => Number(point[valueKey]));
  const min = options.min ?? Math.min(...values);
  const max = options.max ?? Math.max(...values);
  const span = Math.max(1e-6, max - min);
  const scaledPoints = points.map((point) => ({
    ...point,
    x: projectX(scale, point.t),
    y: height - padding - ((Number(point[valueKey]) - min) / span) * (height - padding * 2),
  }));
  return { points: scaledPoints, min, max, width, height, scale };
}

// Lays evenly-spaced bars out left to right — the per-refresh bar chart. Each
// input entry keeps its own fields plus x/y/width/height for its bar.
export function layoutBars(entries, valueKey, options = {}) {
  const width = options.width ?? 280;
  const height = options.height ?? 90;
  const gap = options.gap ?? 3;
  const padding = options.padding ?? 2;
  if (!entries.length) return { bars: [], width, height, max: options.max ?? 1 };
  const values = entries.map((entry) => Math.max(0, Number(entry[valueKey]) || 0));
  const max = options.max ?? Math.max(...values, 1e-6);
  const barWidth = Math.max(1, (width - padding * 2 - gap * (entries.length - 1)) / entries.length);
  const bars = entries.map((entry, index) => {
    const value = Math.max(0, Number(entry[valueKey]) || 0);
    const barHeight = value > 0 ? Math.max(1.5, (value / max) * (height - padding * 2)) : 0.5;
    return { ...entry, x: padding + index * (barWidth + gap), width: barWidth, height: barHeight, y: height - padding - barHeight };
  });
  return { bars, width, height, max };
}

// Totals across every tracked account for the strip at the top of the panel.
export function ledgerTotals(summaries, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const windowSince = now - (options.sinceHours ?? 24) * 3_600_000;
  let refreshes = 0;
  let workingRefreshes = 0;
  let spend = 0;
  let currency = null;
  const rates = [];
  for (const summary of summaries) {
    for (const interval of summary.intervals) {
      if (interval.endedAt < windowSince) continue;
      refreshes += 1;
      if (!interval.idle) workingRefreshes += 1;
      if (Number.isFinite(interval.balanceDelta) && interval.balanceDelta > 0) {
        spend += interval.balanceDelta;
        currency = interval.currency ?? currency;
      }
    }
    for (const window of summary.windows) {
      if (Number.isFinite(window.ratePerHour) && window.ratePerHour > 0) rates.push(window.ratePerHour);
    }
  }
  return {
    refreshes,
    workingRefreshes,
    spend: round(spend, 4),
    currency,
    peakRatePerHour: rates.length ? round(Math.max(...rates)) : null,
    trackedAccounts: summaries.length,
  };
}
