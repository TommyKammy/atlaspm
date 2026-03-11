import { ProjectRole } from '@prisma/client';

export type GuestAccessScope =
  | {
      type: 'workspace';
      workspaceId: string;
    }
  | {
      type: 'project';
      workspaceId: string;
      projectId: string;
      role: ProjectRole;
    };

export type AtlasUserIdentity = {
  atlasUserId: string;
  email: string | null;
  accountCategory: 'internal' | 'guest';
  source: 'oidc-sub';
  guestScopeCount: number;
};

export interface GuestInvitationContract {
  invitationId: string;
  workspaceId: string;
  email: string;
  scope: GuestAccessScope;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  acceptedByUserId: string | null;
}

export type GuestInvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

type DeriveGuestIdentityInput = {
  atlasUserId: string;
  email?: string | null;
  activeGuestGrants: number;
};

type EvaluateGuestInvitationStateInput = Pick<
  GuestInvitationContract,
  'expiresAt' | 'acceptedAt' | 'revokedAt'
>;

export function deriveGuestIdentity(input: DeriveGuestIdentityInput): AtlasUserIdentity {
  return {
    atlasUserId: input.atlasUserId,
    email: input.email?.trim().toLowerCase() || null,
    accountCategory: input.activeGuestGrants > 0 ? 'guest' : 'internal',
    source: 'oidc-sub',
    guestScopeCount: input.activeGuestGrants,
  };
}

export function evaluateGuestInvitationState(
  invitation: EvaluateGuestInvitationStateInput,
  now: Date,
): GuestInvitationState {
  if (invitation.revokedAt) return 'revoked';
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}
