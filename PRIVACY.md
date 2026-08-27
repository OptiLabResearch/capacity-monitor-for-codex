# Privacy policy

Last updated: 27 August 2026

Capacity Monitor for Codex is an independent, local-first browser extension. It is not affiliated with or endorsed by OpenAI.

## Data accessed and purpose

After affirmative first-run consent, the extension accesses the authenticated ChatGPT session only to request Codex quota/rate-limit metadata from an internal, undocumented ChatGPT endpoint. Data can include one or more rolling quota windows—typically a short five-hour window and a weekly window—along with quota percentages, quota-window duration, reset timing, plan label, and reset-credit metadata. It is used only to display capacity, retain observed history, calculate observed pacing, and deliver alerts the user enables. When both rolling windows are available, the extension displays them separately; weekly data remains the basis for observed pacing and history.

The extension does not intentionally read or collect prompts, conversation text, passwords, unrelated browsing history, or ChatGPT access tokens for persistent storage. The short-lived ChatGPT access token is held in memory only for the quota request.

## Local storage and retention

The extension stores normalized quota snapshots, inferred sessions, confirmed reset events, alert history, diagnostics, consent state, and settings in `chrome.storage.local` in the current browser profile. Snapshot retention is capped at 180 days and 12,000 points; reset history is capped at 100 events and alert history at 500 events.

Users can delete history or all extension data from the dashboard. Uninstalling the extension normally removes its local extension storage. JSON backups exclude relay URLs/secrets, Telegram tokens and Chat IDs, Discord webhooks, and generic webhook URLs.

## External transmissions

Core quota requests go to OpenAI/ChatGPT. Browser notifications remain local. No developer-operated analytics, advertising, or telemetry service is included.

Optional channels are disabled by default. Enabling a channel and granting its exact-origin HTTPS permission causes minimal alert metadata to be sent to the configured party:

- Email: event type, remaining percentage, reset time, and observed burn rate when relevant go to the user's configured relay; that relay may send through Brevo.
- Telegram: alert title/message and the configured Chat ID go to Telegram's Bot API.
- Discord: alert title/message goes to the configured Discord webhook.
- Generic webhook: event type, title, message, and timestamp go to the user's configured HTTPS endpoint.

The privacy practices of OpenAI and each optional provider or self-hosted endpoint apply to data sent there. The project developer does not receive those transmissions unless the user deliberately configures an endpoint operated by that developer.

## Credentials and security

Optional integration credentials are stored in Chrome local extension storage in the browser profile. They are not independently encrypted by this project. The Brevo API key must never be entered into or stored by the extension; it belongs in Cloudflare Worker secret storage. External transmissions require HTTPS.

Diagnostics redact token-, cookie-, authorization-, secret-, password-, and webhook-like fields and retain only the response's structural shape rather than raw endpoint values. Users must still review exports before posting them publicly.

## Endpoint reliability

The Codex quota source is an internal, undocumented ChatGPT endpoint. OpenAI may change or remove it without notice. The extension fails closed when it cannot normalize a quota window and reports a safe error instead of fabricating usage.

## Limited use

Data accessed by the extension is used only to provide and secure its disclosed single purpose: monitoring Codex subscription capacity, retaining locally observed usage, and delivering user-configured alerts. It is not sold, used for advertising, or used for credit or lending decisions.

## Contact

Privacy questions can be filed in [GitHub Issues](https://github.com/OptiLabResearch/capacity-monitor-for-codex/issues) without including private data. Report security-sensitive matters through a [private GitHub Security Advisory](https://github.com/OptiLabResearch/capacity-monitor-for-codex/security/advisories/new).
