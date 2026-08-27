import {
  parseUsage, preferredWindow, getShortWindow, getWeeklyWindow, getCurrentCycleHistory, calculatePacing,
  detectReset, detectThresholdCrossings, sanitizeDiagnostics, normalizeHistory,
  normalizeThresholds, normalizeAlertState, STORAGE_SCHEMA_VERSION, PARSER_VERSION
} from "./core.js";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const SESSION_URL = "https://chatgpt.com/api/auth/session";
const POLL_ALARM = "poll-usage";
const RESET_ALARM = "quota-reset-hint";
const HISTORY_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const HISTORY_MIN_GAP_MS = 5 * 60 * 1000;

const DEFAULT_SETTINGS = {
  pollMinutes: 10,
  toolbarMode: "both",
  overlayEnabled: true,
  overlayCompact: true,
  targetRemaining: 0,
  paceTolerance: 3,
  thresholds: [25, 10, 0],
  predictiveAlert: true,
  burnAlert: true,
  unusedCapacityAlert: true,
  unusedCapacityThreshold: 50,
  unusedCapacityHours: 24,
  resetAlert: true,
  alertCooldownMinutes: 120,
  discordEnabled: false,
  discordWebhook: "",
  telegramEnabled: false,
  telegramBotToken: "",
  telegramChatId: "",
  emailEnabled: false,
  emailRelayUrl: "",
  emailRelaySecret: "",
  genericWebhookEnabled: false,
  genericWebhook: "",
  subscriptionMonthlyCost: "",
  subscriptionCurrency: "USD",
  privacyAcknowledged: false,
  storageSchemaVersion: STORAGE_SCHEMA_VERSION
};

chrome.runtime.onInstalled.addListener(async details => {
  await migrateSettings(details);
  await configurePolling();
  const settings = await getSettings();
  if (details.reason === "install" && !settings.privacyAcknowledged) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    return;
  }
  if (settings.privacyAcknowledged) await safeRefresh();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureSettings();
  await configurePolling();
  const settings = await getSettings();
  if (settings.privacyAcknowledged) await safeRefresh();
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === POLL_ALARM || alarm.name === RESET_ALARM) {
    const settings = await getSettings();
    if (settings.privacyAcknowledged) await safeRefresh();
  }
});
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.settings) await configurePolling();
});
chrome.notifications.onClicked.addListener(() => chrome.runtime.openOptionsPage?.());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (sender.id !== chrome.runtime.id) throw new Error("Untrusted message sender");
    if (!message || typeof message !== "object" || typeof message.type !== "string") throw new Error("Invalid message");
    if (message?.type === "refresh") return { ok: true, data: await safeRefresh() };
    if (message?.type === "testExternal" && ["email", "discord", "telegram", "webhook"].includes(message.channel)) return { ok: true, result: await testExternal(message.channel) };
    if (message?.type === "openDashboard") { await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }); return { ok: true }; }
    if (message?.type === "copyDiagnostics") return { ok: true, data: await buildDiagnostics() };
    if (message?.type === "runSelfTest") return { ok: true, data: await runRuntimeSelfTest() };
    if (message?.type === "acknowledgePrivacy") { const s=await getSettings(); await chrome.storage.local.set({settings:{...s,privacyAcknowledged:true}}); await configurePolling(); await safeRefresh().catch(()=>{}); return {ok:true}; }
    return { ok: false, error: "Unknown message" };
  };
  run().then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

