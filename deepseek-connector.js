export function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function isLoopbackOrigin(origin) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function validateDeepSeekApiKey(apiKey) {
  if (typeof apiKey !== "string" || apiKey.length < 10 || apiKey.length > 256 || /\s/.test(apiKey)) {
    throw new Error("Enter a valid DeepSeek API key.");
  }
  return apiKey;
}

export function normalizeDeepSeekBalance(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.balance_infos)) {
    throw new Error("DeepSeek returned an unexpected balance response.");
  }
  const balanceInfos = value.balance_infos.map((entry) => {
    const currency = String(entry?.currency ?? "");
    if (!/^(USD|CNY)$/.test(currency)) throw new Error("DeepSeek returned an unsupported currency.");
    const fields = ["total_balance", "granted_balance", "topped_up_balance"];
    const normalized = { currency };
    for (const field of fields) {
      const amount = String(entry?.[field] ?? "");
      if (!/^-?\d+(\.\d+)?$/.test(amount)) throw new Error("DeepSeek returned an invalid balance amount.");
      normalized[field] = amount;
    }
    return normalized;
  });
  return { is_available: Boolean(value.is_available), balance_infos: balanceInfos };
}

export async function fetchDeepSeekBalance(apiKey, fetchImplementation = fetch) {
  validateDeepSeekApiKey(apiKey);
  const response = await fetchImplementation("https://api.deepseek.com/user/balance", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error("DEEPSEEK_AUTH_REJECTED");
  if (!response.ok) throw new Error("DEEPSEEK_UNAVAILABLE");
  return normalizeDeepSeekBalance(await response.json());
}
