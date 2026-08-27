export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const HISTORY_MAX_GAP_MS = 90 * 60 * 1000;
export const STORAGE_SCHEMA_VERSION = 3;
export const PARSER_VERSION = 4;

export function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(n)));
}

export function isFiniteNumber(v) {
  return Number.isFinite(Number(v));
}

export function normalizeTimestampSeconds(v) {
  if (typeof v === "string" && !/^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(v)) {
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed / 1000);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 10_000_000_000 ? Math.round(n / 1000) : Math.round(n);
}

export function normalizeWindow(window, slot = "primary", nowMs = Date.now()) {
  if (!window || typeof window !== "object") return null;
  const remainingInput = window.percent_left ?? window.percentLeft ?? window.remaining_percent ?? window.remainingPercent ?? window.remaining;
  const usedInput = window.used_percent ?? window.usedPercent ?? window.used;
  const used = isFiniteNumber(remainingInput) ? 100 - Number(remainingInput) : Number(usedInput);
  const durationMins = Number(window.windowDurationMins ?? window.window_minutes ?? window.windowMinutes);
  const durationSeconds = Number(
    window.limit_window_seconds ??
    window.limitWindowSeconds ??
    window.window_seconds ??
    window.windowSeconds ??
    window.duration_seconds ??
    window.durationSeconds ??
    (Number.isFinite(durationMins) ? durationMins * 60 : NaN)
  );
  let resetAt = normalizeTimestampSeconds(window.reset_time_ms ?? window.resetTimeMs ?? window.reset_at ?? window.resets_at ?? window.resetsAt);
  const resetAfter = Number(window.reset_after_seconds ?? window.resetAfterSeconds);
  if (!resetAt && Number.isFinite(resetAfter)) resetAt = Math.round(nowMs / 1000 + resetAfter);

  return {
    slot,
    usedPercent: Number.isFinite(used) ? clamp(used) : null,
    remainingPercent: Number.isFinite(used) ? clamp(100 - used) : null,
    windowSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    resetAt,
    raw: {
      usedPercent: Number.isFinite(used) ? used : null,
      windowDurationMins: Number.isFinite(durationMins) ? durationMins : null,
      resetAt
    }
  };
}

export function classifyWindow(w, activeCount = 1, nowMs = Date.now()) {
  if (!w) return null;
  const seconds = w.windowSeconds;
  const untilReset = w.resetAt ? w.resetAt * 1000 - nowMs : null;
  const slot = String(w.slot || "").toLowerCase().replace(/[ -]/g, "_");
  const shortSlot = new Set(["five_hour", "five_hours", "fivehour", "fivehours", "short", "short_window", "5h"]).has(slot);
  const weeklySlot = new Set(["weekly", "week", "weekly_window", "7d"]).has(slot);
  const primarySlot = slot === "primary" || slot === "primary_window";
  const secondarySlot = slot === "secondary" || slot === "secondary_window";

  if (shortSlot) {
    const hours = seconds && seconds >= 4 * 3600 && seconds <= 6 * 3600 ? Math.round(seconds / 3600) : 5;
    return { ...w, id: "short", label: hours + "-hour limit", kind: "short", inferredKind: !seconds };
  }
  if (weeklySlot) {
    return { ...w, id: "weekly", label: "Weekly limit", kind: "weekly", inferredKind: !seconds };
  }

  if (seconds && seconds >= 6 * 24 * 3600 && seconds <= 8 * 24 * 3600) {
    return { ...w, id: "weekly", label: "Weekly limit", kind: "weekly" };
  }
  if (seconds && seconds >= 4 * 3600 && seconds <= 6 * 3600) {
    return { ...w, id: "short", label: `${Math.round(seconds / 3600)}-hour limit`, kind: "short" };
  }
  if (!seconds && primarySlot && untilReset != null && untilReset <= 6 * HOUR_MS) {
    return { ...w, id: "short", label: "5-hour limit", kind: "short", inferredKind: true };
  }
  if (!seconds && secondarySlot && untilReset != null && untilReset > 18 * HOUR_MS) {
    return { ...w, id: "weekly", label: "Weekly limit", kind: "weekly", inferredKind: true };
  }
  if (activeCount === 1) {
    // Current Plus accounts may expose just one Codex quota window. Long reset horizons
    // are weekly; even when duration metadata is absent we prefer the only-window signal.
    if (untilReset == null || untilReset > 18 * HOUR_MS) {
      return { ...w, id: "weekly", label: "Weekly limit", kind: "weekly", inferredKind: true };
    }
  }
  return { ...w, id: w.slot || "limit", label: "Usage limit", kind: "custom" };
}

