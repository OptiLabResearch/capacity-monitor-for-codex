# Changelog

## 0.6.0-beta.0 - 2026-08-12

- Established the repository root as the canonical source and added a deterministic allowlisted release ZIP.
- Removed unnecessary `tabs` and `clipboardWrite` permissions; added an explicit restrictive extension-page CSP.
- Reworked quota normalization for snake_case, camelCase, nested Codex, single-window, missing-window, and malformed responses.
- Made burn rate strictly observation-based, excluded long gaps and quota gains, and clamped projections.
- Hardened reset confirmation, alert state persistence, history normalization, schema migration, messaging, URL validation, diagnostics, backup import/export, and the example email Worker.
- Removed dynamic HTML insertion of stored/remote data.
- Improved popup width, action hierarchy, responsive dashboard tables, keyboard help, clamped tooltip positioning, focus states, dark/light controls, and reduced-motion behavior.
- Expanded deterministic correctness tests and static release/security checks.
- Reconciled README, privacy, security, testing, relay, and store documentation with actual behavior.

## 0.5.1 - Prior local beta

- Added first-run disclosure, integration setup help, accessible setting help, and public-release documentation drafts.
