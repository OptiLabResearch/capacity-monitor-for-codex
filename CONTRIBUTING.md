# Contributing

1. Create a focused branch and keep the extension's single purpose: Codex capacity monitoring, locally observed analytics, and opt-in alerts.
2. Do not add telemetry, remote executable code, unrelated providers, or broader permissions without an explicit privacy/security review.
3. Never include real credentials, `.env`, account identifiers, or raw authenticated endpoint responses in code, fixtures, screenshots, issues, or commits.
4. Changes to parsing, pacing, resets, sessions, storage, or alerts must add deterministic synthetic tests.
5. Use the validation matrix in `TESTING.md`; `npm run verify` is the default
   pull-request gate. Use narrower checks while iterating.
6. Run `npm run verify:release` for release changes and install/test the exact
   generated ZIP from `release/<package-version>/` in a clean Chrome profile.

Use DOM construction and `textContent` for untrusted/stored values. Keep dependencies at zero unless a dependency has a clear, reviewed benefit that outweighs its supply-chain cost.
