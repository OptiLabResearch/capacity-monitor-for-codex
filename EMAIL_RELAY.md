# Optional email relay

The extension ships without a shared/default relay. Each user should operate or explicitly trust their own relay.

```text
Chrome extension → HTTPS Cloudflare Worker /email → Brevo transactional email
```

## Extension fields

- Relay URL: the Worker's HTTPS `/email` endpoint.
- Relay secret: a separate high-entropy `EXTENSION_SECRET`.

Never enter `BREVO_API_KEY` in the extension.

## Worker configuration

Deploy `worker-example.js` and configure Worker secrets/variables:

- Secret: `BREVO_API_KEY`
- Secret: `EXTENSION_SECRET`
- Variable: `ALERT_FROM_EMAIL`
- Variable: `ALERT_FROM_NAME` (optional)
- Variable: `ALERT_TO_EMAIL`

The example accepts only `test`, `threshold`, `capacity_reset`, `projected_exhaustion`, `high_burn`, and `unused_capacity`. The recipient is fixed in Worker configuration; request payloads cannot choose a recipient. Add platform-level rate limiting before exposing a production relay.
