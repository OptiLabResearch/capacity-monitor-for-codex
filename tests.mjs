import assert from 'node:assert/strict';
import {
  parseUsage, preferredWindow, inferCycle, calculatePacing, calculateObservedBurn,
  detectReset, detectThresholdCrossings, inferSessions, aggregateCycles,
  normalizeHistory, normalizeAlertState, sanitizeDiagnostics
} from './core.js';

const now = Date.UTC(2026, 7, 11, 20, 0, 0);
const hour = 60 * 60 * 1000;
const week = 7 * 24 * hour;
const tests = [];
const test = (name, run) => tests.push({ name, run });
const weekly = (remaining = 22, resetAt = Math.floor((now + 6 * 24 * hour) / 1000)) =>
  preferredWindow(parseUsage({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 100 - remaining, reset_at: resetAt } } }, now));

test('1. single weekly quota response', () => {
  const usage = parseUsage({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 78, reset_at: Math.floor((now + 6 * 24 * hour) / 1000) } } }, now);
  assert.equal(preferredWindow(usage).id, 'weekly');
  assert.equal(preferredWindow(usage).remainingPercent, 22);
  assert.equal(usage.planType, 'plus');
});

test('2. snake_case endpoint response', () => {
  const usage = parseUsage({ rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 604800, reset_after_seconds: 3600 } } }, now);
  assert.equal(preferredWindow(usage).kind, 'weekly');
  assert.equal(preferredWindow(usage).remainingPercent, 88);
});

test('3. camelCase nested Codex response', () => {
  const usage = parseUsage({ planType: 'plus', codex: { rateLimit: { primaryWindow: { remainingPercent: 81, windowDurationMins: 10080, resetsAt: (now + week) / 1000 } } } }, now);
  assert.equal(preferredWindow(usage).remainingPercent, 81);
  assert.equal(preferredWindow(usage).id, 'weekly');
});

test('4. missing secondary window', () => {
  assert.equal(parseUsage({ rate_limit: { primary_window: { used_percent: 30, reset_at: (now + week) / 1000 } } }, now).windows.length, 1);
});

test('5. malformed response fails closed', () => {
  assert.deepEqual(parseUsage({ rate_limit: 'unexpected' }, now).windows, []);
  assert.deepEqual(parseUsage(null, now).windows, []);
});

test('6. missing reset timestamp disables cycle projections', () => {
  const window = preferredWindow(parseUsage({ rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 604800 } } }, now));
  assert.equal(inferCycle(window, now), null);
  assert.equal(calculatePacing(window, [], {}, now).cycle, null);
});

test('7. 100 percent remaining is clamped', () => assert.equal(weekly(100).remainingPercent, 100));
test('8. 0 percent remaining is clamped', () => assert.equal(weekly(0).remainingPercent, 0));

test('9. capacity reset requires replenishment', () => {
  assert.ok(detectReset({ remainingPercent: 4, resetAt: 100 }, { remainingPercent: 100, resetAt: 200 })?.confirmed);
});

test('10. reset timestamp movement alone is not replenishment', () => {
  assert.equal(detectReset({ remainingPercent: 4, resetAt: 100 }, { remainingPercent: 4, resetAt: 200 }), null);
});

test('11. threshold crossing emits each crossed threshold once', () => {
  assert.deepEqual(detectThresholdCrossings(26, 9, [25, 10, 0]), [25, 10]);
});

test('12. repeated threshold poll emits nothing', () => {
  assert.deepEqual(detectThresholdCrossings(9, 9, [25, 10, 0]), []);
});

test('13. alert state survives extension restart', () => {
  const window = weekly(9);
  const saved = normalizeAlertState(null, window);
  saved.thresholds[10] = now;
  const restored = normalizeAlertState(JSON.parse(JSON.stringify(saved)), window);
  assert.equal(restored.thresholds[10], now);
});

test('14. observed burn stays learning with insufficient history', () => {
  assert.equal(calculateObservedBurn([{ t: now, remaining: 50 }, { t: now + 10 * 60_000, remaining: 49 }]), null);
});

test('15. observed burn uses closely spaced real observations', () => {
  const burn = calculateObservedBurn([{ t: now, remaining: 50 }, { t: now + 15 * 60_000, remaining: 49 }, { t: now + 30 * 60_000, remaining: 48 }]);
  assert.equal(burn.burned, 2);
  assert.equal(burn.segments, 2);
  assert.ok(burn.perDay > 0 && burn.perDay <= 100);
});

test('16. quota increases within a cycle are not negative burn', () => {
  const burn = calculateObservedBurn([{ t: now, remaining: 50 }, { t: now + 10 * 60_000, remaining: 55 }, { t: now + 30 * 60_000, remaining: 53 }]);
  assert.equal(burn.burned, 2);
});

test('17. long sampling gaps are unknown, not burn intervals', () => {
  assert.equal(calculateObservedBurn([{ t: now, remaining: 50 }, { t: now + 4 * hour, remaining: 40 }]), null);
});

test('18. session inference splits around long gaps', () => {
  const sessions = inferSessions([{ t: now, remaining: 50 }, { t: now + 10 * 60_000, remaining: 48 }, { t: now + 2 * hour, remaining: 46 }, { t: now + 2 * hour + 10 * 60_000, remaining: 45 }]);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].burned, 2);
  assert.equal(sessions[1].burned, 1);
});

test('19. cycle rollover groups observed history by reset identity', () => {
  const cycles = aggregateCycles([{ t: now, remaining: 20, resetAt: 100, windowId: 'weekly' }, { t: now + hour, remaining: 10, resetAt: 100, windowId: 'weekly' }, { t: now + 2 * hour, remaining: 100, resetAt: 200, windowId: 'weekly' }], [{ t: now + 2 * hour, oldResetAt: 100 }]);
  assert.equal(cycles.length, 2);
});

test('20. corrupted local storage history is normalized safely', () => {
  const clean = normalizeHistory([null, 'bad', { t: 'x', remaining: 5 }, { t: now, remaining: -9 }, { t: now + 1, remaining: 150, used: 'bad', windowId: 7 }]);
  assert.deepEqual(clean.map(point => point.remaining), [0, 100]);
  assert.equal(clean[1].windowId, null);
});

test('21. pacing does not fabricate predictions before observed burn', () => {
  const pacing = calculatePacing(weekly(22), [], {}, now);
  assert.equal(pacing.status, 'learning');
  assert.equal(pacing.exhaustionAt, null);
  assert.equal(pacing.predictedRemainingAtReset, null);
  assert.ok(pacing.safePerDay >= 0 && pacing.safePerDay <= 100);
});

test('22. diagnostics redact sensitive keys and embedded credentials', () => {
  const syntheticWebhook = ['https://discord.com/api/webhooks','123','secret'].join('/');
  const safe = sanitizeDiagnostics({ telegramBotToken: 'secret', note: 'Authorization: Bearer abc.def', error: syntheticWebhook });
  assert.equal(safe.telegramBotToken, '[redacted]');
  assert.ok(!JSON.stringify(safe).includes('abc.def'));
  assert.ok(!JSON.stringify(safe).includes('/123/secret'));
});

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed++; }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
console.log(`${passed} deterministic core tests passed`);
