# AGENTS.md — Capacity Monitor for Codex

## Purpose

Capacity Monitor for Codex is an independent, local-first Chrome MV3 extension
that observes Codex subscription capacity, stores quota history locally,
estimates pacing from real observations, and sends optional alerts.

It is not an official OpenAI product and does not bypass, reset, extend, or
circumvent usage limits. The quota source is an undocumented ChatGPT endpoint;
unknown schemas must fail closed and surface safe diagnostics.

## Architecture boundaries

- `manifest.json` defines the MV3 service worker, popup, dashboard, onboarding
  and privacy pages, and the ChatGPT content-script overlay.
- `background.js` owns authentication, quota fetching, polling, local storage,
  alerts, integrations, and diagnostics.
- `core.js` owns quota normalization, pacing, reset detection, history, session
  inference, and diagnostics sanitization. Keep these calculations observation-
  based; never invent burn or projection data.
- `popup.js` is the quick status surface. `dashboard.js` owns history, planner,
  settings, integrations, exports, and diagnostics.
- `worker-example.js` is an optional user-operated Cloudflare/Brevo relay
  example and is not included in the extension package.
- `scripts/preview.mjs` is a local synthetic UI preview. `scripts/package.mjs`
  creates the deterministic ZIP in `release/<package-version>/` from `release-files.json`.

## Sources of truth

- Product, setup, current status, and architecture summary: `README.md`
- Development and validation: `TESTING.md` and `CONTRIBUTING.md`
- Privacy and security: `PRIVACY.md` and `SECURITY.md`
- Email relay operation: `EMAIL_RELAY.md` and `worker-example.js`
- Release history and current release gate: `CHANGELOG.md` and
  `RELEASE_CHECKLIST.md`
- Chrome Web Store copy and disclosure: `STORE_LISTING.md`
- Runtime behavior and permissions: `manifest.json` and the source code
- Agent workflow measurement only: `docs/AGENT_EFFICIENCY.md`; do not read it for normal product tasks.

## Commands

```sh
npm run check          # project JavaScript syntax only
npm test               # deterministic tests and static QA
npm run verify         # aggregate default PR validation
npm run verify:release # aggregate release gate and package hash repeat
npm run preview        # local synthetic UI preview at http://127.0.0.1:4173
npm run package        # package only
```

`npm run verify` is the default PR gate. Use the task matrix in `TESTING.md` to
choose a narrower check while iterating. Use `npm run verify:release` before
publishing; it repeats packaging and compares SHA-256. Packaging and preview
are separate commands; packaging does not start the preview server.

## Project constraints

- Keep quota history in `chrome.storage.local`; there is no developer telemetry
  or backend service. Any agent-efficiency measurement stays opt-in, external,
  redacted, and outside the extension runtime.
- Keep ChatGPT access tokens in memory only. Never commit, print, or paste
  credentials, `.env` values, raw authenticated responses, or private relay
  data.
- Keep MV3 permissions, host access, and CSP minimal. Optional alert delivery
  must remain explicitly configured by the user and HTTPS-only.
- Preserve storage schema, alert deduplication, diagnostics redaction, and the
  `release-files.json` package boundary. Generated ZIPs belong in the ignored,
  version-scoped `release/<package-version>/` directory.
