# Collaboration (Phase 3)

## Overview
AtlasPM collaboration for task descriptions is split across services:

- `web-ui`:
  - loads persisted task snapshot from `core-api`
  - requests short-lived collab token from `core-api`
  - connects to `collab-server` via WebSocket (Yjs)
- `collab-server`:
  - validates collab JWT
  - enforces room/mode constraints
  - syncs Yjs document and presence
  - periodically pushes snapshots to `core-api`
- `core-api`:
  - source of authorization decisions
  - source of persisted canonical snapshot (`descriptionDoc` / `descriptionText`)
  - writes audit/outbox on snapshot cadence

## Room naming
- `roomId = task:<taskId>:description`

## Token flow
1. `web-ui` calls `POST /tasks/:id/collab-token` with user auth.
2. `core-api` validates membership and returns:
   - collab WS URL
   - JWT (`exp` short-lived)
   - room id
   - mode (`readonly` for VIEWER, `readwrite` for MEMBER/ADMIN)
   - display user payload for presence
3. `web-ui` connects to `collab-server` with token.
4. `collab-server` verifies JWT signature/expiry/audience/issuer and room binding.

## Snapshot cadence
`collab-server` sends snapshots to `core-api` on:
- idle debounce: ~3s after last change
- interval: every ~30s while dirty
- disconnect: when a dirty room disconnects

Snapshot endpoint:
- `POST /tasks/:id/description/snapshot`
- protected by `x-collab-service-token`
- includes `roomId`, `descriptionDoc`, `descriptionText`, `reason`, optional participants

## Audit / outbox
`core-api` appends audit and outbox for snapshot-level events (not keystrokes):
- `task.description.snapshot_saved`
- `task.mention.created` / `task.mention.deleted` (from snapshot mention sync)

## Failure modes and fallback
- If token issuance fails or WS cannot connect, `web-ui` falls back to snapshot editor mode.
- UI shows: `Collaboration unavailable; using snapshot`.
- `collab-server` retries snapshot save (bounded backoff) and does not crash active WS sessions.

## Security notes
- Dev shortcuts are gated by env (`COLLAB_DEV_MODE=false` by default).
- Canonical source remains structured ProseMirror JSON in Postgres.
- No raw HTML source-of-truth.