async function ensureSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const normalized = sanitizeSettings(settings);
  if (JSON.stringify(settings || {}) !== JSON.stringify(normalized)) await chrome.storage.local.set({ settings: normalized });
}
async function migrateSettings(details={}) {
  const stored = await chrome.storage.local.get(["settings","usage","history"]);
  const existing = stored.settings || {};
  // Existing users have already been using the extension. Preserve their setup and avoid forcing onboarding on update.
  const legacyUsed = !!stored.usage || (Array.isArray(stored.history) && stored.history.length > 0) || Object.keys(existing).length > 0;
  const migrated = sanitizeSettings(existing);
  if (details.reason === "update" && legacyUsed && existing.privacyAcknowledged == null) migrated.privacyAcknowledged = true;
  migrated.storageSchemaVersion = STORAGE_SCHEMA_VERSION;
  await chrome.storage.local.set({ settings: migrated, history: normalizeHistory(stored.history) });
}
async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return sanitizeSettings(settings);
}
function sanitizeSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (Object.hasOwn(input, key)) settings[key] = input[key];
  settings.pollMinutes = Math.max(5, Math.min(60, Number(settings.pollMinutes) || 10));
  if (settings.toolbarMode === "remaining") settings.toolbarMode = "both";
  if (!["both", "weekly", "short", "used", "pace"].includes(settings.toolbarMode)) settings.toolbarMode = "both";
  settings.targetRemaining = Math.max(0, Math.min(100, Number(settings.targetRemaining) || 0));
  settings.paceTolerance = Math.max(0, Math.min(100, Number(settings.paceTolerance) || 3));
  settings.alertCooldownMinutes = Math.max(30, Math.min(10080, Number(settings.alertCooldownMinutes) || 120));
  settings.unusedCapacityThreshold = Math.max(0, Math.min(100, Number(settings.unusedCapacityThreshold) || 50));
  settings.unusedCapacityHours = Math.max(1, Math.min(168, Number(settings.unusedCapacityHours) || 24));
  settings.thresholds = normalizeThresholds(settings.thresholds);
  for (const key of ["emailRelayUrl", "emailRelaySecret", "discordWebhook", "telegramBotToken", "telegramChatId", "genericWebhook", "subscriptionMonthlyCost"]) {
    settings[key] = typeof settings[key] === "string" ? settings[key].slice(0, 4096) : "";
  }
  settings.storageSchemaVersion = STORAGE_SCHEMA_VERSION;
  return settings;
}
async function configurePolling() {
  const settings = await getSettings();
  const existing = await chrome.alarms.get(POLL_ALARM);
  if (!settings.privacyAcknowledged) {
    if (existing) await chrome.alarms.clear(POLL_ALARM);
    return;
  }
  if (existing?.periodInMinutes === settings.pollMinutes) return;
  if (existing) await chrome.alarms.clear(POLL_ALARM);
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: settings.pollMinutes });
}

async function getAccessToken() {
  const res = await fetch(SESSION_URL, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`ChatGPT session request failed (${res.status})`);
  const session = await res.json();
  const token = session?.accessToken || session?.access_token || session?.user?.accessToken;
  if (!token) throw new Error("No ChatGPT access token found. Open chatgpt.com and sign in.");
  return token;
}
async function fetchUsageDirect() {
  const token = await getAccessToken();
  const res = await fetch(USAGE_URL, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store"
  });
  if (!res.ok) throw new Error(`Codex usage request failed (${res.status})`);
  return res.json();
}
async function fetchUsageViaChatGPTTab() {
  const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*"] });
  if (!tabs.length) throw new Error("Open a ChatGPT tab once so usage can refresh.");
  const tab = tabs.find(t => t.active) || tabs[0];
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: "MAIN",
    func: async () => {
      const s = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
      if (!s.ok) throw new Error(`Session ${s.status}`);
      const session = await s.json();
      const token = session?.accessToken || session?.access_token || session?.user?.accessToken;
      if (!token) throw new Error("No access token in ChatGPT session.");
      const u = await fetch("/backend-api/wham/usage", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store"
      });
      if (!u.ok) throw new Error(`Usage ${u.status}`);
      return u.json();
    }
  });
  if (!results?.[0]?.result) throw new Error("ChatGPT tab did not return usage data.");
  return results[0].result;
}

async function refreshUsage() {
  const started = Date.now();
  let raw, source = "direct", directError = null;
  try { raw = await fetchUsageDirect(); }
  catch (err) { directError = err.message; source = "chatgpt-tab"; raw = await fetchUsageViaChatGPTTab(); }

  const parsed = parseUsage(raw, Date.now());
  parsed.source = source;
  await persistUsage(parsed, { source, directError, latencyMs: Date.now() - started, responseShape: describeShape(raw) });
  return parsed;
}

