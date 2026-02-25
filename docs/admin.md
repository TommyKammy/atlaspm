# Admin UX

## Roles
- Workspace roles:
  - `WS_ADMIN`: can manage workspace users and invitations.
  - `WS_MEMBER`: can use workspace/projects but cannot access admin endpoints.
- Project roles:
  - `ADMIN`: can manage project membership.
  - `MEMBER` / `VIEWER`: cannot manage project members.

## Permission Matrix (Key Management APIs)
| Area | Endpoint | WS_ADMIN | WS_MEMBER | Project ADMIN | Project MEMBER | Project VIEWER |
|---|---|---:|---:|---:|---:|---:|
| Workspace Admin | `GET /workspaces/:id/users` | ✅ | ❌ | - | - | - |
| Workspace Admin | `POST /workspaces/:id/invitations` | ✅ | ❌ | - | - | - |
| Workspace Admin | `POST /invitations/:id/reissue` | ✅ | ❌ | - | - | - |
| Workspace Admin | `PATCH /users/:id` (status change) | ✅ | ❌ | - | - | - |
| Project Admin | `POST /projects/:id/members` | - | - | ✅ | ❌ | ❌ |
| Project Admin | `PATCH /projects/:id/members/:userId` | - | - | ✅ | ❌ | ❌ |
| Project Admin | `DELETE /projects/:id/members/:userId` | - | - | ✅ | ❌ | ❌ |
| Rules | `POST /projects/:id/rules` | - | - | ✅ | ✅ | ❌ |
| Webhooks | `POST /webhooks` | - | - | ✅ | ❌ | ❌ |
| Webhooks | `GET /webhooks/dlq?projectId=...` | - | - | ✅ | ❌ | ❌ |
| Audit/Outbox | `GET /outbox?projectId=...` | - | - | ✅ | ✅ | ✅ (project member only) |

Notes:
- `GET /outbox` requires `projectId` and is project-scoped; cross-project/global outbox listing is blocked.
- `WS_MEMBER` must never be auto-promoted to `WS_ADMIN` by login/workspace bootstrap flows.

## Workspace User Management
- Page: `/admin/users` (visible in sidebar only for `WS_ADMIN`).
- Capabilities:
  - search by displayName/email
  - status filter (`ACTIVE` / `SUSPENDED` / `INVITED`)
  - invite by email + workspace role
  - edit displayName
  - suspend / unsuspend
  - reissue pending invitation (old token invalidated)
  - revoke pending invitation

## Invitation Lifecycle
1. `POST /workspaces/:id/invitations` creates invitation and returns raw invite link.
2. Token is stored only as `tokenHash` in DB (raw token is not persisted).
3. Invite can be revoked by `DELETE /invitations/:id`.
4. Invite can be reissued by `POST /invitations/:id/reissue` (old token is revoked atomically).
5. Invite is accepted by `POST /invitations/accept` with a logged-in OIDC user.

### Email Match Policy
- Invitation acceptance requires strict email match:
  - invited email (lowercased) must equal signed-in user email (lowercased).
- Mismatch is rejected with `403`.

## Project Members Management
- Page: `/projects/:id/members`.
- Capabilities (`Project ADMIN` only):
  - add workspace user to project
  - change member role (`ADMIN` / `MEMBER` / `VIEWER`)
  - remove member
- Constraint:
  - user must already be a workspace member before being added to project.

## Audit/Outbox Events
- Workspace admin operations:
  - `workspace.invite.created`
  - `workspace.invite.accepted`
  - `workspace.invite.revoked`
  - `workspace.invite.reissued`
  - `workspace.user.suspended`
  - `workspace.user.unsuspended`
  - `workspace.user.display_name_updated`
- Project membership operations:
  - `project.member.added`
  - `project.member.role_changed`
  - `project.member.removed`

## Security Notes
- OIDC identity source of truth remains `sub`; AtlasPM does not create IdP accounts.
- Invitation token storage is hash-only.
- Suspended users are blocked by auth guard.
- Admin endpoints enforce role checks server-side (not UI-only).
- Authorization boundaries are validated by integration/E2E tests for both allow and deny paths.
