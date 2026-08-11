# Security policy

## Supported version

Security fixes target the latest public beta. This project depends on an undocumented third-party endpoint, so a provider schema change is not itself a security vulnerability unless it causes unsafe behavior or disclosure.

## Reporting

Use a private GitHub Security Advisory after the repository is published. Do not post access tokens, cookies, raw authenticated responses, relay URLs, email addresses, Telegram bot tokens/Chat IDs, Discord webhooks, generic webhook URLs, API keys, or `.env` contents in a public issue.

If a real credential was committed, revoke or rotate it immediately even if Git history is later rewritten.

## Security boundaries

- ChatGPT access tokens are used in memory and never intentionally persisted.
- The extension package contains no remotely hosted executable code and uses an explicit MV3 CSP.
- External alert channels are disabled by default, require HTTPS, and request optional host access at runtime.
- Integration credentials are stored in the Chrome profile's local extension storage and are not independently encrypted by this project.
- Diagnostics redact sensitive fields; response diagnostics retain structural types rather than raw endpoint values.
- The example email Worker accepts only predefined events and a fixed recipient configured in Worker environment variables.

This extension only observes available quota metadata. It does not bypass or increase provider limits.
