# AtlasPM Architecture

## Boundaries
- `web-ui` communicates with `core-api` via HTTP only.
- `core-api` owns persistence, authorization, auditing, rules, and outbox.
- `packages/*` are app-agnostic and must not depend on `apps/*`.

## Auth
- Production mode: OIDC JWT verification using issuer/audience and JWKS.
- Stable user id is JWT `sub`.
- Dev auth mode (`DEV_AUTH_ENABLED=true`) allows short-lived local test JWTs only.

## Audit + Outbox
- Every write appends:
  - `AuditEvent`: actor, entity, action, before/after, timestamp, correlationId
  - `OutboxEvent`: type, payload, createdAt, correlationId, deliveredAt
- Outbox read API is project-scoped (`GET /outbox?projectId=...`) with membership authorization to prevent cross-project data exposure.

## Observability (P0-3)
- Correlation id propagation:
  - `core-api` accepts `x-correlation-id` (or generates one), stores it on request context, and returns it in response headers.
  - `collab-server` sends `x-correlation-id` when loading/saving snapshots to `core-api`.
- Structured logs:
  - `core-api` emits request start/end logs with `method`, `path`, `statusCode`, `durationMs`, `userId`, and `correlationId`.
  - `collab-server` emits auth/presence/snapshot logs with `correlationId`, `roomId`, and `taskId`.
- Traceability target:
  - A single user action can be traced from HTTP request logs to audit/outbox entries and collab snapshot logs by `correlationId`.
- Trace runbook (example):
  1. Capture `x-correlation-id` from response headers (or provide it in request).
  2. Find matching `http.request.start` / `http.request.end` logs in `core-api`.
  3. Confirm matching `AuditEvent.correlationId` via `GET /tasks/:id/audit` (or project audit endpoint).
  4. Confirm matching `OutboxEvent.correlationId` via `GET /outbox?projectId=...`.
  5. For collaborative edits, match the same id in `collab-server` logs (`snapshot.load_*`, `snapshot.saved`) and `core-api` `task.description.snapshot_saved`.

## Rules Engine
- Triggered on task write events.
- MVP templates (enabled by default per project):
  - progress=100 => status DONE + completedAt set
  - 0<=progress<100 => status IN_PROGRESS + completedAt null
- Loop prevention via cooldown and no-op detection.
- Rule definition schema (stored as `Rule.definition` JSON):
  - `trigger`: `task.progress.changed`
  - `conditions[]`: currently `field=progressPercent` with `op` in `eq|lt|lte|gt|gte|between`
  - `actions[]`: `setStatus`, `setCompletedAtNow`, `setCompletedAtNull`
  - Server validates definition on create/patch and falls back to template defaults when missing.

## Ordering Model + Concurrency
- Manual task ordering uses sparse integer positions (`position`), default gap 1000.
- Reorder API moves task between neighbors and computes a new position.
- On collision or insufficient gap, section rebalanced atomically.
- Optimistic concurrency via task `version`; conflict returns 409 and server order snapshot.
- New task placement defaults to top of section (lowest position first).
- Temporary sort query (`dueAt`, `progressPercent`, `updatedAt`) is read-only and never rewrites manual positions.

## Web Cache Strategy
- `web-ui` uses TanStack Query for all core data reads (`projects`, `sections`, grouped `tasks`, `rules`, `members`).
- Project custom fields are cached independently with `queryKeys.projectCustomFields(projectId)`.
- Mutation policy:
  - optimistic cache update for inline task patch and within-section reorder,
  - targeted cache updates for section/task/rule create+patch,
  - targeted invalidation for affected project-scoped keys.
- No full app reload is used for create/edit flows; UI reflects writes immediately and then reconciles with server truth.
- Project filter persistence:
  - URL query params are canonical (`statuses`, `assignees`, `cf`).
  - `cf` stores normalized custom-field predicates (`SELECT` options / `BOOLEAN` value / `NUMBER` range / `DATE` range).
  - UI mirrors these values to `localStorage` as convenience cache only; it does not drive navigation state.

## Task Internals (Phase 1)
- Description storage:
  - `Task.descriptionDoc` (JSON / ProseMirror document) is the source of truth.
  - `Task.descriptionText` stores extracted plain text for future search.
  - `Task.descriptionVersion` provides optimistic concurrency for editor saves.
