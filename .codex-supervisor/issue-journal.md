# Issue #333: P1: Replace persistent attachment URL tokens with expiring signed download URLs

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/333
- Branch: codex/reopen-issue-333
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-333
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-333/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 143b0024ff001b1fd3226e3ea8633f8cf2127c42
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T02:48:22.224Z

## Latest Codex Summary
- Reproduced issue #333 with focused `core-api` integration tests, then replaced persistent attachment bearer-by-URL tokens with expiring HMAC-signed download URLs.
- Attachment list and completion responses now emit sanitized attachment DTOs with short-lived signed URLs instead of exposing `uploadToken` or `storageKey`.
- Public attachment downloads now validate signature + expiration, and restore rotates the attachment token so previously issued URLs do not survive revoke/restore cycles.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Attachment downloads should use short-lived signatures derived from a server-side secret plus the stored attachment token, while authenticated list responses must stop returning raw token fields.
- Primary failure or risk: Production-like environments now need either `ATTACHMENT_DOWNLOAD_URL_SECRET` or a safe dev-auth fallback; when neither is available the API fails closed by returning `url: null` and rejecting public downloads.
- Last focused command: `pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "project/member/sections/tasks/rules/reorder/audit/outbox flow|attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`
- Files changed: `apps/core-api/src/tasks/attachment-download-url.service.ts`, `apps/core-api/src/tasks/public-attachments.controller.ts`, `apps/core-api/src/tasks/tasks.controller.ts`, `apps/core-api/src/app.module.ts`, `apps/core-api/test/core.integration.test.ts`, and `apps/core-api/.env.example`
- Next 1-3 actions:
  1. Commit the signed attachment URL implementation checkpoint on `codex/reopen-issue-333`.
  2. Run any additional targeted `core-api` verification deemed necessary before opening/updating a PR.
  3. Push the branch or open/update the draft PR once the checkpoint is committed.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `core.integration` tests for attachment list token leakage, expiring public download URLs, and revoked download URLs.
  - First focused run surfaced the intended leak: attachment list responses still returned `uploadToken`.
  - The first public download request also failed with `500 Cannot read properties of undefined (reading 'taskAttachment')`, which traced back to `PublicAttachmentsController` lacking explicit DI on `PrismaService`.
- Failure signature:
  - `attachment-token-leak`
- Current focused verification:
  - `pnpm install`
  - `docker compose -f infra/docker/docker-compose.yml up -d postgres`
  - `pnpm --filter @atlaspm/shared-types build && pnpm --filter @atlaspm/domain build`
  - `pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`
  - `pnpm --filter @atlaspm/core-api test -- test/core.integration.test.ts -t "project/member/sections/tasks/rules/reorder/audit/outbox flow|attachment list responses do not expose persistent download tokens|attachment public download URLs expire after a short TTL|attachment public download URLs are revoked when an attachment is deleted"`
- Implementation notes:
  - Signed download URLs use HMAC-SHA256 over `attachmentId.expires.uploadToken`; the raw token stays server-side in the database and is never returned in attachment list/complete responses.
  - Default TTL is `300` seconds and can be overridden with `ATTACHMENT_DOWNLOAD_URL_TTL_SEC`.
  - Signing secret comes from `ATTACHMENT_DOWNLOAD_URL_SECRET`; in safe `development`/`test` dev-auth environments, `DEV_AUTH_SECRET` is used as the local fallback to preserve usability.
  - Public download validation now rejects missing/expired/invalid signatures and soft-deleted attachments.
  - Restoring an attachment rotates `uploadToken`, so any URL issued before delete/restore is invalidated.
