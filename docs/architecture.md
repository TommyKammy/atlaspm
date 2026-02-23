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

## Ordering Model + Concurrency
- Manual task ordering uses sparse integer positions (`position`), default gap 1000.
- Reorder API moves task between neighbors and computes a new position.
- On collision or insufficient gap, section rebalanced atomically.
- Optimistic concurrency via task `version`; conflict returns 409 and server order snapshot.
- New task placement defaults to top of section (lowest position first).
- Temporary sort query (`dueAt`, `progressPercent`, `updatedAt`) is read-only and never rewrites manual positions.

## Future readiness
- `packages/domain` and `packages/rule-engine` provide extraction boundaries for phase 2.
- Task model includes `startAt`/`dueAt` for future Gantt/Timeline support.
