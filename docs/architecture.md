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
- Mutation policy:
  - optimistic cache update for inline task patch and within-section reorder,
  - targeted cache updates for section/task/rule create+patch,
  - targeted invalidation for affected project-scoped keys.
- No full app reload is used for create/edit flows; UI reflects writes immediately and then reconciles with server truth.

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
