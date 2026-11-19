import { createAccessToken } from '@ghostfolio/api/helper/access-token.helper';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import {
  listRecoverableAdmins,
  recoverAdminToken,
  runAdminRecovery
} from './admin-recovery';

describe('admin recovery', () => {
  const salt = 'test-salt';
  let database: PrismaClient;

  beforeEach(() => {
    database = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://test:test@localhost:5432/test'
      })
    });
  });

  afterEach(async () => {
    await database.$disconnect();
  });

  it('updates only the selected anonymous admin with a usable token hash', async () => {
    const update = jest.spyOn(database.user, 'updateMany').mockResolvedValue({
      count: 1
    });

    const token = await recoverAdminToken({
      database,
      salt,
      userId: 'admin-id'
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'admin-id', provider: 'ANONYMOUS', role: 'ADMIN' },
      data: { accessToken: createAccessToken({ password: token, salt }) }
    });
    expect(token).not.toEqual(createAccessToken({ password: token, salt }));
  });

  it('does not return a token when the account no longer qualifies', async () => {
    jest.spyOn(database.user, 'updateMany').mockResolvedValue({ count: 0 });

    await expect(
      recoverAdminToken({ database, salt, userId: 'other-user' })
    ).rejects.toThrow('The selected user is not an anonymous admin.');
  });

  it('rejects missing configuration without updating an account', async () => {
    const update = jest.spyOn(database.user, 'updateMany');

    await expect(
      recoverAdminToken({ database, salt: '', userId: 'admin-id' })
    ).rejects.toThrow('An access token salt and admin user ID are required.');
    expect(update).not.toHaveBeenCalled();
  });

  it('only lists anonymous admin IDs and creation dates', async () => {
    const findMany = jest
      .spyOn(database.user, 'findMany')
      .mockResolvedValue([]);

    await listRecoverableAdmins(database);

    expect(findMany).toHaveBeenCalledWith({
      where: { provider: 'ANONYMOUS', role: 'ADMIN' },
      select: { createdAt: true, id: true },
      orderBy: { createdAt: 'asc' }
    });
  });

  describe('operator confirmation', () => {
    beforeEach(() => {
      jest.spyOn(database.user, 'findMany').mockResolvedValue([
        {
          accessToken: 'existing-hash',
          authChallenge: null,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          id: 'admin-id',
          provider: 'ANONYMOUS',
          role: 'ADMIN',
          thirdPartyId: null,
          updatedAt: new Date('2024-01-01T00:00:00Z')
        }
      ]);
    });

    it('does not update the token when confirmation is cancelled', async () => {
      const update = jest.spyOn(database.user, 'updateMany');
      const ask = jest
        .fn()
        .mockResolvedValueOnce('admin-id')
        .mockResolvedValueOnce('cancel');
      const write = jest.fn<void, [string]>();

      await expect(
        runAdminRecovery({ ask, database, salt, write })
      ).rejects.toThrow('Recovery cancelled; no token was changed.');
      expect(update).not.toHaveBeenCalled();
      expect(write.mock.calls.flat().join(' ')).not.toContain(
        'New security token'
      );
    });

    it('does not update an account that was not listed', async () => {
      const update = jest.spyOn(database.user, 'updateMany');

      await expect(
        runAdminRecovery({
          ask: jest.fn().mockResolvedValue('other-user'),
          database,
          salt,
          write: jest.fn()
        })
      ).rejects.toThrow('The selected user is not an anonymous admin.');
      expect(update).not.toHaveBeenCalled();
    });

    it('only displays a new token after a successful update', async () => {
      const update = jest
        .spyOn(database.user, 'updateMany')
        .mockResolvedValue({ count: 1 });
      const ask = jest.fn().mockResolvedValue('admin-id');
      const write = jest.fn<void, [string]>();

      await runAdminRecovery({ ask, database, salt, write });

      expect(update).toHaveBeenCalledTimes(1);
      const tokenMessages = write.mock.calls.filter(([message]) =>
        message.startsWith('New security token')
      );
      expect(tokenMessages).toHaveLength(1);
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        write.mock.invocationCallOrder[write.mock.calls.length - 1]
      );
    });

    it('does not display a token if the database update fails', async () => {
      jest
        .spyOn(database.user, 'updateMany')
        .mockRejectedValue(new Error('database unavailable'));
      const ask = jest.fn().mockResolvedValue('admin-id');
      const write = jest.fn<void, [string]>();

      await expect(
        runAdminRecovery({ ask, database, salt, write })
      ).rejects.toThrow('database unavailable');
      expect(write.mock.calls.flat().join(' ')).not.toContain(
        'New security token'
      );
    });
  });
});
