# Guest Access Contract

## Identity Mapping
- In other words, guest identities map into the existing `User` record rather than a separate guest-only identity store.
- Guest identities map into the existing `User` record keyed by OIDC `sub`.
- AtlasPM does not create a separate guest user table or a synthetic shadow identity.
- A user becomes guest-scoped when they hold one or more active guest access grants; otherwise the same `User` record remains an internal-only identity.
- Email remains a secondary match key for invitation acceptance and audit readability, not the durable identity key.

## Scope Boundary
- Guest invitations never create `WorkspaceMembership` rows.
- Guests receive explicit `GuestAccessGrant` rows instead.
- `GuestAccessGrant` is the authorization boundary for external collaboration, separate from internal workspace/project memberships.
- Project scope is the primary collaboration target in this phase:
  - `scopeType=PROJECT` requires `projectId`.
  - `projectRole` is limited by policy to non-admin collaboration roles.
- `scopeType=WORKSPACE` is reserved for future guest policy bundles and must still not imply internal workspace membership.

## Invitation Contract
- `GuestInvitation` stores:
  - target workspace
  - optional target project
  - invited email
  - scope type
  - optional project role
  - `tokenHash` only
  - expiration, acceptance, and revocation timestamps
  - inviter and acceptor user ids
- Acceptance creates or refreshes a `GuestAccessGrant` for the accepted AtlasPM `User`.
- Acceptance must preserve auditability between the invitation row, the accepting user, and the resulting guest access grant.

## Lifecycle Semantics
- Invitation states are derived, not stored separately:
  - `pending`: not accepted, not revoked, and not expired
  - `accepted`: `acceptedAt` is set before expiration/revocation
  - `revoked`: `revokedAt` is set
  - `expired`: `expiresAt <= now` and not already accepted/revoked
- Expiration and revocation always prevent future acceptance.
- Revocation after acceptance does not delete the acceptance record; it revokes the active guest access grant or prevents grant refresh depending on rollout phase.

## Authorization Rules
- Workspace-admin flows may create, revoke, or reissue guest invitations because the workspace owns the external collaboration boundary.
- Project authorization checks must treat `GuestAccessGrant` as project-scoped access only; guests do not inherit broad workspace listing/admin capabilities.
- Audit and outbox events for guest flows should remain distinct from internal workspace member events so downstream consumers can enforce different policies.