export function normalizeResetCredits(raw) {
  const root = raw?.rateLimitResetCredits ?? raw?.rate_limit_reset_credits ?? raw?.reset_credits;
  const credits = Array.isArray(root?.credits) ? root.credits : Array.isArray(root) ? root : [];
  return credits.map((c, i) => ({
    id: String(c.id ?? `credit-${i + 1}`),
    title: c.title ?? "Rate-limit reset credit",
    description: c.description ?? "",
    status: c.status ?? "unknown",
    grantedAt: normalizeTimestampSeconds(c.grantedAt ?? c.granted_at),
    expiresAt: normalizeTimestampSeconds(c.expiresAt ?? c.expires_at),
    resetType: c.resetType ?? c.reset_type ?? null
  }));
}

export function parseUsage(raw, nowMs = Date.now()) {
  const roots = [
    raw?.rate_limit, raw?.rateLimit, raw?.rateLimits, raw?.rate_limits,
    raw?.codex?.rate_limit, raw?.codex?.rateLimit, raw?.codex?.rateLimits,
    raw?.codex, raw
  ].filter(root => root && typeof root === "object");
  const candidates = [];
  const seen = new Set();
  const add = (value, slot) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const normalized = normalizeWindow(value, slot, nowMs);
    if (normalized && (normalized.usedPercent != null || normalized.resetAt || normalized.windowSeconds)) candidates.push(normalized);
  };
  for (const root of roots) {
    add(root.five_hour ?? root.fiveHour ?? root.five_hours ?? root.fiveHours, "five_hour");
    add(root.weekly ?? root.weekly_window ?? root.weeklyWindow ?? root.week, "weekly");
    add(root.primary_window ?? root.primaryWindow ?? root.primary, "primary");
    add(root.secondary_window ?? root.secondaryWindow ?? root.secondary, "secondary");
    const windows = root.windows ?? root.quota_windows ?? root.quotaWindows;
    if (Array.isArray(windows)) windows.forEach((window, index) => add(window, window.id ?? window.name ?? `window-${index + 1}`));
    if (Array.isArray(root)) root.forEach((window, index) => add(window, window.id ?? window.name ?? `window-${index + 1}`));
  }

  const windows = candidates.map(w => classifyWindow(w, candidates.length, nowMs));
  const unique = [];
  const ids = new Map();
  for (const w of windows) {
    const count = ids.get(w.id) || 0;
    ids.set(w.id, count + 1);
    unique.push(count ? { ...w, id: `${w.id}-${count + 1}` } : w);
  }

  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    planType: raw?.plan_type ?? raw?.planType ?? raw?.account?.planType ?? null,
    windows: unique,
    resetCredits: normalizeResetCredits(raw),
    fetchedAt: nowMs
  };
}

export function preferredWindow(usage) {
  return getWeeklyWindow(usage) || usage?.windows?.[0] || null;
}

export function getWeeklyWindow(usage) {
  return usage?.windows?.find(w => w?.kind === "weekly" || w?.id === "weekly") || null;
}

export function getShortWindow(usage) {
  return usage?.windows?.find(w => w?.kind === "short" || w?.id === "short") || null;
}

export function inferCycle(window, nowMs = Date.now()) {
  if (!window) return null;
  let durationMs = window.windowSeconds ? window.windowSeconds * 1000 : null;
  let durationInferred = false;
  if (!durationMs && window.kind === "weekly") {
    durationMs = WEEK_MS;
    durationInferred = true;
  }
  if (!durationMs || !window.resetAt) return null;
  const endMs = window.resetAt * 1000;
  const startMs = endMs - durationMs;
  return {
    startMs,
    endMs,
    durationMs,
    durationInferred,
    elapsedMs: clamp(nowMs - startMs, 0, durationMs),
    remainingMs: Math.max(0, endMs - nowMs),
    elapsedFraction: clamp((nowMs - startMs) / durationMs, 0, 1),
    remainingFraction: clamp((endMs - nowMs) / durationMs, 0, 1)
  };
}

