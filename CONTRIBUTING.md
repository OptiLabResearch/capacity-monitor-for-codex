# Contributing

1. Create a focused branch and keep the extension's single purpose: Codex capacity monitoring, locally observed analytics, and opt-in alerts.
2. Do not add telemetry, remote executable code, unrelated providers, or broader permissions without an explicit privacy/security review.
3. Never include real credentials, `.env`, account identifiers, or raw authenticated endpoint responses in code, fixtures, screenshots, issues, or commits.
4. Changes to parsing, pacing, resets, sessions, storage, or alerts must add deterministic synthetic tests.
5. Run `npm run check`, `npm test`, and `npm run package` before opening a pull request.
6. Install and test the exact generated ZIP in a clean Chrome profile for release changes.

Use DOM construction and `textContent` for untrusted/stored values. Keep dependencies at zero unless a dependency has a clear, reviewed benefit that outweighs its supply-chain cost.
