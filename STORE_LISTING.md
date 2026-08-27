# Chrome Web Store listing draft

## Name

Capacity Monitor for Codex

## Short description

Monitor Codex capacity, observed local history, reset timing, pacing, and opt-in alerts.

## Single purpose

Monitor Codex subscription capacity and notify the user about remaining-capacity thresholds, observed pacing, and confirmed replenishment.

## Detailed description

Capacity Monitor for Codex displays separate five-hour and weekly quota percentages and reset timing when both rolling windows are available, while supporting accounts that expose only one window. It stores observed quota snapshots locally to provide history, inferred sessions, and pacing. Browser alerts are local. Email, Telegram, Discord, and generic webhook delivery are optional, off by default, and configured by the user.

The extension does not bypass, reset, extend, or circumvent Codex usage limits. It is an independent project and is not affiliated with or endorsed by OpenAI.

Quota reporting relies on an internal, undocumented ChatGPT endpoint because no public subscription-quota API is available. OpenAI changes may temporarily break reporting.

## Prominent data disclosure

To provide its single purpose, the extension accesses the authenticated ChatGPT session and Codex quota/rate-limit metadata (percentage, reset timing, one or more rolling windows such as five-hour and weekly, and plan/reset-credit metadata when available). It does not intentionally read prompts or conversation text. The short-lived access token is not stored. Quota history and settings are retained in Chrome local extension storage.

Optional external alerts transmit minimal alert data only after the user enables a channel and grants its HTTPS host permission. Parties can include the user's relay/Brevo, Telegram, Discord, or the user's configured webhook operator. No developer analytics or advertising service receives data.

Install-time consent and the in-product first-run disclosure must remain consistent with this listing and `PRIVACY.md`.

## Permission justifications

- `storage`: local snapshots, settings, migrations, and alert deduplication.
- `alarms`: periodic MV3 refresh and reset-time refresh hint.
- `notifications`: local alerts.
- `scripting`: fallback quota request in an open ChatGPT tab; no DOM or conversation content is read.
- `https://chatgpt.com/*`: required quota source and on-page capacity meter.
- Optional `https://*/*`: exact runtime origins are requested only for user-configured HTTPS relays/webhooks whose domains cannot be known at build time.

## Publication URLs

- Support URL: `https://github.com/OptiLabResearch/capacity-monitor-for-codex/issues`
- Homepage URL: `https://github.com/OptiLabResearch/capacity-monitor-for-codex`
- Privacy policy URL: `https://github.com/OptiLabResearch/capacity-monitor-for-codex/blob/main/PRIVACY.md`

## Still required

- Store screenshots: sanitized light and dark popup/dashboard captures.

Complete the Developer Dashboard privacy-practices disclosure and limited-use certification to match this document exactly.