async function persistUsage(parsed, requestInfo) {
  const stored = await chrome.storage.local.get(["usage", "history", "alertState", "resetEvents", "alertHistory"]);
  const old = stored.usage || null;
  const history = normalizeHistory(stored.history);
  const resetEvents = Array.isArray(stored.resetEvents) ? stored.resetEvents.filter(event => event && typeof event === "object").slice(-100) : [];
  const alertHistory = Array.isArray(stored.alertHistory) ? stored.alertHistory.filter(event => event && typeof event === "object").slice(-500) : [];
  const alertState = stored.alertState && typeof stored.alertState === "object" ? stored.alertState : {};

  const nextHistory = updateHistory(history, parsed);
  const historyChanged = nextHistory.length !== history.length || nextHistory.at(-1)?.t !== history.at(-1)?.t;
  const resetResult = await handleReset(old, parsed, resetEvents, alertState, alertHistory);
  const alertResult = await handleAlerts(old, parsed, nextHistory, resetResult.alertState, resetResult.alertHistory);
  await scheduleResetHint(parsed);
  await updateBadge(parsed, nextHistory);

  await chrome.storage.local.set({
    usage: parsed,
    ...(historyChanged ? { history: nextHistory } : {}),
    resetEvents: resetResult.resetEvents,
    alertState: alertResult.alertState,
    alertHistory: alertResult.alertHistory.slice(-500),
    lastError: null,
    lastSuccessAt: Date.now(),
    diagnostics: {
      lastSuccessAt: Date.now(), source: requestInfo.source, latencyMs: requestInfo.latencyMs,
      directError: requestInfo.directError, parserVersion: PARSER_VERSION,
      windowsFound: parsed.windows.length, responseShape: requestInfo.responseShape
    }
  });
}

function updateHistory(history, parsed) {
  const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
  const kept = normalizeHistory(history).filter(p => p.t >= cutoff);
  const w = preferredWindow(parsed);
  if (!w || !Number.isFinite(w.remainingPercent)) return kept;
  const last = kept[kept.length - 1];
  const point = { t: Date.now(), remaining: w.remainingPercent, used: w.usedPercent, resetAt: w.resetAt, windowId: w.id };
  const changed = !last || Math.abs(last.remaining - point.remaining) >= 0.05 || last.resetAt !== point.resetAt;
  const aged = !last || point.t - last.t >= HISTORY_MIN_GAP_MS;
  if (changed || aged) kept.push(point);
  return kept.slice(-12000);
}

function quotaName(window) {
  return window?.label?.replace(/\s+limit$/i, "") || "quota";
}

async function handleReset(oldUsage, newUsage, resetEvents, alertState, alertHistory) {
  const oldW = preferredWindow(oldUsage), newW = preferredWindow(newUsage);
  const result = detectReset(oldW, newW);
  if (!result) return { resetEvents, alertState, alertHistory };

  const event = {
    t: Date.now(), type: "confirmed-reset", oldRemaining: result.oldRemaining,
    newRemaining: result.newRemaining, gained: result.gain,
    oldResetAt: oldW?.resetAt || null, newResetAt: newW?.resetAt || null
  };
  resetEvents = [...resetEvents, event].slice(-100);
  alertState = { cycleKey: `${newW.id}:${newW.resetAt}`, thresholds: {}, predictive: {}, unused: false };

  const settings = await getSettings();
  if (settings.resetAlert) {
    const dispatched = await dispatchAlert("Codex capacity is back", `${quotaName(newW)} capacity increased from ${Math.round(result.oldRemaining)}% to ${Math.round(result.newRemaining)}%.`, "reset");
    alertHistory.push(dispatched);
  }
  return { resetEvents, alertState, alertHistory };
}

