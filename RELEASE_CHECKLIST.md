# Public beta release checklist

## Automated

- [ ] `npm run verify:release` (syntax, tests, QA, packaging twice, identical SHA-256)
- [ ] ZIP entries in `release/<package-version>/` exactly match `release-files.json` (checked by the release gate)
- [ ] `.env` ignored and untracked
- [ ] Working tree, staged diff, Git history, and ZIP scanned for credentials
- [ ] GitHub Actions uses read-only contents permission

## Manual Chrome

- [ ] Exact ZIP installs in a clean stable-Chrome profile
- [ ] First-run consent blocks quota access until accepted
- [ ] Signed-in direct/fallback refresh and signed-out recovery tested
- [ ] Light/dark, keyboard, focus, 100%/200% scaling, 375px-equivalent dashboard width, popup overflow, and reduced motion tested
- [ ] Denied/granted optional permissions and disposable integration tests completed
- [ ] Diagnostics manually reviewed for secrets
- [ ] Real reset behavior verified when the next reset occurs

## Store

- [ ] Stable public privacy-policy, support, and homepage URLs configured
- [ ] Privacy-practices disclosure and limited-use certification match code/listing/policy
- [ ] Sanitized popup/dashboard screenshots prepared
- [ ] Single-purpose and non-affiliation language retained
- [ ] Same tested ZIP uploaded; do not rebuild between clean-profile QA and upload
