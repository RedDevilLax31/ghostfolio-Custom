import { AdminService } from '@ghostfolio/api/app/admin/admin.service';
import { isAllowedAdminSwitchRequest } from '@ghostfolio/api/app/endpoints/auth/admin-switch-policy';
import { ALLOW_DURING_IMPERSONATION_KEY } from '@ghostfolio/api/decorators/allow-during-impersonation.decorator';
import { HAS_PERMISSION_KEY } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { ImpersonationWriteGuard } from '@ghostfolio/api/guards/impersonation-write.guard';
import { UserService } from '@ghostfolio/api/services/user/user.service';
import { HEADER_KEY_IMPERSONATION } from '@ghostfolio/common/config';
import { getPermissions, permissions } from '@ghostfolio/common/permissions';
import type { UserWithSettings } from '@ghostfolio/common/types';

import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { UpdateUserAliasDto } from './update-user-alias.dto';
import { UsersController } from './users.controller';

describe('user aliases', () => {
  it('trims aliases, permits clearing and enforces the 25-character boundary', () => {
    const alias = plainToInstance(UpdateUserAliasDto, {
      alias: `  ${'😀'.repeat(25)}  `
    });

    expect(validateSync(alias)).toHaveLength(0);
    expect(alias.alias).toBe('😀'.repeat(25));
    expect(
      validateSync(
        plainToInstance(UpdateUserAliasDto, { alias: ' '.repeat(3) })
      )
    ).toHaveLength(0);
    expect(
      plainToInstance(UpdateUserAliasDto, { alias: ' '.repeat(3) }).alias
    ).toBe('');

    for (const invalid of ['😀'.repeat(26), null, 123, 'bad\0alias']) {
      expect(
        validateSync(plainToInstance(UpdateUserAliasDto, { alias: invalid }))
      ).not.toHaveLength(0);
    }
    expect(
      validateSync(plainToInstance(UpdateUserAliasDto, {}))
    ).not.toHaveLength(0);
  });

  it('requires admin permissions and denies switched and impersonated writes', () => {
    const handler = UsersController.prototype.updateUserAlias;
    expect(Reflect.getMetadata(HAS_PERMISSION_KEY, handler)).toBe(
      permissions.accessAdminControl
    );
    expect(Reflect.getMetadata(ALLOW_DURING_IMPERSONATION_KEY, handler)).toBe(
      false
    );
    expect(
      isAllowedAdminSwitchRequest('PUT', '/api/v1/users/target/alias')
    ).toBe(false);

    const request = {
      headers: { [HEADER_KEY_IMPERSONATION.toLowerCase()]: 'shared-id' },
      method: 'PUT',
      user: { permissions: getPermissions('USER') }
    };
    const context = new ExecutionContextHost(
      [request],
      UsersController,
      handler
    );

    expect(() =>
      new HasPermissionGuard(new Reflector()).canActivate(context)
    ).toThrow();
    request.user.permissions = getPermissions('ADMIN');
    expect(new HasPermissionGuard(new Reflector()).canActivate(context)).toBe(
      true
    );
    expect(() =>
      new ImpersonationWriteGuard(new Reflector()).canActivate(context)
    ).toThrow();
  });

  it('clears aliases and maps only expected database failures', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = Object.assign(Object.create(AdminService.prototype), {
      prismaService: { user: { update } }
    }) as AdminService;

    await service.updateUserAlias({ alias: '', id: 'target' });
    expect(update).toHaveBeenCalledWith({
      data: { alias: null },
      where: { id: 'target' }
    });

    for (const [code, status] of [
      ['P2002', 409],
      ['P2025', 404]
    ] as const) {
      update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('database error', {
          clientVersion: 'test',
          code
        })
      );
      await expect(
        service.updateUserAlias({ alias: 'Alice', id: 'target' })
      ).rejects.toMatchObject({ status });
    }

    const unexpected = new Error('database unavailable');
    update.mockRejectedValueOnce(unexpected);
    await expect(
      service.updateUserAlias({ alias: 'Alice', id: 'target' })
    ).rejects.toBe(unexpected);
  });

  it('includes aliases in the admin user list and detail', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        _count: { accounts: 0, activities: 0 },
        alias: 'Family',
        analytics: null,
        createdAt: new Date(),
        id: 'target',
        provider: 'ANONYMOUS',
        role: 'USER',
        subscriptions: []
      }
    ]);
    const service = Object.assign(Object.create(AdminService.prototype), {
      configurationService: { get: () => false },
      prismaService: {
        user: { count: jest.fn().mockResolvedValue(1), findMany }
      }
    }) as AdminService;

    expect((await service.getUsers({})).users[0].alias).toBe('Family');
    expect((await service.getUser('target')).alias).toBe('Family');
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ alias: true }),
        where: { id: 'target' }
      })
    );
  });

  it('retains the alias when loading the authenticated user', async () => {
    const service = Object.assign(Object.create(UserService.prototype), {
      configurationService: { get: () => false },
      prismaService: {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            _count: { activities: 0 },
            accounts: [],
            alias: 'Family',
            analytics: null,
            createdAt: new Date(),
            id: 'target',
            provider: 'ANONYMOUS',
            role: 'USER',
            settings: { settings: {} },
            subscriptions: []
          })
        }
      },
      propertyService: { getByKey: jest.fn().mockResolvedValue(null) }
    }) as UserService;

    expect((await service.user({ id: 'target' })).alias).toBe('Family');
  });

  it('returns the authenticated alias, not a shared portfolio owner alias', async () => {
    const service = Object.assign(Object.create(UserService.prototype), {
      configurationService: { get: () => false },
      prismaService: {
        access: { findMany: jest.fn().mockResolvedValue([]) },
        account: { findMany: jest.fn().mockResolvedValue([]) },
        order: { groupBy: jest.fn().mockResolvedValue([]) }
      },
      propertyService: { getByKey: jest.fn().mockResolvedValue(null) },
      tagService: { getTagsForUser: jest.fn().mockResolvedValue([]) },
      user: jest.fn().mockResolvedValue({
        alias: 'Portfolio owner',
        settings: { settings: {} }
      })
    }) as UserService;

    const user = {
      alias: 'Signed in user',
      id: 'actor',
      permissions: [],
      settings: { settings: {} }
    } as UserWithSettings;

    const result = await service.getUser({
      impersonationUserId: 'owner',
      scopes: [],
      user
    });

    expect(result.id).toBe('actor');
    expect(result.alias).toBe('Signed in user');
  });
});