async function handleAlerts(oldUsage, newUsage, history, alertState, alertHistory) {
  const settings = await getSettings();
  const newW = preferredWindow(newUsage), oldW = preferredWindow(oldUsage);
  if (!newW) return { alertState, alertHistory };
  // A moved reset timestamp alone is not a confirmed cycle rollover, so retain
  // per-cycle deduplication until replenishment is actually observed.
  if (typeof alertState?.cycleKey !== "string") {
    alertState = normalizeAlertState(null, newW);
  } else {
    alertState = {
      cycleKey: alertState.cycleKey,
      thresholds: alertState.thresholds && typeof alertState.thresholds === "object" ? { ...alertState.thresholds } : {},
      predictive: alertState.predictive && typeof alertState.predictive === "object" ? { ...alertState.predictive } : {},
      unused: alertState.unused === true
    };
  }

  const thresholds = normalizeThresholds(settings.thresholds);
  for (const t of detectThresholdCrossings(oldW?.remainingPercent, newW.remainingPercent, thresholds)) {
    if (alertState.thresholds?.[t]) continue;
    const item = await dispatchAlert(`Codex quota: ${t}% threshold`, `${Math.round(newW.remainingPercent)}% remains in your ${quotaName(newW)} Codex quota.`, "threshold");
    alertHistory.push(item); alertState.thresholds[t] = Date.now();
  }

  const cycleHistory = getCurrentCycleHistory(history, newUsage);
  const pacing = calculatePacing(newW, cycleHistory, { targetRemaining: settings.targetRemaining, tolerance: settings.paceTolerance });
  const cooldown = Math.max(30, Number(settings.alertCooldownMinutes) || 120) * 60000;
  const canFire = key => !alertState.predictive?.[key] || Date.now() - alertState.predictive[key] >= cooldown;

  if (settings.predictiveAlert && pacing?.shortfallMs > 0 && canFire("shortfall")) {
    const item = await dispatchAlert("Codex quota may run out early", `At the current pace, quota is projected to run out before the ${quotaName(newW)} reset.`, "predictive");
    alertHistory.push(item); alertState.predictive.shortfall = Date.now();
  }
  if (settings.burnAlert && pacing?.burn && pacing.safePerDay > 0 && pacing.burn.perDay > pacing.safePerDay * 1.35 && canFire("burn")) {
    const item = await dispatchAlert("Codex burn rate is high", `Current pace is ${pacing.burn.perDay.toFixed(1)}%/day vs ${pacing.safePerDay.toFixed(1)}%/day sustainable.`, "burn");
    alertHistory.push(item); alertState.predictive.burn = Date.now();
  }
  if (settings.unusedCapacityAlert && pacing?.cycle?.remainingMs <= Number(settings.unusedCapacityHours) * 3600000 && newW.remainingPercent >= Number(settings.unusedCapacityThreshold) && !alertState.unused) {
    const item = await dispatchAlert("Codex capacity may go unused", `${Math.round(newW.remainingPercent)}% remains with less than ${settings.unusedCapacityHours}h until reset.`, "unused");
    alertHistory.push(item); alertState.unused = true;
  }

  return { alertState, alertHistory };
}

async function scheduleResetHint(parsed) {
  const w = preferredWindow(parsed);
  const existing = await chrome.alarms.get(RESET_ALARM);
  const when = w?.resetAt && w.resetAt * 1000 > Date.now() ? w.resetAt * 1000 + 5000 : null;
  if (when && Math.abs((existing?.scheduledTime || 0) - when) <= 1000) return;
  if (existing) await chrome.alarms.clear(RESET_ALARM);
  if (when) await chrome.alarms.create(RESET_ALARM, { when });
}

