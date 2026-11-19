import { AuthService } from '@ghostfolio/api/app/endpoints/auth/auth.service';
import { createAccessToken } from '@ghostfolio/api/helper/access-token.helper';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { UserService } from '@ghostfolio/api/services/user/user.service';

import { JwtService } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { recoverAdminToken } from './admin-recovery';

jest.mock(
  '@ghostfolio/api/services/configuration/configuration.service',
  () => ({
    ConfigurationService: class MockConfigurationService {}
  })
);
jest.mock('@ghostfolio/api/services/property/property.service', () => ({
  PropertyService: class MockPropertyService {}
}));
jest.mock('@ghostfolio/api/services/user/user.service', () => ({
  UserService: class MockUserService {}
}));

describe('admin recovery login compatibility', () => {
  it('accepts the replacement token and rejects the previous token', async () => {
    const salt = 'test-salt';
    const oldToken = 'old-token';
    let storedHash = createAccessToken({ password: oldToken, salt });
    const database = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: 'postgresql://test:test@localhost:5432/test'
      })
    });
    const update = jest
      .spyOn(database.user, 'updateMany')
      .mockResolvedValue({ count: 1 });

    const userService = Object.create(UserService.prototype) as UserService;
    Object.assign(userService, {
      createAccessToken,
      users: jest.fn(({ where }: { where: { accessToken: string } }) =>
        Promise.resolve(
          where.accessToken === storedHash ? [{ id: 'admin-id' }] : []
        )
      )
    });
    const configuration = Object.create(
      ConfigurationService.prototype
    ) as ConfigurationService;
    Object.assign(configuration, { get: jest.fn().mockReturnValue(salt) });
    const propertyService = Object.create(
      PropertyService.prototype
    ) as PropertyService;
    const jwt = new JwtService({ secret: 'test-secret' });
    const auth = new AuthService(
      configuration,
      jwt,
      propertyService,
      userService
    );

    expect(
      jwt.verify<{ id: string }>(await auth.validateAnonymousLogin(oldToken)).id
    ).toBe('admin-id');
    const newToken = await recoverAdminToken({
      database,
      salt,
      userId: 'admin-id'
    });
    const newHash = update.mock.calls[0][0].data.accessToken;
    if (typeof newHash !== 'string') {
      throw new Error('Expected a token hash');
    }
    storedHash = newHash;
    await expect(auth.validateAnonymousLogin(oldToken)).rejects.toThrow();
    expect(
      jwt.verify<{ id: string }>(await auth.validateAnonymousLogin(newToken)).id
    ).toBe('admin-id');
    await database.$disconnect();
  });
});
