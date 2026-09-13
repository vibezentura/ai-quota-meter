export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function normalizedHeader(value) {
  return String(value).trim().toLowerCase().replace(/^\ufeff/, "");
}

export function summarizeDeepSeekAmountCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The DeepSeek amount CSV has no usage rows.");
  const headers = rows[0].map(normalizedHeader);
  const column = (name) => headers.indexOf(name);
  const typeIndex = column("type");
  const amountIndex = column("amount");
  if (typeIndex < 0 || amountIndex < 0) throw new Error("Choose the DeepSeek amount CSV containing type and amount columns.");
  const keyNameIndex = column("api_key_name");
  const maskedKeyIndex = column("api_key");
  const modelIndex = column("model");
  const dateIndexes = [column("start_time_iso"), column("end_time_iso"), column("utc_date")].filter((index) => index >= 0);
  const keys = new Map();
  const models = new Set();
  const dates = [];
  let totalTokens = 0;
  let totalRequests = 0;

  for (const row of rows.slice(1)) {
    const type = String(row[typeIndex] ?? "").trim().toLowerCase();
    const amount = Number(String(row[amountIndex] ?? "").trim());
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) continue;
    const keyName = String(row[keyNameIndex] ?? row[maskedKeyIndex] ?? "Unnamed key").trim() || "Unnamed key";
    const current = keys.get(keyName) ?? { name: keyName, tokens: 0, requests: 0 };
    if (type === "request_count" || type === "request") {
      current.requests += amount;
      totalRequests += amount;
    } else if (["output_tokens", "input_cache_hit_tokens", "input_cache_miss_tokens", "prompt_token", "prompt_cache_hit_token", "prompt_cache_miss_token", "response_token"].includes(type)) {
      current.tokens += amount;
      totalTokens += amount;
    } else {
      continue;
    }
    keys.set(keyName, current);
    const model = String(row[modelIndex] ?? "").trim();
    if (model) models.add(model);
    for (const index of dateIndexes) {
      const timestamp = Date.parse(row[index]);
      if (Number.isFinite(timestamp)) dates.push(timestamp);
    }
  }
  if (keys.size === 0) throw new Error("No recognized DeepSeek usage rows were found in this CSV.");
  dates.sort((a, b) => a - b);
  return {
    totalTokens,
    totalRequests,
    keys: [...keys.values()].sort((a, b) => b.tokens - a.tokens || b.requests - a.requests).slice(0, 100),
    models: [...models].sort(),
    periodStart: dates.length ? new Date(dates[0]).toISOString() : null,
    periodEnd: dates.length ? new Date(dates.at(-1)).toISOString() : null,
  };
}