function badgeColor(value) {
  if (value <= 0) return "#7f1d1d";
  if (value <= 10) return "#b91c1c";
  if (value <= 25) return "#b45309";
  if (value <= 50) return "#a16207";
  return "#15803d";
}
function hasRemaining(window) {
  return Number.isFinite(window?.remainingPercent);
}
function badgeWindowText(window, label) {
  if (!hasRemaining(window)) return null;
  const reset = window.resetAt ? " · reset " + new Date(window.resetAt * 1000).toLocaleString() : "";
  return label + ": " + Math.round(window.remainingPercent) + "% remaining" + reset;
}
function displayWindowForMode(mode, shortWindow, weeklyWindow, fallback) {
  if (mode === "short") return shortWindow || weeklyWindow || fallback;
  if (mode === "weekly") return weeklyWindow || shortWindow || fallback;
  return weeklyWindow || shortWindow || fallback;
}
function badgeTextForMode(mode, shortWindow, weeklyWindow, fallback, pacing) { if (mode === "both") { const values = [shortWindow, weeklyWindow].filter(hasRemaining).map(window => String(Math.round(window.remainingPercent))); if (values.length) return values.join("/"); } const display = displayWindowForMode(mode, shortWindow, weeklyWindow, fallback); if (mode === "pace") { if (!pacing?.burn) return "…"; return pacing.status === "too-fast" ? "FAST" : pacing.status === "underusing" ? "LOW" : "OK"; } if (mode === "used") return Number.isFinite(display?.usedPercent) ? String(Math.round(display.usedPercent)) : "?"; return Number.isFinite(display?.remainingPercent) ? String(Math.round(display.remainingPercent)) : "?"; }
async function updateBadge(parsed, history) {
  const settings = await getSettings();
  const shortWindow = getShortWindow(parsed);
  const weeklyWindow = getWeeklyWindow(parsed);
  const w = preferredWindow(parsed);
  if (!w || !Number.isFinite(w.remainingPercent)) {
    await chrome.action.setBadgeText({ text: "?" });
    await chrome.action.setTitle({ title: "Codex — quota unavailable" });
    return;
  }
  const pacing = calculatePacing(w, getCurrentCycleHistory(history, parsed), { targetRemaining: settings.targetRemaining, tolerance: settings.paceTolerance });
  const display = displayWindowForMode(settings.toolbarMode, shortWindow, weeklyWindow, w);
  const text = badgeTextForMode(settings.toolbarMode, shortWindow, weeklyWindow, w, pacing);
  await chrome.action.setBadgeText({ text });
  const colorValues = [shortWindow, weeklyWindow].filter(hasRemaining).map(window => window.remainingPercent);
  const colorValue = settings.toolbarMode === "both" && colorValues.length ? Math.min(...colorValues) : display.remainingPercent;
  await chrome.action.setBadgeBackgroundColor({ color: badgeColor(colorValue) });
  try { await chrome.action.setBadgeTextColor?.({ color: "#ffffff" }); } catch {}
  const summary = [
    badgeWindowText(shortWindow, "5-hour"),
    badgeWindowText(weeklyWindow, "Weekly")
  ].filter(Boolean);
  await chrome.action.setTitle({ title: "Codex — " + (summary.length ? summary.join(" · ") : badgeWindowText(w, quotaName(w)) || "quota unavailable") });
  await setDynamicIcon(shortWindow?.remainingPercent, weeklyWindow?.remainingPercent, w.remainingPercent);
}
async function setDynamicIcon(shortRemaining, weeklyRemaining, fallbackRemaining) {
  try {
    const size = 32, canvas = new OffscreenCanvas(size, size), ctx = canvas.getContext("2d");
    const normalize = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : null;
    const short = normalize(shortRemaining), weekly = normalize(weeklyRemaining);
    if (short != null && weekly != null) {
      const drawGauge = (value, y, label) => {
        ctx.fillStyle = "#374151";
        ctx.fillRect(1, y, 30, 10);
        ctx.fillStyle = badgeColor(value);
        ctx.fillRect(1, y, 30 * value / 100, 10);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 6px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, 3, y + 7);
        ctx.textAlign = "right";
        ctx.fillText(String(Math.round(value)), 30, y + 7);
      };
      drawGauge(short, 2, "5h");
      drawGauge(weekly, 18, "W");
    } else {
      const remaining = weekly ?? short ?? normalize(fallbackRemaining);
      ctx.clearRect(0,0,size,size); ctx.lineWidth=4; ctx.strokeStyle="#6b7280"; ctx.beginPath(); ctx.arc(16,16,11,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle=badgeColor(remaining); ctx.lineCap="round"; ctx.beginPath(); ctx.arc(16,16,11,-Math.PI/2,-Math.PI/2+Math.PI*2*(remaining/100)); ctx.stroke();
      ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(16,16,3,0,Math.PI*2); ctx.fill();
    }
    await chrome.action.setIcon({ imageData: ctx.getImageData(0,0,size,size) });
  } catch {}
}

