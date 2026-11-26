import { AccountsController } from '@ghostfolio/api/app/endpoints/accounts/accounts.controller';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { AccessService } from '@ghostfolio/api/services/access/access.service';
import { AccountBalanceService } from '@ghostfolio/api/services/account-balance/account-balance.service';
import { AccountService } from '@ghostfolio/api/services/account/account.service';
import { ApiService } from '@ghostfolio/api/services/api/api.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ImpersonationService } from '@ghostfolio/api/services/impersonation/impersonation.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { SubscriptionService } from '@ghostfolio/api/services/subscription/subscription.service';
import { UserService } from '@ghostfolio/api/services/user/user.service';
import { CreateAccountDto } from '@ghostfolio/common/dtos';
import { getPermissions, permissions } from '@ghostfolio/common/permissions';
import { UserWithSettings } from '@ghostfolio/common/types';

import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { isAllowedAdminSwitchRequest } from './admin-switch-policy';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('administrator switching', () => {
  const jwt = new JwtService({
    secret: 'test-secret',
    signOptions: { expiresIn: '180 days' }
  });
  let actor: UserWithSettings;
  let target: UserWithSettings;
  let users: UserService;
  let auth: AuthService;
  let strategy: JwtStrategy;

  beforeEach(() => {
    actor = { id: 'admin', role: 'ADMIN' } as UserWithSettings;
    target = {
      id: 'target',
      role: 'ADMIN',
      permissions: getPermissions('ADMIN'),
      settings: { settings: {} }
    } as UserWithSettings;
    users = Object.create(UserService.prototype) as UserService;
    Object.assign(users, {
      user: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(
          id === 'admin' ? actor : id === 'target' ? target : null
        )
      )
    });
    const configuration = Object.create(
      ConfigurationService.prototype
    ) as ConfigurationService;
    Object.assign(configuration, {
      get: (key: string) => (key === 'JWT_SECRET_KEY' ? 'test-secret' : false)
    });
    auth = new AuthService(
      configuration,
      jwt,
      Object.create(PropertyService.prototype) as PropertyService,
      users
    );
    strategy = new JwtStrategy(configuration, users);
  });

  it('issues a target credential bounded by the original admin token', async () => {
    const token = jwt.sign({ id: actor.id }, { expiresIn: 100 });
    const result = await auth.switchUser({
      actorId: actor.id,
      targetId: target.id,
      token
    });
    const original = jwt.verify<{ exp: number }>(token);
    const switched = jwt.verify<{
      exp: number;
      id: string;
      switchActorId: string;
    }>(result);

    expect(switched).toMatchObject({
      exp: original.exp,
      id: target.id,
      switchActorId: actor.id
    });
    await expect(
      auth.switchUser({ actorId: target.id, targetId: actor.id, token: result })
    ).rejects.toThrow();
  });

  it('rejects non-admins, deleted targets and expired credentials', async () => {
    const token = jwt.sign({ id: actor.id }, { expiresIn: 100 });
    actor.role = 'USER';
    await expect(
      auth.switchUser({ actorId: actor.id, targetId: target.id, token })
    ).rejects.toThrow();
    actor.role = 'ADMIN';
    await expect(
      auth.switchUser({ actorId: actor.id, targetId: 'missing', token })
    ).rejects.toThrow();
    const expired = jwt.sign({ id: actor.id }, { expiresIn: -1 });
    await expect(
      auth.switchUser({
        actorId: actor.id,
        targetId: target.id,
        token: expired
      })
    ).rejects.toThrow();
  });

  it('uses the target identity and removes elevated permissions', async () => {
    target.permissions.push(permissions.readMarketDataOfMarkets);
    const request = {
      headers: {},
      method: 'POST',
      originalUrl: '/api/v1/activities'
    } as Request;
    const effectiveUser = await strategy.validate(request, {
      id: target.id,
      switchActorId: actor.id
    });

    expect(effectiveUser.id).toBe(target.id);
    expect(effectiveUser.permissions).toContain(permissions.createActivity);
    expect(effectiveUser.permissions).toContain(
      permissions.readMarketDataOfMarkets
    );
    expect(effectiveUser.permissions).not.toContain(
      permissions.accessAdminControl
    );
    expect(effectiveUser.permissions).not.toContain(permissions.createAccess);
    actor.role = 'USER';
    await expect(
      strategy.validate(request, { id: target.id, switchActorId: actor.id })
    ).rejects.toThrow();
  });

  it('rejects protected routes during JWT authentication', async () => {
    const request = {
      headers: {},
      method: 'POST',
      originalUrl: '/api/v1/user/access-token'
    } as Request;

    await expect(
      strategy.validate(request, { id: target.id, switchActorId: actor.id })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('creates an account for the target, not the administrator', async () => {
    const request = {
      headers: {},
      method: 'POST',
      originalUrl: '/api/v1/accounts'
    } as Request;
    const effectiveUser = await strategy.validate(request, {
      id: target.id,
      switchActorId: actor.id
    });
    const impersonationService = new ImpersonationService(
      Object.create(AccessService.prototype) as AccessService,
      Object.create(ConfigurationService.prototype) as ConfigurationService,
      Object.create(PrismaService.prototype) as PrismaService,
      Object.create(SubscriptionService.prototype) as SubscriptionService
    );
    const context = await impersonationService.resolve({ user: effectiveUser });
    const accountService = Object.create(
      AccountService.prototype
    ) as AccountService;
    const createAccount = jest.fn().mockResolvedValue({});
    Object.assign(accountService, { createAccount });
    const controller = new AccountsController(
      Object.create(AccountBalanceService.prototype) as AccountBalanceService,
      accountService,
      Object.create(ApiService.prototype) as ApiService,
      Object.create(PortfolioService.prototype) as PortfolioService
    );

    await controller.createAccount(
      { currency: 'USD', name: 'Test' } as CreateAccountDto,
      context
    );
    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: target.id,
        data: expect.objectContaining({ user: { connect: { id: target.id } } })
      })
    );
  });

  it('preserves inactive restrictions and rejects deleted targets and delegation', async () => {
    target.role = 'INACTIVE';
    target.permissions = [];
    const request = {
      headers: {},
      method: 'GET',
      originalUrl: '/api/v1/user'
    } as Request;
    expect(
      (
        await strategy.validate(request, {
          id: target.id,
          switchActorId: actor.id
        })
      ).permissions
    ).toEqual([]);
    await expect(
      strategy.validate(request, { id: 'missing', switchActorId: actor.id })
    ).rejects.toThrow();
    request.headers['impersonation-id'] = 'another-user';
    await expect(
      strategy.validate(request, { id: target.id, switchActorId: actor.id })
    ).rejects.toThrow();
  });

  it('charges request limits and analytics to the admin, not an inactive target', async () => {
    target.role = 'INACTIVE';
    target.permissions = [];
    const isDailyRequestLimitExceeded = jest.fn().mockResolvedValue(false);
    const updateAnalytics = jest.fn().mockResolvedValue(undefined);
    Object.assign(users, { isDailyRequestLimitExceeded, updateAnalytics });
    const configuration = Object.create(
      ConfigurationService.prototype
    ) as ConfigurationService;
    Object.assign(configuration, {
      get: (key: string) => (key === 'JWT_SECRET_KEY' ? 'test-secret' : true)
    });
    const subscriptionStrategy = new JwtStrategy(configuration, users);
    const request = {
      headers: {},
      method: 'GET',
      originalUrl: '/api/v1/user'
    } as Request;

    await subscriptionStrategy.validate(request, {
      id: target.id,
      switchActorId: actor.id
    });
    expect(isDailyRequestLimitExceeded).toHaveBeenCalledWith({ user: actor });
    expect(updateAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor.id })
    );
  });

  it.each([
    ['POST', '/api/v1/auth/switch/other'],
    ['GET', '/api/v1/admin'],
    ['GET', '/api/v1/users'],
    ['DELETE', '/api/v1/user'],
    ['POST', '/api/v1/user/access-token'],
    ['GET', '/api/v1/auth/webauthn/generate-registration-options'],
    ['POST', '/api/v1/accesses'],
    ['POST', '/api/v1/api-keys'],
    ['POST', '/api/v1/platforms'],
    ['POST', '/api/v1/accounts/new-future-route'],
    ['PATCH', '/api/v1/asset-profiles/MANUAL/asset']
  ])('blocks switched %s %s', (method, path) => {
    expect(isAllowedAdminSwitchRequest(method, path)).toBe(false);
  });

  it.each([
    ['GET', '/api/v1/portfolio/holdings'],
    ['GET', '/api/v2/portfolio/performance'],
    ['POST', '/api/v1/activities'],
    ['PUT', '/api/v1/accounts/account-id'],
    ['DELETE', '/api/v1/accounts/account-id/balances/balance-id'],
    ['PUT', '/api/v1/user/setting']
  ])('allows switched %s %s', (method, path) => {
    expect(isAllowedAdminSwitchRequest(method, path)).toBe(true);
  });
});
