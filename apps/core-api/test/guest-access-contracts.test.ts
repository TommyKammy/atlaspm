import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const schemaPath = path.join(repoRoot, 'apps/core-api/prisma/schema.prisma');
const guestContractPath = path.join(
  repoRoot,
  'apps/core-api/src/guest-access/guest-access.contract.ts',
);
const guestDocPath = path.join(repoRoot, 'docs/guest-access-contract.md');

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('guest access contracts', () => {
  test('defines storage models for guest invitations and scoped guest access grants', () => {
    const schema = readFile(schemaPath);

    expect(schema).toContain('model GuestInvitation');
    expect(schema).toContain('model GuestAccessGrant');
    expect(schema).toContain('enum GuestAccessScopeType');
    expect(schema).toContain('enum GuestAccessStatus');
  });

  test('defines an explicit core-api contract for guest identity, membership scope, and invitation lifecycle', () => {
    expect(fs.existsSync(guestContractPath)).toBe(true);

    const guestContract = readFile(guestContractPath);

    expect(guestContract).toContain('export type AtlasUserIdentity');
    expect(guestContract).toContain('export type GuestAccessScope');
    expect(guestContract).toContain('export interface GuestInvitationContract');
    expect(guestContract).toContain('export function deriveGuestIdentity');
    expect(guestContract).toContain('export function evaluateGuestInvitationState');
  });

  test('documents guest scope boundaries, expiration, and revocation semantics', () => {
    expect(fs.existsSync(guestDocPath)).toBe(true);

    const guestDoc = readFile(guestDocPath);

    expect(guestDoc).toContain('guest identities map into the existing `User` record');
    expect(guestDoc).toContain('Guest invitations never create `WorkspaceMembership` rows');
    expect(guestDoc).toContain('Guests receive explicit `GuestAccessGrant` rows');
    expect(guestDoc).toContain('Expiration and revocation always prevent future acceptance');
  });
});