- Description API protocol:
  - `PATCH /tasks/:id/description` requires `{ descriptionDoc, expectedVersion }`.
  - Server returns `409` on stale version with latest description metadata.
- Comments:
  - `TaskComment` supports create/update and soft delete (`deletedAt`).
  - Endpoints: list/create on task, patch/delete by comment id.
- Audit/outbox:
  - Description updates emit `task.description.updated`.
  - Comment mutations emit `task.comment.created|updated|deleted`.

## Task Reminder Delivery Worker
- Persistence:
  - Per-user reminder settings are stored in `task_reminders`.
  - Active reminder uniqueness is enforced by a DB partial unique index on (`task_id`, `user_id`) where `deleted_at IS NULL`.
- API:
  - `GET /tasks/:id/reminder` (current user reminder)
  - `PUT /tasks/:id/reminder` (set/update)
  - `DELETE /tasks/:id/reminder` (soft clear)
- Worker behavior:
  - `core-api` runs a background reminder worker (env gated) that scans due unsent reminders and marks `sentAt`.
  - Delivery action emits:
    - audit action `task.reminder.sent` (actor: `reminder-worker`)
    - outbox type `task.reminder.sent`
  - Worker is idempotent via optimistic `sentAt IS NULL` claim update in transaction.
- Worker controls:
  - `REMINDER_WORKER_ENABLED=true|false`
  - `REMINDER_WORKER_INTERVAL_MS`
  - `REMINDER_WORKER_BATCH_SIZE`

## Task Soft-Delete Retention Worker
- Purpose:
  - Keep user self-restore window while preventing unbounded growth of soft-deleted tasks.
- Behavior:
  - Scans soft-deleted tasks (`deletedAt` set) older than `TASK_RETENTION_DAYS`.
  - Hard-deletes expired tasks in batches.
  - Emits audit/outbox before purge:
    - audit action `task.purged` (actor: `retention-worker`)
    - outbox type `task.purged`
- Worker controls:
  - `TASK_RETENTION_WORKER_ENABLED=true|false`
  - `TASK_RETENTION_WORKER_INTERVAL_MS`
  - `TASK_RETENTION_DAYS`
  - `TASK_RETENTION_BATCH_SIZE`

## Task Internals (Phase 2)
- Editor model:
  - Description authoring keeps ProseMirror JSON as the canonical representation.
  - Additional blocks supported in UI: quote, code block, divider, image, table, headings/lists/checklist.
  - Slash command menu inserts these blocks without introducing HTML storage.
- Mentions:
  - Description mentions are stored as ProseMirror `mention` nodes (`id`, `label`).
  - Comments use token syntax `@[userId|label]` in Phase 2.
  - Server normalizes mentions into `task_mentions` (`task_id`, `mentioned_user_id`, `source_type`, `source_id`).
  - Mention sync runs on description save and comment create/update/delete.
- Inbox notifications for mentions:
  - Mention create events upsert `inbox_notifications` rows (dedup key: `user_id + task_id + type + source_type + source_id`).
  - Notification center/inbox read APIs:
    - `GET /notifications`
    - `GET /notifications/unread-count`
    - `POST /notifications/:id/read`
    - `POST /notifications/read-all`
  - Notification list access is filtered by current project membership; removed members cannot read stale project notifications.
- Attachments:
  - Metadata is stored in `task_attachments`.
  - Upload flow:
    1. `POST /tasks/:id/attachments/initiate`
    2. `POST /attachments/:id/upload?token=...` (multipart)
    3. `POST /tasks/:id/attachments/complete`
  - Public signed read URL (`/public/attachments/:id/:token`) is used for inline image rendering.
  - Attachment deletion is soft delete and audited.
- Audit/outbox additions:
  - `task.mention.created`, `task.mention.deleted`
  - `task.attachment.initiated`, `task.attachment.created`, `task.attachment.deleted`
  - `notification.created`, `notification.reopened`, `notification.read`, `notification.read_all`

## Future readiness
- `packages/domain` and `packages/rule-engine` provide extraction boundaries for phase 2.
- Task model includes `startAt`/`dueAt` for future Gantt/Timeline support.

