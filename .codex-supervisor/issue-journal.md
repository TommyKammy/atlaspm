# Issue #333: P1: Replace persistent attachment URL tokens with expiring signed download URLs

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/333
- Branch: codex/reopen-issue-333
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-333
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-333/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 082e8c61a5f5919e3e2c8f102dc4a7630129aa63
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zLonJ|PRRT_kwDORWcwRc5zLona|PRRT_kwDORWcwRc5zLonj|PRRT_kwDORWcwRc5zLonq
- Repeated failure signature count: 1
- Updated at: 2026-03-10T03:05:22.065Z

## Latest Codex Summary
Addressed the four automated review threads on PR #337. `deleteAttachment()` and `restoreAttachment()` now return the same sanitized attachment DTO as list/complete responses, deleted or incomplete attachments surface `url: null`, the TTL test now pins and restores `ATTACHMENT_DOWNLOAD_URL_TTL_SEC`, and `.env.example` uses a placeholder secret that passes validation.

Verification:
`pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "project/member/sections/tasks/rules/reorder/audit/outbox flow|attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`

Summary: Closed the review gaps around restore/delete response sanitization, null download URLs for revoked attachments, hermetic TTL testing, and valid example configuration.
State hint: addressing_review
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "project/member/sections/tasks/rules/reorder/audit/outbox flow|attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`
Failure signature: none
Next action: Commit the review-fix patch, push the branch, and resolve the PR review threads.

## Active Failure Context
- Category: review
- Summary: 4 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/337#discussion_r2909038340
- Details:
  - apps/core-api/src/tasks/tasks.controller.ts:2274 `restoreAttachment()` now rotates `uploadToken`, but the endpoint still returns the raw Prisma `taskAttachment` record. That response will include the newly rotated `uploadToken` (and `storageKey`), which undermines the goal of not exposing persistent attachment tokens to API consumers. Consider returning the same sanitized attachment DTO used elsewhere (e.g., via `serializeAttachment`) or explicitly omitting token/storage fields from this response.
  - apps/core-api/src/tasks/tasks.controller.ts:2314 `serializeAttachment()` always generates a signed `url` whenever `uploadToken` exists. For `includeDeleted=true` attachment listings (and for any non-completed attachments if this helper is reused), this will emit URLs that can never succeed (public endpoint rejects `deletedAt`/`completedAt`). Consider setting `url` to `null` when `deletedAt` is set or `completedAt` is null, so the DTO reflects actual downloadability and avoids issuing signatures for revoked attachments.
  - apps/core-api/test/core.integration.test.ts:1173 This TTL test assumes the default 300s expiry and advances time by 10 minutes. If `ATTACHMENT_DOWNLOAD_URL_TTL_SEC` is set in the environment running tests (local shell/CI), the expiry behavior may differ and make the test flaky. Consider setting `process.env.ATTACHMENT_DOWNLOAD_URL_TTL_SEC` explicitly within the test (and restoring it afterward) to keep the test hermetic.
  - apps/core-api/.env.example:11 The example value `attachment-download-secret-change-me` is in `DISALLOWED_ATTACHMENT_DOWNLOAD_SECRETS`, so the service will treat it as invalid and return `url: null` / reject public downloads. Consider changing the example to a value that passes validation (while still clearly a placeholder) or adding an inline note that this must be replaced for attachments to work.

## Codex Working Notes
### Current Handoff
- Hypothesis: Attachment downloads should use short-lived signatures derived from a server-side secret plus the stored attachment token, while authenticated list responses must stop returning raw token fields.
- Primary failure or risk: Production-like environments still need either `ATTACHMENT_DOWNLOAD_URL_SECRET` or a safe dev-auth fallback; when neither is available the API fails closed by returning `url: null` and rejecting public downloads.
- Last focused command: `pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "project/member/sections/tasks/rules/reorder/audit/outbox flow|attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`
- Files changed: `apps/core-api/src/tasks/tasks.controller.ts`, `apps/core-api/test/core.integration.test.ts`, and `apps/core-api/.env.example`
- Next 1-3 actions:
  1. Commit the review-thread fixes on `codex/reopen-issue-333`.
  2. Push the updated branch for PR #337.
  3. Resolve the automated review threads after the push.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Review feedback was valid on all four threads.
  - `deleteAttachment()` and `restoreAttachment()` were still raw-record leaks; both now serialize through the attachment DTO helper.
  - `serializeAttachment()` now suppresses signed URLs for deleted or incomplete attachments, matching public endpoint behavior.
  - TTL test now sets `ATTACHMENT_DOWNLOAD_URL_TTL_SEC='300'` inside the test and restores the previous env afterward.
  - `.env.example` placeholder secret changed to a non-disallowed long placeholder.
- Failure signature:
  - `none`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`
  - `pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "project/member/sections/tasks/rules/reorder/audit/outbox flow|attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`
- Implementation notes:
  - Signed download URLs use HMAC-SHA256 over `attachmentId.expires.uploadToken`; the raw token stays server-side in the database and is never returned in attachment list/complete responses.
  - Default TTL is `300` seconds and can be overridden with `ATTACHMENT_DOWNLOAD_URL_TTL_SEC`.
  - Signing secret comes from `ATTACHMENT_DOWNLOAD_URL_SECRET`; in safe `development`/`test` dev-auth environments, `DEV_AUTH_SECRET` is used as the local fallback to preserve usability.
  - Public download validation now rejects missing/expired/invalid signatures and soft-deleted attachments.
  - Restoring an attachment rotates `uploadToken`, so any URL issued before delete/restore is invalidated.
  - Delete/restore responses now also use the sanitized DTO, and deleted attachments explicitly expose `url: null`.