export function sameCycle(a, b) {
  if (!a || !b) return false;
  if (a.windowId && b.windowId && a.windowId !== b.windowId) return false;
  if (a.resetAt && b.resetAt) return Math.abs(a.resetAt - b.resetAt) <= 120;
  return true;
}

export function getCurrentCycleHistory(history = [], usage) {
  const w = preferredWindow(usage);
  if (!w) return [];
  return normalizeHistory(history).filter(p => {
    if (p.windowId && p.windowId !== w.id) return false;
    if (p.resetAt && w.resetAt && Math.abs(p.resetAt - w.resetAt) > 120) return false;
    return true;
  }).sort((a, b) => a.t - b.t);
}

export function calculateObservedBurn(history = [], minSpanMs = 20 * 60 * 1000, maxGapMs = HISTORY_MAX_GAP_MS) {
  const points = normalizeHistory(history);
  if (points.length < 2) return null;
  let elapsedMs = 0;
  let burned = 0;
  let segments = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const gap = current.t - previous.t;
    const drop = previous.remaining - current.remaining;
    // Long gaps are unknown time, and quota gains are not negative usage.
    if (gap <= 0 || gap > maxGapMs || drop <= 0.05) continue;
    elapsedMs += gap;
    burned += drop;
    segments++;
  }
  if (elapsedMs < minSpanMs || burned <= 0.05 || segments === 0) return null;
  const rawPerHour = burned / (elapsedMs / HOUR_MS);
  const perHour = clamp(rawPerHour, 0, 100 / 24);
  return { source: "observed", elapsedMs, burned: clamp(burned), perHour, perDay: clamp(perHour * 24), segments };
}

export function calculateCycleAverageBurn(window, nowMs = Date.now()) {
  const cycle = inferCycle(window, nowMs);
  if (!cycle || !isFiniteNumber(window?.usedPercent) || cycle.elapsedMs < 10 * 60 * 1000) return null;
  if (window.usedPercent <= 0) return { source: "cycle", elapsedMs: cycle.elapsedMs, burned: 0, perHour: 0, perDay: 0 };
  const perHour = window.usedPercent / (cycle.elapsedMs / HOUR_MS);
  return { source: "cycle", elapsedMs: cycle.elapsedMs, burned: window.usedPercent, perHour, perDay: perHour * 24 };
}

export function calculateBurn(window, history = [], nowMs = Date.now()) {
  // Burn rate must be based on quota changes observed by this extension.
  // Do not derive it from usedPercent / inferred cycle age: Codex quota windows
  // are not guaranteed to expose a trustworthy cycle start and that can create
  // wildly misleading extrapolations on a fresh install.
  return calculateObservedBurn(history);
}

