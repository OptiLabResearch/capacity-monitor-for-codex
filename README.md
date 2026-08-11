# Capacity Monitor for Codex

Capacity Monitor for Codex is an independent, local-first Chrome extension that monitors Codex subscription capacity, stores observed quota history, estimates pacing from real observations, and sends optional low-capacity or reset alerts.

This is not an official OpenAI product and is not affiliated with or endorsed by OpenAI. It does not bypass, reset, extend, or circumvent usage limits.

> Public beta: `0.6.0-beta.0`. The quota source is an undocumented ChatGPT web endpoint. OpenAI may change or remove it without notice.

[Report an issue](https://github.com/OptiLabResearch/capacity-monitor-for-codex/issues) · [Privacy policy](https://github.com/OptiLabResearch/capacity-monitor-for-codex/blob/main/PRIVACY.md) · [Security reporting](https://github.com/OptiLabResearch/capacity-monitor-for-codex/security/advisories/new)

## Features

- Current Codex quota remaining/used, reset time, countdown, plan label, toolbar badge, and manual refresh.
- Up to 180 days of locally observed snapshots, current-cycle chart, 7-day activity heatmap, cycle history, and inferred sessions.
- A safe daily budget calculated from remaining quota and time until reset.
- Observed burn rate and projections only after closely spaced real quota changes have been measured for at least 20 minutes.
- Browser alerts for thresholds, confirmed replenishment, projected exhaustion, high observed burn, and unused capacity near reset.
- Opt-in Email, Telegram, Discord, and generic HTTPS webhook delivery.
- Safe diagnostics containing normalized quota data and response structure—not session credentials or raw response values.

The popup is the quick status surface; **Open dashboard** provides history, sessions, planner, alert configuration, diagnostics, data export, and privacy controls.

## Screenshots

Release screenshots are intentionally generated from a sanitized test profile and kept out of the installable ZIP. See [`store-assets/README.md`](store-assets/README.md) for the required capture list. The included `store-assets/icon-preview-1024.png` is a branding preview, not a product screenshot.

## How quota data works

The extension requests:

- `https://chatgpt.com/api/auth/session` to obtain a short-lived access token in memory.
- `https://chatgpt.com/backend-api/wham/usage` to obtain Codex quota metadata.

The access token is used only for that request and is never stored. A direct extension request is attempted first. If browser cookie behavior prevents it, the extension can run the same two requests in the main world of an open ChatGPT tab. It does not read the page DOM, prompts, or conversation text.

The parser identifies windows from returned duration/reset metadata rather than assuming that the first window is five-hour and the second is weekly. A single long-horizon window may be identified as weekly when duration metadata is absent. Unknown schemas fail closed and surface diagnostics.

## Analytics are observed, not invented

Fresh installs show `Observed burn: Learning…`. Burn rate, expected exhaustion, and remaining-at-reset do not appear until real quota drops have been observed across suitable samples. Long gaps are unknown time and are excluded. Quota increases are not treated as negative usage. Percentage results are clamped to defensible ranges.

`Safe budget = usable remaining quota / actual time until reset`; it is valid without historical observations.

## Privacy and optional integrations

Quota snapshots, inferred sessions, alert history, and settings stay in `chrome.storage.local` in the current browser profile. No analytics or advertising SDK is included. Remote integrations are off by default and require an explicit HTTPS host-permission prompt.

- Email: your extension → your Cloudflare Worker `/email` endpoint → Brevo. The extension stores the relay URL and `EXTENSION_SECRET`; `BREVO_API_KEY` stays in Worker secrets.
- Telegram: sends alert text to the Bot API using the bot token and numeric Chat ID you provide.
- Discord: sends alert text to the webhook URL you provide.
- Generic webhook: sends a minimal JSON event to an HTTPS endpoint you provide.

Integration credentials are stored in Chrome local extension storage and are not independently encrypted by this project. Anyone with access to the browser profile may be able to access them. Sensitive integration fields are excluded from backup exports and public diagnostics.

Read [`PRIVACY.md`](PRIVACY.md) before publishing or installing.

## Install unpacked

1. Use a permanent checkout of this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the repository root (the folder containing `manifest.json`).
5. Review the first-run disclosure and opt in.
6. Be signed into `https://chatgpt.com`, then refresh the extension.

The Chrome Web Store link will be added after review; it is not published yet.

## Development and release

Node.js 20 or newer is required. There are no runtime or build dependencies.

```sh
npm run check
npm test
npm run package
```

The repository root is the one canonical source tree. `npm run package` creates a deterministic, store-safe ZIP in ignored `release/` using the allowlist in `release-files.json`. Documentation, tests, Worker examples, `.env`, and store assets are excluded. Repeated packaging of unchanged source produces the same SHA-256.

## Permissions

- `storage`: local settings, snapshots, migrations, deduplication, and alert history.
- `alarms`: MV3-safe background polling and a post-reset refresh hint.
- `notifications`: local alert delivery.
- `scripting`: fallback quota request in an open ChatGPT tab when direct session access fails.
- Required `https://chatgpt.com/*`: the single core data source and optional on-page meter.
- Optional `https://*/*`: requested at runtime for the exact user-configured HTTPS integration origin. The broad declaration is necessary because self-hosted relay/webhook domains are not known at build time.

## Troubleshooting

- `No ChatGPT access token`: sign in at ChatGPT and retry.
- `Open a ChatGPT tab`: direct cookie access failed; open one ChatGPT tab so the fallback can run.
- `No quota window returned`: the undocumented endpoint or schema may have changed. Open **Dashboard → Diagnostics**, copy the redacted diagnostics, and file an issue without adding credentials or raw authenticated responses.
- Integration permission error: enable the channel again or use its test button and accept the exact-origin host prompt.

See [`TESTING.md`](TESTING.md), [`SECURITY.md`](SECURITY.md), and [`EMAIL_RELAY.md`](EMAIL_RELAY.md).
