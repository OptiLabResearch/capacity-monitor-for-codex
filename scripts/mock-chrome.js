(() => {
  const now = Date.now();
  const resetAt = Math.floor((now + 5.5 * 86400000) / 1000);
  const shortResetAt = Math.floor((now + 3 * 3600000) / 1000);
  const history = [
    { t: now - 75 * 60000, remaining: 25, used: 75, resetAt, windowId: 'weekly' },
    { t: now - 45 * 60000, remaining: 24, used: 76, resetAt, windowId: 'weekly' },
    { t: now - 15 * 60000, remaining: 22, used: 78, resetAt, windowId: 'weekly' }
  ];
  const data = {
    usage: { schemaVersion: 3, planType: 'plus', source: 'synthetic-preview', fetchedAt: now, windows: [{ id: 'short', label: '5-hour limit', kind: 'short', usedPercent: 42, remainingPercent: 58, windowSeconds: 18000, resetAt: shortResetAt }, { id: 'weekly', label: 'Weekly limit', kind: 'weekly', usedPercent: 78, remainingPercent: 22, windowSeconds: 604800, resetAt }], resetCredits: [] },
    history,
    settings: { pollMinutes: 10, toolbarMode: 'both', overlayEnabled: true, overlayCompact: true, targetRemaining: 0, paceTolerance: 3, thresholds: [25,10,0], predictiveAlert: true, burnAlert: true, unusedCapacityAlert: true, unusedCapacityThreshold: 50, unusedCapacityHours: 24, resetAlert: true, alertCooldownMinutes: 120, emailEnabled: false, discordEnabled: false, telegramEnabled: false, genericWebhookEnabled: false, privacyAcknowledged: true },
    resetEvents: [], alertHistory: [], diagnostics: { source: 'synthetic-preview', parserVersion: 4, windowsFound: 2, latencyMs: 42, responseShape: { rate_limit: { primary_window: { used_percent: 'number', reset_at: 'number' }, secondary_window: { used_percent: 'number', reset_at: 'number' } } } }, lastError: null, lastSuccessAt: now
  };
  const get = keys => {
    if (keys == null) return { ...data };
    if (typeof keys === 'string') return { [keys]: data[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, data[key]]));
    return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, data[key] ?? fallback]));
  };
  globalThis.chrome = {
    runtime: {
      id: 'synthetic-preview',
      getManifest: () => ({ version: '0.6.0' }),
      getURL: path => `/${path}`,
      sendMessage: async message => message.type === 'runSelfTest' ? { ok: true, data: { checks: [{ name: 'Synthetic preview', pass: true }] } } : message.type === 'copyDiagnostics' ? { ok: true, data: { extensionVersion: '0.6.0', source: 'synthetic-preview' } } : message.type === 'testExternal' ? { ok: false, error: 'External delivery is disabled in preview mode.' } : { ok: true, data: data.usage },
      openOptionsPage: async () => {}
    },
    storage: { local: { get: async keys => get(keys), set: async values => Object.assign(data, values), clear: async () => { for (const key of Object.keys(data)) delete data[key]; } } },
    permissions: { request: async () => false, contains: async () => false },
    tabs: { create: async () => ({}) }
  };
})();
