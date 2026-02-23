# Admin UX

## Roles
- Workspace roles:
  - `WS_ADMIN`: can manage workspace users and invitations.
  - `WS_MEMBER`: can use workspace/projects but cannot access admin endpoints.
- Project roles:
  - `ADMIN`: can manage project membership.
  - `MEMBER` / `VIEWER`: cannot manage project members.

## Workspace User Management
- Page: `/admin/users` (visible in sidebar only for `WS_ADMIN`).
- Capabilities:
  - search by displayName/email
  - status filter (`ACTIVE` / `SUSPENDED` / `INVITED`)
  - invite by email + workspace role
  - edit displayName
  - suspend / unsuspend
  - revoke pending invitation

## Invitation Lifecycle
1. `POST /workspaces/:id/invitations` creates invitation and returns raw invite link.
2. Token is stored only as `tokenHash` in DB (raw token is not persisted).
3. Invite can be revoked by `DELETE /invitations/:id`.
4. Invite is accepted by `POST /invitations/accept` with a logged-in OIDC user.

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