export function calculatePacing(window, history = [], options = {}, nowMs = Date.now()) {
  if (!window || !isFiniteNumber(window.remainingPercent)) return null;
  const targetRemaining = clamp(options.targetRemaining ?? 0);
  const tolerance = Math.max(0, Number(options.tolerance ?? 3));
  const cycle = inferCycle(window, nowMs);
  const burn = calculateBurn(window, history, nowMs);
  if (!cycle) return { burn, cycle: null };

  const usableRemaining = Math.max(0, window.remainingPercent - targetRemaining);
  const safePerHour = cycle.remainingMs > 0 ? usableRemaining / (cycle.remainingMs / HOUR_MS) : 0;
  const safePerDay = safePerHour * 24;
  // "Safe pace" is valid immediately because it only answers: how much of the
  // currently remaining allowance may be consumed per day until the known reset.
  // Overall pace status, however, requires an observed burn rate.
  const idealRemainingNow = null;
  const paceDelta = burn ? safePerDay - burn.perDay : null;

  let status = "learning";
  if (burn) {
    if (burn.perDay > safePerDay + tolerance) status = "too-fast";
    else if (burn.perDay < Math.max(0, safePerDay - tolerance)) status = "underusing";
    else status = "on-pace";
  }

  let hoursToExhaustion = null;
  let exhaustionAt = null;
  let predictedRemainingAtReset = null;
  if (burn && burn.perHour > 0) {
    hoursToExhaustion = usableRemaining / burn.perHour;
    exhaustionAt = nowMs + hoursToExhaustion * HOUR_MS;
    predictedRemainingAtReset = clamp(window.remainingPercent - burn.perHour * (cycle.remainingMs / HOUR_MS));
  } else if (burn && burn.perHour === 0) {
    predictedRemainingAtReset = window.remainingPercent;
  }

  return {
    cycle,
    burn,
    targetRemaining,
    tolerance,
    safePerHour,
    safePerDay,
    idealRemainingNow,
    paceDelta,
    status,
    hoursToExhaustion,
    exhaustionAt,
    predictedRemainingAtReset,
    shortfallMs: exhaustionAt && exhaustionAt < cycle.endMs ? cycle.endMs - exhaustionAt : 0,
    surplusMs: exhaustionAt && exhaustionAt >= cycle.endMs ? exhaustionAt - cycle.endMs : 0
  };
}

export function inferSessions(history = [], gapMs = 45 * 60 * 1000) {
  const points = normalizeHistory(history);
  const events = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const burned = Number(prev.remaining) - Number(cur.remaining);
    if (burned > 0.05 && cur.t > prev.t && cur.t - prev.t <= gapMs) events.push({ start: prev.t, end: cur.t, burned });
  }
  if (!events.length) return [];
  const sessions = [];
  let current = { start: events[0].start, end: events[0].end, burned: events[0].burned, samples: 1 };
  for (const e of events.slice(1)) {
    if (e.start - current.end <= gapMs) {
      current.end = e.end;
      current.burned += e.burned;
      current.samples += 1;
    } else {
      sessions.push(current);
      current = { start: e.start, end: e.end, burned: e.burned, samples: 1 };
    }
  }
  sessions.push(current);
  return sessions.map(s => ({
    ...s,
    durationMs: Math.max(0, s.end - s.start),
    burnPerHour: s.durationMs > 0 ? s.burned / (s.durationMs / HOUR_MS) : null
  }));
}

export function buildHeatmap(history = [], days = 7, nowMs = Date.now()) {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const startMs = start.getTime();
  const buckets = Array.from({ length: days * 24 }, () => 0);
  const points = normalizeHistory(history);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], cur = points[i];
    const burned = Math.max(0, Number(prev.remaining) - Number(cur.remaining));
    if (burned <= 0 || cur.t < startMs || cur.t - prev.t > HISTORY_MAX_GAP_MS) continue;
    const d = new Date(cur.t);
    const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
    const dayIndex = Math.floor((dayStart.getTime() - startMs) / DAY_MS);
    const idx = dayIndex * 24 + d.getHours();
    if (idx >= 0 && idx < buckets.length) buckets[idx] += burned;
  }
  return { startMs, days, buckets, max: Math.max(0, ...buckets) };
}

export function detectReset(oldW, newW) {
  if (!oldW || !newW) return null;
  if (!isFiniteNumber(oldW.remainingPercent) || !isFiniteNumber(newW.remainingPercent)) return null;
  const gain = newW.remainingPercent - oldW.remainingPercent;
  const resetMoved = oldW.resetAt && newW.resetAt && newW.resetAt > oldW.resetAt + 60;
  const replenished = gain >= 20 || (oldW.remainingPercent < 99 && newW.remainingPercent >= 99);
  if (replenished && (resetMoved || newW.remainingPercent >= 99)) {
    return { confirmed: true, gain, oldRemaining: oldW.remainingPercent, newRemaining: newW.remainingPercent };
  }
  return null;
}

export function detectThresholdCrossings(oldRemaining, newRemaining, thresholds = []) {
  if (!isFiniteNumber(oldRemaining) || !isFiniteNumber(newRemaining)) return [];
  return thresholds
    .filter(t => Number.isFinite(Number(t)))
    .map(Number)
    .filter(t => oldRemaining > t && newRemaining <= t)
    .sort((a, b) => b - a);
}

