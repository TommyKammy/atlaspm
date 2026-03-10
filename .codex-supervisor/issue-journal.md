# Issue #332: P1: Migrate web-ui auth client flow away from localStorage token handling

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/332
- Branch: codex/reopen-issue-332
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-332
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-332/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 3
- Last head SHA: 694b3b18a163249950ec367b695cab8a8eee194b
- Blocked reason: none
- Last failure signature: e2e:cancel
- Repeated failure signature count: 1
- Updated at: 2026-03-10T02:20:06.101Z

## Latest Codex Summary
- Reproduced the e2e breakage locally against fresh images and traced the cancelled CI job to repeated auth failures, not a random cancellation.
- Root causes:
  1. `core-api` CORS still used permissive defaults, which is incompatible with credentialed browser requests.
  2. Playwright specs were still scraping `atlaspm_token` from browser `localStorage`, so the new cookie-backed flow left many spec-side API helpers without a bearer token.
- Added explicit credentialed CORS configuration plus a focused unit test, and switched Playwright specs onto a shared auth fixture that captures the dev-auth response token for test-only API setup while leaving `web-ui` itself off `localStorage`.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The current CI failure is fixed by two focused compatibility repairs: credentialed CORS in `core-api` and Playwright-side token capture for spec helpers still using bearer setup calls.
- Primary failure or risk: This patch still relies on the temporary dev-session model that stores the dev JWT in the session cookie; full production session persistence and broader CSRF/origin enforcement remain follow-up work.
- Last focused command: `pnpm --filter @atlaspm/playwright exec playwright test --list`
- Files changed: `apps/core-api/src/main.ts`, `apps/core-api/src/cors-options.ts`, `apps/core-api/test/cors-options.test.ts`, `apps/core-api/.env.example`, `e2e/playwright/tests/helpers/browser-auth.ts`, and the top-level Playwright spec imports under `e2e/playwright/tests/*.spec.ts`
- Next 1-3 actions:
  1. Commit and push the CI repair for PR #336.
  2. Re-run or watch the PR e2e check on the updated branch.
  3. Recheck merge state once the fresh CI run settles.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - `gh run view 22882863385 --job 66389407743 --log` showed the e2e job repeatedly failing the same first few specs for ~2.1m each before timing out the whole 45-minute job.
  - Downloaded Playwright artifacts showed failures on the login path and confirmed the cancelled job was spending its time retrying auth-dependent specs.
  - `E2E_REBUILD=1 pnpm e2e e2e/playwright/tests/admin.spec.ts e2e/playwright/tests/custom-fields-filter.spec.ts` reproduced the fresh-image failure locally.
  - First rebuilt local result: `admin.spec.ts` failed with `Error: Missing token` after the browser-session login path succeeded, confirming stale Playwright localStorage assumptions.
- Failure signature:
  - `e2e-auth-missing-token`
- Current focused verification:
  - `gh pr checks 336`
  - `gh run view 22882863385 --json conclusion,status,event,headSha,headBranch,displayTitle,jobs,url`
  - `gh run download 22882863385 -n playwright-test-results -D /tmp/issue-332-e2e-artifacts.*`
  - `gh run view 22882863385 --job 66389407743 --log`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/cors-options.test.ts test/dev-auth-environment.test.ts`
  - `E2E_REBUILD=1 pnpm e2e e2e/playwright/tests/admin.spec.ts e2e/playwright/tests/custom-fields-filter.spec.ts`
  - `pnpm e2e e2e/playwright/tests/admin.spec.ts e2e/playwright/tests/audit-activity.spec.ts e2e/playwright/tests/custom-fields-filter.spec.ts`
  - `pnpm --filter @atlaspm/playwright exec playwright test --list`
- Implementation notes:
  - Chosen browser model: `core-api` managed opaque `HttpOnly` session cookie plus a readable CSRF cookie.
  - OIDC code exchange and refresh-token rotation stay server-side in `core-api`.
  - Bearer auth remains temporarily for non-browser clients and transition compatibility.
  - Review follow-up: production / HTTPS keeps `__Host-*` cookie names, while plain-HTTP localhost uses dev-only `atlaspm_session` / `atlaspm_csrf` names because `__Host-*` requires `Secure`.
  - `apps/core-api/src/cors-options.ts` now constrains CORS to an explicit allowlist and enables credentials, defaulting to `http://localhost:3000` unless `CORS_ALLOWED_ORIGINS` overrides it.
  - `apps/core-api/test/cors-options.test.ts` covers the allowed localhost origin and rejection of non-allowlisted origins.
  - `e2e/playwright/tests/helpers/browser-auth.ts` adds a Playwright-only init script that captures the dev-auth JSON response token into `localStorage` for spec-side API helpers; it covers both the default test context and explicit `browser.newContext()` cases.
  - All top-level Playwright specs now import `test`/`expect` from the shared auth fixture module instead of directly from `@playwright/test`.
