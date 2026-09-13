import { spawn } from "node:child_process";
import readline from "node:readline";
import { findNodeExecutable, findPackageBinary } from "./cli-locator.js";

// npm installs "codex" on Windows as a .cmd shim (which itself execs
// node.exe on bin/codex.js). Node's spawn cannot launch .cmd files
// directly without shell:true, which is an injection risk with array
// args — so resolve straight to the real entry point and run it through
// a Node runtime, mirroring what the shim would do.
function defaultCodexInvocation() {
  if (process.platform !== "win32") return { command: "codex", prefixArgs: [] };
  const scriptPath = findPackageBinary(["@openai", "codex", "bin", "codex.js"]);
  const nodeExecutable = scriptPath ? findNodeExecutable() : null;
  if (scriptPath && nodeExecutable) return { command: nodeExecutable, prefixArgs: [scriptPath] };
  return { command: "codex.cmd", prefixArgs: [], shell: true };
}

function cleanText(value, maximum = 160) {
  return typeof value === "string" ? value.slice(0, maximum) : null;
}

export function normalizeCodexSnapshot(accountResult, limitsResult, checkedAt = new Date().toISOString()) {
  const account = accountResult?.account;
  if (!account || account.type !== "chatgpt") {
    return { connected: false, reason: account ? "Codex is not using a ChatGPT subscription login." : "Codex is not signed in." };
  }

  const buckets = limitsResult?.rateLimitsByLimitId;
  const aggregate = buckets?.codex ?? limitsResult?.rateLimits;
  const windows = [aggregate?.primary, aggregate?.secondary].filter(Boolean).map((window, index) => {
    const durationMinutes = Number(window.windowDurationMins);
    const resetsAt = Number(window.resetsAt);
    const usedPercent = Number(window.usedPercent);
    if (!Number.isFinite(durationMinutes) || !Number.isFinite(resetsAt) || !Number.isFinite(usedPercent)) {
      throw new Error("Codex returned an invalid rate-limit window.");
    }
    const label = durationMinutes === 300 ? "5-hour" : durationMinutes === 10_080 ? "Weekly" : `${Math.round(durationMinutes / 60)}-hour`;
    return {
      id: index === 0 ? "primary" : "secondary",
      label,
      usedPercent,
      durationMinutes,
      resetsAt: new Date(resetsAt * 1000).toISOString(),
    };
  });

  return {
    connected: true,
    identity: {
      email: cleanText(account.email),
      planType: cleanText(account.planType ?? aggregate?.planType, 40),
      authType: "chatgpt",
    },
    windows,
    checkedAt,
  };
}

export async function readCodexSnapshot(options = {}) {
  const spawnImplementation = options.spawnImplementation ?? spawn;
  const explicitCommand = options.command ?? process.env.AI_QUOTA_METER_CODEX_BIN;
  const invocation = explicitCommand ? { command: explicitCommand, prefixArgs: [] } : defaultCodexInvocation();
  const environment = { ...process.env, ...(options.environment ?? {}) };
  const timeoutMs = options.timeoutMs ?? 20_000;
  const child = spawnImplementation(invocation.command, [...invocation.prefixArgs, "app-server", "--listen", "stdio://"], {
    cwd: options.cwd,
    env: environment,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: Boolean(invocation.shell),
  });
  const pending = new Map();
  let nextId = 1;
  let startupError = "";

  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id === undefined || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(cleanText(message.error.message) ?? "Codex App Server rejected the request."));
    else request.resolve(message.result);
  });
  child.stderr.on("data", (chunk) => { startupError = `${startupError}${chunk}`.slice(-1000); });

  const request = (method, params = undefined) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Codex App Server timed out."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ method, id, ...(params === undefined ? {} : { params }) })}\n`);
  });

  const processError = new Promise((_, reject) => {
    child.once("error", () => reject(new Error("Codex CLI is not installed or could not be started.")));
    child.once("exit", (code) => {
      if (pending.size && code !== null) reject(new Error(startupError ? "Codex App Server stopped before returning account data." : "Codex App Server stopped unexpectedly."));
    });
  });

  try {
    const work = (async () => {
      await request("initialize", { clientInfo: { name: "quota_local", title: "AI Quota Meter", version: "0.2.0" } });
      child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
      const accountResult = await request("account/read", { refreshToken: false });
      if (!accountResult?.account) return normalizeCodexSnapshot(accountResult, null);
      const limitsResult = await request("account/rateLimits/read");
      return normalizeCodexSnapshot(accountResult, limitsResult);
    })();
    return await Promise.race([work, processError]);
  } finally {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Codex App Server connection closed."));
    }
    pending.clear();
    lines.close();
    child.kill();
  }
}