async function dispatchAlert(title, message, type) {
  const settings = await getSettings();
  const item = { t: Date.now(), title, message, type, channels: [] };
  await chrome.notifications.create(`${type}-${Date.now()}`, { type:"basic", iconUrl:"icons/icon128.png", title, message, priority:2 });
  item.channels.push("browser");
  const text = `${title}\n${message}`;

  if (settings.emailEnabled && settings.emailRelayUrl && settings.emailRelaySecret) {
    try {
      await sendEmailRelay(settings, type);
      item.channels.push("email");
    } catch (e) {
      item.emailError = e.message;
    }
  }

  if (settings.discordEnabled && settings.discordWebhook) {
    try { await sendDiscord(settings.discordWebhook, text); item.channels.push("discord"); }
    catch(e){ item.discordError=e.message; }
  }
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
    try { await sendTelegram(settings.telegramBotToken, settings.telegramChatId, text); item.channels.push("telegram"); }
    catch(e){ item.telegramError=e.message; }
  }
  if (settings.genericWebhookEnabled && settings.genericWebhook) {
    try {
      await sendGenericWebhook(settings.genericWebhook, { event:type, title, message, timestamp:new Date().toISOString() });
      item.channels.push("webhook");
    } catch(e){ item.webhookError=e.message; }
  }
  return item;
}

function emailEventName(type) {
  const map = {
    reset: "capacity_reset",
    threshold: "threshold",
    predictive: "projected_exhaustion",
    burn: "high_burn",
    unused: "unused_capacity",
    test: "test"
  };
  return map[type] || null;
}

async function requireHostPermission(urlText) {
  const u = parseExternalUrl(urlText);
  const origin = `${u.protocol}//${u.host}/*`;
  const allowed = await chrome.permissions.contains({ origins:[origin] });
  if (!allowed) throw new Error("Host permission not granted. Re-save/test this integration from the extension UI.");
}
async function sendEmailRelay(settings, type = "test") {
  const event = emailEventName(type);
  if (!event) throw new Error(`Email does not support alert type: ${type}`);

  const url = String(settings.emailRelayUrl || "").trim();
  parseExternalUrl(url);
  if (!settings.emailRelaySecret) throw new Error("Email relay secret is missing");
  await requireHostPermission(url);

  const data = await chrome.storage.local.get(["usage", "history"]);
  const w = preferredWindow(data.usage);
  const cycleHistory = getCurrentCycleHistory(data.history || [], data.usage);
  const pacing = w ? calculatePacing(w, cycleHistory, {
    targetRemaining: settings.targetRemaining,
    tolerance: settings.paceTolerance
  }) : null;

  const payload = { event };
  if (Number.isFinite(w?.remainingPercent)) payload.remaining = w.remainingPercent;
  if (w?.resetAt) payload.resetAt = new Date(w.resetAt * 1000).toISOString();
  if (type === "burn" && Number.isFinite(pacing?.burn?.perDay)) payload.burnRate = pacing.burn.perDay;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.emailRelaySecret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  let response = null;
  try { response = await r.json(); } catch {}

  if (!r.ok || response?.ok === false) throw new Error(`Email relay rejected the request (${r.status})`);
  return response;
}
async function sendDiscord(url, content) {
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) throw new Error("Invalid Discord webhook URL");
  await requireHostPermission(url);
  const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({content:content.slice(0,1900)}) });
  if (!r.ok) throw new Error(`Discord ${r.status}`);
}
async function sendTelegram(token, chatId, text) {
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(String(token || ""))) throw new Error("Invalid Telegram bot token format");
  if (!/^-?\d+$/.test(String(chatId || ""))) throw new Error("Telegram Chat ID must be numeric");
  await requireHostPermission("https://api.telegram.org/");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({chat_id:chatId,text:text.slice(0,4000)}) });
  if (!r.ok) throw new Error(`Telegram ${r.status}`);
}
async function sendGenericWebhook(url, payload) {
  const u = parseExternalUrl(url);
  const originPattern = `${u.protocol}//${u.host}/*`;
  const allowed = await chrome.permissions.contains({ origins:[originPattern] });
  if (!allowed) throw new Error("Webhook host permission not granted. Save it from the dashboard first.");
  const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  if (!r.ok) throw new Error(`Webhook ${r.status}`);
}
function parseExternalUrl(urlText) {
  let url;
  try { url = new URL(String(urlText || "").trim()); }
  catch { throw new Error("Enter a valid HTTPS URL"); }
  if (url.protocol !== "https:") throw new Error("External integrations require HTTPS");
  if (url.username || url.password) throw new Error("URLs containing embedded credentials are not supported");
  return url;
}
async function testExternal(channel) {
  const s = await getSettings();
  const text = "Codex Capacity test\nAlert delivery is configured correctly.";
  if (channel === "email") { await sendEmailRelay(s, "test"); return "Test email sent."; }
  if (channel === "discord") { await sendDiscord(s.discordWebhook, text); return "Discord test sent."; }
  if (channel === "telegram") { await sendTelegram(s.telegramBotToken, s.telegramChatId, text); return "Telegram test sent."; }
  if (channel === "webhook") { await sendGenericWebhook(s.genericWebhook, {event:"test",message:text,timestamp:new Date().toISOString()}); return "Webhook test sent."; }
  throw new Error("Unknown channel");
}