## Collaboration (Phase 3)
- New app boundary:
  - `apps/collab-server` handles Yjs websocket collaboration and presence only.
  - `web-ui` talks to `collab-server` via websocket and to `core-api` via HTTP.
  - `collab-server` talks to `core-api` via HTTP for loading/persisting snapshots.
- Authorization model:
  - `core-api` issues short-lived collab JWT per task room (`task:<taskId>:description`).
  - `collab-server` verifies token claims and room binding.
  - Roles:
    - `VIEWER` => readonly
    - `MEMBER`/`ADMIN` => readwrite
- Persistence model:
  - Canonical description state remains in `Task.descriptionDoc` / `Task.descriptionText`.
  - Snapshot writes happen on cadence (idle/interval/disconnect), not per keystroke.
  - Snapshot writes emit:
    - audit action `task.description.snapshot_saved`
    - outbox type `task.description.snapshot_saved`

## Admin User Management
- Workspace-level admin model:
  - Workspace roles: `WS_ADMIN`, `WS_MEMBER`.
  - `WS_ADMIN` can manage workspace users and invitations.
- Invitation model:
  - Invitation token is generated raw once and persisted as `tokenHash` only.
  - Acceptance requires logged-in OIDC user and strict email match with invitation email.
  - Invitation lifecycle states: pending, accepted, revoked, expired.
- User account state:
  - AtlasPM tracks internal user status (`ACTIVE` / `SUSPENDED`).
  - Suspended users are blocked at auth guard.
- Project member management:
  - `Project.ADMIN` can add/remove/change project members.
  - Added users must already be workspace members.
- Admin audit/outbox events:
  - `workspace.invite.created|accepted|revoked|reissued`
  - `workspace.user.suspended|unsuspended|display_name_updated`
  - `project.member.added|removed|role_changed`

## Webhook Delivery Reliability (P2)
- Registration:
  - Project admin registers endpoints via `POST /webhooks`.
- Delivery worker:
  - `core-api` webhook worker consumes pending outbox events and sends event envelopes to active project webhooks.
  - Worker is env-gated (`WEBHOOK_DELIVERY_WORKER_ENABLED=true`).
  - Retries use exponential backoff with capped delay.
- Dead letter queue (DLQ):
  - Events that exceed retry limit are marked `deadLetteredAt` with `lastError`.
  - Project admins can inspect by project via `GET /webhooks/dlq?projectId=...`.
  - Project admins can request redrive for a dead-lettered event via `POST /webhooks/dlq/:eventId/retry` (`{ projectId }`).
  - Redrive resets retry state (`deliveryAttempts=0`, `deadLetteredAt=null`) and emits audit/outbox event `webhook.delivery.retry_requested`.
- Signature:
  - Outbound webhook deliveries include HMAC signature headers when `WEBHOOK_SIGNING_SECRET` is configured:
    - `x-atlaspm-signature` (`v1=<sha256>`)
    - `x-atlaspm-timestamp`
  - Signature base string: `${timestamp}.${rawJsonBody}`.

## Custom Fields P3 (Sort/Search/Rules)
- Definition management:
  - field rename and archive remain at definition level (`PATCH /custom-fields/:id`, `DELETE /custom-fields/:id`).
  - `SELECT` option updates now reconcile by option `value` (stable IDs for unchanged values), archive removed options, and create new options atomically.
- Task list API extensions:
  - `GET /projects/:id/tasks` now accepts:
    - `customFieldFilters` (JSON string; supports SELECT/BOOLEAN/NUMBER/DATE predicates)
    - `customFieldSortFieldId` + `customFieldSortOrder=asc|desc`
  - default manual ordering is unchanged when no explicit sort is requested.
- Search integration:
  - `/search` fallback query includes custom field values (`value_text` plus numeric exact match).
  - Algolia index payload includes `customFieldText` for custom field terms in global search.
- Rule engine conditions:
  - rule definition now supports numeric custom field predicates:
    - `{ field: "customFieldNumber", fieldId: "<uuid>", op, value|min|max }`
  - rule evaluation reads current task custom numeric values and can drive existing actions (`setStatus`, `setCompletedAtNow`, `setCompletedAtNull`).
  - custom field updates (`PATCH /tasks/:id/custom-fields`) run through the same rule evaluation path with cooldown protection.