export function aggregateCycles(history = [], resetEvents = []) {
  const events = [...resetEvents].sort((a,b) => a.t - b.t);
  if (!history.length) return [];
  const points = normalizeHistory(history);
  const groups = new Map();
  for (const p of points) {
    const key = p.resetAt ? `${p.windowId || "window"}:${p.resetAt}` : `${p.windowId || "window"}:unknown`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const cycles = [];
  for (const [key, pts] of groups.entries()) {
    const first = pts[0], last = pts[pts.length - 1];
    const startRemaining = first.remaining;
    const endRemaining = last.remaining;
    const usedObserved = Math.max(0, startRemaining - endRemaining);
    cycles.push({
      key,
      start: first.t,
      end: last.t,
      resetAt: first.resetAt || null,
      startRemaining,
      endRemaining,
      usedObserved,
      maxUsed: Math.max(...pts.map(p => Number(p.used ?? 100 - p.remaining)).filter(Number.isFinite), 0),
      samples: pts.length,
      confirmedReset: events.some(e => e.oldResetAt && first.resetAt && Math.abs(e.oldResetAt - first.resetAt) < 120)
    });
  }
  return cycles.sort((a,b) => b.start - a.start);
}

export function sessionPlanner(window, history, durationHours, nowMs = Date.now()) {
  const burn = calculateBurn(window, history, nowMs);
  if (!burn || !Number.isFinite(burn.perHour) || burn.perHour <= 0) return null;
  const expectedUse = burn.perHour * durationHours;
  return {
    durationHours,
    expectedUse,
    remainingAfter: clamp(window.remainingPercent - expectedUse),
    burnSource: burn.source
  };
}

export function sanitizeDiagnostics(obj) {
  const blocked = /token|cookie|authorization|secret|webhook|password|relay.*url|chat.*id/i;
  const redactText = value => String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/https:\/\/(?:canary\.)?discord(?:app)?\.com\/api\/webhooks\/[^\s"']+/gi, "[redacted Discord webhook]")
    .replace(/https:\/\/api\.telegram\.org\/bot[^/\s"']+/gi, "https://api.telegram.org/bot[redacted]");
  const walk = value => {
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value === "string") return redactText(value);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = blocked.test(k) ? "[redacted]" : walk(v);
    return out;
  };
  return walk(obj);
}

export function normalizeHistory(history = [], limit = 12000) {
  if (!Array.isArray(history)) return [];
  const valid = [];
  for (const point of history) {
    if (!point || typeof point !== "object") continue;
    const t = Number(point.t);
    const remaining = Number(point.remaining);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(remaining)) continue;
    const used = Number(point.used);
    valid.push({
      t,
      remaining: clamp(remaining),
      used: Number.isFinite(used) ? clamp(used) : clamp(100 - remaining),
      resetAt: normalizeTimestampSeconds(point.resetAt),
      windowId: typeof point.windowId === "string" ? point.windowId.slice(0, 80) : null
    });
  }
  valid.sort((a, b) => a.t - b.t);
  return valid.slice(-Math.max(1, limit));
}

export function normalizeThresholds(thresholds, fallback = [25, 10, 0]) {
  if (!Array.isArray(thresholds)) return [...fallback];
  return [...new Set(thresholds.map(Number).filter(value => Number.isFinite(value) && value >= 0 && value <= 100))]
    .sort((a, b) => b - a);
}

export function cycleKeyFor(window) {
  return window ? `${String(window.id || "limit").slice(0, 80)}:${window.resetAt || "unknown"}` : null;
}

export function normalizeAlertState(state, window) {
  const cycleKey = cycleKeyFor(window);
  if (!state || typeof state !== "object" || state.cycleKey !== cycleKey) {
    return { cycleKey, thresholds: {}, predictive: {}, unused: false };
  }
  return {
    cycleKey,
    thresholds: state.thresholds && typeof state.thresholds === "object" ? { ...state.thresholds } : {},
    predictive: state.predictive && typeof state.predictive === "object" ? { ...state.predictive } : {},
    unused: state.unused === true
  };
}

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "0m";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = mins / 60;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