async function buildDiagnostics() {
  const data = await chrome.storage.local.get(["usage","diagnostics","history","resetEvents","alertHistory","settings","lastError","lastSuccessAt"]);
  return sanitizeDiagnostics({
    extensionVersion: chrome.runtime.getManifest().version,
    timestamp: new Date().toISOString(),
    usage: data.usage,
    diagnostics: data.diagnostics,
    historyPoints: data.history?.length || 0,
    resetEvents: data.resetEvents?.length || 0,
    alertEvents: data.alertHistory?.length || 0,
    lastError: data.lastError || null,
    lastSuccessAt: data.lastSuccessAt || null,
    settings: data.settings
  });
}
function describeShape(value, depth = 0) {
  if (depth > 4) return "…";
  if (Array.isArray(value)) return value.length ? [describeShape(value[0], depth + 1)] : [];
  if (!value || typeof value !== "object") return typeof value;
  const shape = {};
  for (const key of Object.keys(value).slice(0, 80)) shape[key] = describeShape(value[key], depth + 1);
  return shape;
}
async function runRuntimeSelfTest() {
  const result = { at: Date.now(), checks: [] };
  const add = (name, pass, detail="") => result.checks.push({name,pass,detail});
  const { usage, history } = await chrome.storage.local.get(["usage","history"]);
  const w = preferredWindow(usage);
  add("Usage object available", !!usage);
  add("Weekly quota recognized", w?.id === "weekly", w?.id || "none");
  add("Remaining percentage valid", Number.isFinite(w?.remainingPercent), String(w?.remainingPercent));
  add("Reset timestamp valid", Number.isFinite(w?.resetAt), String(w?.resetAt));
  add("History storage available", Array.isArray(history), `${history?.length || 0} points`);
  result.pass = result.checks.every(c => c.pass);
  return result;
}
async function safeRefresh() {
  const settings = await getSettings();
  if (!settings.privacyAcknowledged) throw new Error("Review the first-run privacy disclosure before refreshing quota data.");
  try { return await refreshUsage(); }
  catch (err) { await chrome.storage.local.set({ lastError:String(err?.message || "Refresh failed").slice(0, 500), lastAttemptAt:Date.now() }); throw err; }
}
