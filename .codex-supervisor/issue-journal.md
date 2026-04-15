# Issue #384: P4: Add regression coverage for guest access and invitation lifecycle

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/384
- Branch: codex/reopen-issue-384
- Workspace: <redacted-local-path>
- Journal: <redacted-local-path>
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 3f0dd1fad770877fea51ee37ed8788bd2899d42b
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-11T14:01:41.701Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### 2026-03-11 Codex Guest Access Regression Coverage
- Hypothesis:
  - The remaining gap for issue #384 was missing regression coverage rather than missing backend behavior; the narrowest missing cases were expired guest invitations and browser-level guest invite/restrict/revoke flows.
- Focused reproduction:
  - Added a focused Playwright spec first and ran `CI= pnpm e2e tests/guest-access.spec.ts`.
  - Initial browser failure after route load:
    - `getByTestId('project-guest-invite-open')` never appeared on `/projects/:id/members`
  - Failure analysis:
    - Playwright snapshot showed the running Docker `web-ui` image was serving an older members page without the guest access section.
- Implementation:
  - Extended `apps/core-api/test/guest-access-management.integration.test.ts` with an expiration regression proving expired guest invitations remain `expired` and do not auto-accept on matching login.
  - Added `e2e/playwright/tests/guest-access.spec.ts` covering:
    - guest invitation from the project members page
    - accepted guest state after matching-email login
    - project scope restriction across reloads
    - revocation removing guest visibility/access after reload
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-management.integration.test.ts test/guest-access.integration.test.ts`
  - `CI= pnpm e2e tests/guest-access.spec.ts` -> failed because Docker served a stale `web-ui` image missing the guest section
  - `CI= E2E_REBUILD=1 pnpm e2e tests/guest-access.spec.ts`
  - `git diff --check`
- Current outcome:
  - Guest invitation expiration is now covered at the integration level.
  - Guest invite, scoped visibility, reload persistence, and revocation are now covered by a focused Playwright scenario.
  - The browser harness for this area currently requires `E2E_REBUILD=1` after UI changes so Docker does not reuse an older app image.
- Failure signature:
  - `stale-e2e-web-ui-image-missing-guest-section`
- Next actions:
  - Commit the coverage additions.

### Current Handoff
- Older scratchpad entries were compacted by codex-supervisor to keep resume context small.

  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `git diff --check`
- Current outcome:
  - `core-api` now has a shared runtime service backing provider auth and sync lifecycle instead of only schema/contracts.
  - Duplicate in-flight sync execution for the same provider scope is skipped from persisted state.
  - Successful syncs now persist `lastSyncedAt`, and failures persist sanitized error details.
- Failure signature:
  - `missing-integration-runtime-service`
- Next actions:
  - Extend the runtime with first-class credential storage/rotation helpers if the next slice needs managed token persistence instead of external secret references only.

### 2026-03-11 Codex Review Fixes for PR #376
- Hypothesis:
  - All three configured-bot review threads on `IntegrationRuntimeService` were valid behavioral issues, not false positives.
- Review items addressed:
  - `apps/core-api/src/integrations/integration-runtime.service.ts`
    - Replaced the non-atomic `findUnique()` duplicate-run check with an atomic claim flow: ensure the sync-state row exists, then `updateMany()` it to `RUNNING` only when the existing row is not actively running or is stale.
    - Changed queued sync handling so provider results with `status: 'queued'` remain persisted as `RUNNING`, preserving in-flight protection for async jobs.
    - Stopped clearing `lastSyncedAt` for non-completed sync results; only completed syncs now update the last-success timestamp.
    - Stopped rethrowing raw provider exceptions after sanitizing persistence/log output; the runtime now throws a sanitized error carrying the original error only as `cause`.
- Tests added/updated:
  - Expanded `apps/core-api/test/integration-runtime.service.test.ts` to cover:
    - atomic duplicate-run skipping via claim failure
    - queued syncs remaining `RUNNING` without clearing prior success data
    - sanitized rethrow behavior for provider errors containing secret/token material
- Verification:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/integration-runtime.service.test.ts test/integration-provider.registry.test.ts test/integration-contracts.test.ts test/slack-webhook-signature.test.ts`
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `git diff --check`
- Current outcome:
  - The runtime no longer leaks raw provider exception text into the global error logger path.
  - Async queued syncs keep their in-flight lock semantics and do not erase the last successful sync timestamp.
  - Sync claim logic is now concurrency-safe at the row-update level instead of depending on a racy read-before-write check.
- Failure signature:
  - `PRRT_kwDORWcwRc5zeC_6|PRRT_kwDORWcwRc5zeDAF|PRRT_kwDORWcwRc5zeDAK`
- Next actions:
  - Commit, push, and resolve the three configured-bot review threads on PR #376.

### 2026-03-11 Codex Guest Invitation UI Flow
- Hypothesis:
  - `web-ui` had no guest/external-collaborator management surface because the current branch also lacked the minimal public guest-management endpoints the page would need.
- Focused reproduction:
  - Added `apps/core-api/test/guest-access-management.integration.test.ts`.
  - First focused run: `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-management.integration.test.ts`
  - Initial environment failures:
    - `Command "vitest" not found` before `pnpm install`
    - missing Prisma client before `pnpm --filter @atlaspm/core-api prisma:generate`
    - unresolved workspace package entry for `@atlaspm/domain` before `pnpm --filter @atlaspm/domain build`
  - Product-level repro after setup:
    - `POST /projects/:id/guest-invitations` returned `404 Not Found`
- Implementation:
  - Added `apps/core-api/src/guest-access/guest-access.controller.ts`.
  - Implemented:
    - `GET /projects/:id/guest-access`
    - `POST /projects/:id/guest-invitations`
    - `DELETE /guest-invitations/:id`
  - Extended `apps/core-api/src/auth/auth.guard.ts` to auto-accept pending guest invitations on login by matching email and creating/updating the corresponding `guest_access_grants` row.
  - Registered `GuestAccessController` in `apps/core-api/src/app.module.ts`.
  - Added guest-access types/query keys and wired `apps/web-ui/src/app/projects/[id]/members/page.tsx` with:
    - guest invitation dialog
    - live guest access table
    - revoke controls
    - invite-link display/copy
  - Added guest UI copy to `apps/web-ui/src/lib/i18n.tsx`.
- Verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-management.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/guest-access-management.integration.test.ts test/guest-access.integration.test.ts`
  - `pnpm --filter @atlaspm/core-api lint`
  - `pnpm --filter @atlaspm/core-api type-check`
  - `pnpm --filter @atlaspm/web-ui lint`
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `git diff --check`
- Current outcome:
  - Project admins can invite and revoke project-scoped guests through a public API and see pending/accepted/revoked/expired state.
  - Invited collaborators auto-accept on login with the matching email, so accepted guest state appears without manual database setup.
  - The project members page now includes a dedicated guest access section that updates via query invalidation without a full refresh.
- Failure signature:
  - `missing-project-guest-access-routes`
- Next actions:
  - Commit this checkpoint and, if a broader UX pass is needed, add explicit guest-accept entry-point polish around invite-link landing/sign-in messaging.
