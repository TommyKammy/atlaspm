import { describe, expect, it, vi } from 'vitest';
import { UserStatus } from '@prisma/client';
import { IdentityService } from '../src/common/identity.service';

describe('IdentityService.ensureUser', () => {
  it('skips Prisma update when there are no user fields to change', async () => {
    const existingUser = {
      id: 'user-1',
      email: 'existing@example.com',
      displayName: null,
      status: UserStatus.ACTIVE,
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(existingUser),
        update: vi.fn(),
      },
    };
    const service = new IdentityService(prisma as any);

    await expect(service.ensureUser('user-1')).resolves.toEqual(existingUser);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('preserves an existing email when the caller omits one', async () => {
    const existingUser = {
      id: 'user-1',
      email: 'existing@example.com',
      displayName: 'Existing User',
      status: UserStatus.ACTIVE,
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(existingUser),
        update: vi.fn().mockResolvedValue(existingUser),
      },
    };
    const service = new IdentityService(prisma as any);

    await expect(service.ensureUser('user-1')).resolves.toEqual(existingUser);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
