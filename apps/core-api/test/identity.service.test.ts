import { describe, expect, it, vi } from 'vitest';
import { UserStatus } from '@prisma/client';
import { IdentityService } from '../src/common/identity.service';

describe('IdentityService.ensureUser', () => {
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

    await service.ensureUser('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: 'Existing User' },
    });
  });
});
