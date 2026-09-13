// Builds a plausible refresh ledger for the demo: a quiet morning, a working
// session, then the reading the card is showing right now. Offsets are minutes
// before "now"; each entry lists the used percent per window at that moment.
function demoLedger(now, resets, entries) {
  return {
    version: 1,
    samples: entries.map(([offsetMinutes, values]) => ({
      t: now.getTime() + offsetMinutes * 60_000,
      w: Object.fromEntries(Object.entries(values).map(([id, used]) => [id, { u: used, r: now.getTime() + resets[id] * 60_000 }])),
    })),
  };
}

function demoBalanceLedger(now, entries) {
  return {
    version: 1,
    samples: entries.map(([offsetMinutes, total]) => ({ t: now.getTime() + offsetMinutes * 60_000, b: total, c: "USD" })),
  };
}

export function createDemoData(now = new Date()) {
  const timestamp = (offsetMinutes) => new Date(now.getTime() + offsetMinutes * 60_000).toISOString();
  return {
    schemaVersion: 1,
    mode: "demo",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    generatedAt: now.toISOString(),
    accounts: [
      {
        id: "claude-a",
        label: "Claude A",
        provider: "claude",
        comparisonGroup: "claude-pro",
        observedAt: timestamp(-2),
        weeklyReservePercent: 15,
        windows: [
          { id: "five_hour", label: "5-hour", usedPercent: 42, durationMinutes: 300, resetsAt: timestamp(88), burnRatePerHour: 5.4 },
          { id: "seven_day", label: "Weekly", usedPercent: 31, durationMinutes: 10080, resetsAt: timestamp(6840), burnRatePerHour: 0.13 },
        ],
        refreshLedger: demoLedger(now, { five_hour: 88, seven_day: 6840 }, [
          [-320, { five_hour: 0, seven_day: 24.1 }],
          [-190, { five_hour: 4.5, seven_day: 25.2 }],
          [-96, { five_hour: 18.7, seven_day: 27.6 }],
          [-58, { five_hour: 27.4, seven_day: 29 }],
          [-27, { five_hour: 35.9, seven_day: 30.2 }],
          [-2, { five_hour: 42, seven_day: 31 }],
        ]),
      },
      {
        id: "claude-b",
        label: "Claude B",
        provider: "claude",
        comparisonGroup: "claude-pro",
        observedAt: timestamp(-5),
        weeklyReservePercent: 15,
        windows: [
          { id: "five_hour", label: "5-hour", usedPercent: 9, durationMinutes: 300, resetsAt: timestamp(281), burnRatePerHour: 2.1 },
          { id: "seven_day", label: "Weekly", usedPercent: 86, durationMinutes: 10080, resetsAt: timestamp(4260), burnRatePerHour: 0.25 },
        ],
        // The 5-hour window rolled over between the third and fourth reading,
        // so that interval is reported as a partial measurement.
        refreshLedger: demoLedger(now, { five_hour: 281, seven_day: 4260 }, [
          [-405, { five_hour: 51.2, seven_day: 79.4 }],
          [-350, { five_hour: 63.8, seven_day: 82.1 }],
          [-300, { five_hour: 71.5, seven_day: 84 }],
          [-140, { five_hour: 3.2, seven_day: 85.1 }],
          [-5, { five_hour: 9, seven_day: 86 }],
        ]),
      },
      {
        id: "codex-main",
        label: "Codex",
        provider: "codex",
        comparisonGroup: "codex-subscription",
        observedAt: timestamp(-1),
        weeklyReservePercent: 15,
        windows: [
          { id: "primary", label: "5-hour", usedPercent: 36, durationMinutes: 300, resetsAt: timestamp(130), burnRatePerHour: 4.2 },
          { id: "secondary", label: "Weekly", usedPercent: 53, durationMinutes: 10080, resetsAt: timestamp(7320), burnRatePerHour: 0.18 },
        ],
        refreshLedger: demoLedger(now, { primary: 130, secondary: 7320 }, [
          [-240, { primary: 11.4, secondary: 47.9 }],
          [-150, { primary: 19.8, secondary: 49.6 }],
          [-64, { primary: 28.1, secondary: 51.4 }],
          [-31, { primary: 33.5, secondary: 52.5 }],
          [-1, { primary: 36, secondary: 53 }],
        ]),
      },
      {
        id: "deepseek-api",
        label: "DeepSeek API",
        provider: "deepseek",
        comparisonGroup: "deepseek-api",
        observedAt: timestamp(-3),
        deepseekBalance: {
          is_available: true,
          balance_infos: [
            { currency: "USD", total_balance: "18.42", granted_balance: "3.00", topped_up_balance: "15.42" },
          ],
        },
        deepseekUsage: {
          totalTokens: 2840000,
          totalRequests: 418,
          keys: [
            { name: "Editor", tokens: 2010000, requests: 302 },
            { name: "Automation", tokens: 830000, requests: 116 },
          ],
          models: ["deepseek-v4-flash", "deepseek-v4-pro"],
          periodStart: timestamp(-20160),
          periodEnd: timestamp(-3),
          importedAt: timestamp(-3),
          sourceName: "amount-demo.csv",
        },
        refreshLedger: demoBalanceLedger(now, [
          [-300, 19.61],
          [-160, 19.08],
          [-72, 18.74],
          [-30, 18.55],
          [-3, 18.42],
        ]),
      },
    ],
  };
}
