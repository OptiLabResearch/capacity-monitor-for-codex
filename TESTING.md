# Testing

## Automated validation

For a normal code or pull-request change, run the aggregate gate:

```sh
npm run verify
```

For release work, run the stricter gate. It repeats packaging and compares the
two SHA-256 values:

```sh
npm run verify:release
```

Targeted commands remain available when iterating:

- `npm run check` checks project JavaScript syntax.
- `npm test` runs deterministic core tests and static public-release QA.
- `npm run package` creates and verifies one allowlisted ZIP in
  `release/<package-version>/`.

`tests.mjs` contains deterministic synthetic cases for single weekly, snake_case, camelCase/nested Codex, missing secondary, malformed response, missing reset, 100%/0%, confirmed replenishment, timestamp-only movement, threshold crossing/repeat/restart, insufficient/valid observed burn, quota gain, long sampling gap, session inference, cycle rollover, corrupt storage, non-fabricated pacing, and diagnostics redaction.

`qa.mjs` validates MV3 permissions/CSP, release allowlist, icon dimensions/alpha declaration, no remote or inline executable code, no unsafe HTML sinks, HTML/JS ID wiring, common secret signatures, Worker relay restrictions, disclosure files, and package/version consistency.

`npm run package` verifies ZIP central-directory entries and writes a SHA-256 companion. `npm run verify:release` runs it twice and confirms that unchanged source produces the same hash.

## Validation matrix

Choose the smallest check that covers the files changed. Run `npm run verify`
when the change crosses more than one row.

| Change scope | Minimum validation |
| --- | --- |
| Documentation only | `git diff --check` |
| Runtime JavaScript, parsing, storage, or alerts | `npm run check` and `npm test` |
| HTML or CSS | `npm run check`, `npm test`, and `npm run preview`; complete relevant manual UI checks |
| `manifest.json`, `package.json`, scripts, or `release-files.json` | `npm run verify` |
| Release or store submission | `npm run verify:release` and the manual clean-profile/release checks below |

## Local UI preview

Run `npm run preview` and open `http://127.0.0.1:4173/` for a synthetic
dashboard preview. Use `?theme=light` for the light-theme override. The preview
injects `scripts/mock-chrome.js`, uses synthetic quota/history data, and does not
contact ChatGPT or deliver external alerts.

The default port is `4173`. If it is occupied, choose another port:

```sh
CODEX_CAPACITY_PREVIEW_PORT=4174 npm run preview
# PowerShell: $env:CODEX_CAPACITY_PREVIEW_PORT=4174; npm run preview
```

## Manual clean-profile test

Use Windows 11 and current stable Chrome. Install the exact ZIP from `release/<package-version>/` after extracting it to a new folder.

1. Confirm the install prompt is limited to ChatGPT access and notifications-related functionality.
2. Before consent, verify no quota request or polling alarm runs.
3. Review first-run disclosure, open the privacy page, consent, and refresh while signed in.
4. Compare remaining percentage and reset timestamp with OpenAI's usage page.
5. Test direct refresh with no ChatGPT tab, fallback with an open ChatGPT tab, signed-out failure, then recovery.
6. Run Dashboard → Diagnostics → Self-test and review copied diagnostics for secrets/account details.
7. Verify popup and dashboard in light/dark mode, 100% and 200% scaling, keyboard-only navigation, visible focus, tooltip focus/Escape behavior, dropdown options, long errors, scrolling, and no horizontal page overflow.
8. Verify popup width has no empty right strip and bottom actions have consistent alignment.
9. Enable/disable the on-page meter and confirm it reads no page content.
10. Deny then grant each optional integration permission. Test only with disposable test endpoints/credentials.
11. Restart Chrome and confirm threshold deduplication/settings/history survive service-worker suspension.
12. Export/import a backup, corrupt a synthetic backup, and confirm invalid data fails safely.

## Observation test

Over at least 30–60 minutes, create multiple real quota changes:

- Fresh data must say `Learning…`; no expected-empty or at-reset projection should appear.
- Closely spaced drops should produce observed burn and sessions.
- A gap longer than 90 minutes must not contribute to burn/heatmap; a session gap longer than 45 minutes must split sessions.
- Quota increases must not become negative burn.

## Real reset test

This cannot be simulated completely. Across the next real reset, record old remaining/reset time and verify:

- A moved timestamp without replenishment does not alert or reset deduplication.
- Material replenishment creates one confirmed reset event and one enabled capacity-back alert.
- A new history cycle begins; old threshold state does not spam.

## Provider-change test

If refresh stops working, copy public-safe diagnostics. `responseShape` should expose keys/types without raw values. Update parsing only from sanitized synthetic fixtures—never commit an authenticated response.
