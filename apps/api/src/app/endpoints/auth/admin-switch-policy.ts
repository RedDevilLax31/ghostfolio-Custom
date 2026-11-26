import { getPermissions, permissions } from '@ghostfolio/common/permissions';
import type { UserWithSettings } from '@ghostfolio/common/types';

// Switched credentials are accepted only on reviewed routes; new routes are
// denied until their ownership and security behavior have been checked.
const ALLOWED_PATHS: Record<string, RegExp[]> = {
  GET: [
    /^\/api\/v1\/user\/?$/,
    /^\/api\/v1\/(?:accounts|account)(?:\/[^/]+(?:\/balances)?)?\/?$/,
    /^\/api\/v1\/activities(?:\/[^/]+)?\/?$/,
    /^\/api\/v1\/portfolio\/(?:details|dividends|holdings|investments|performance|report)\/?$/,
    /^\/api\/v2\/portfolio\/performance\/?$/,
    /^\/api\/v1\/portfolio\/holding\/[^/]+\/[^/]+\/?$/,
    /^\/api\/v1\/(?:watchlist|tags)\/?$/,
    /^\/api\/v1\/benchmarks(?:\/[^/]+\/[^/]+\/[^/]+)?\/?$/,
    /^\/api\/v1\/(?:symbols|symbol)\/(?:lookup|[^/]+\/[^/]+(?:\/[^/]+)?)\/?$/,
    /^\/api\/v1\/asset-profiles(?:\/[^/]+\/[^/]+)?\/?$/,
    /^\/api\/v1\/asset\/[^/]+\/[^/]+\/?$/,
    /^\/api\/v1\/(?:platforms|platform)\/?$/,
    /^\/api\/v1\/(?:exchange-rates|exchange-rate)\/[^/]+\/[^/]+\/?$/,
    /^\/api\/v1\/import\/dividends\/[^/]+\/[^/]+\/?$/,
    /^\/api\/v1\/(?:export|market-data\/markets)\/?$/
  ],
  POST: [
    /^\/api\/v1\/(?:accounts|account)(?:\/transfer-balance|\/[^/]+\/balances)?\/?$/,
    /^\/api\/v1\/(?:account-balance|activities|watchlist|import|tags)\/?$/,
    /^\/api\/v1\/market-data\/[^/]+\/[^/]+\/?$/
  ],
  PUT: [
    /^\/api\/v1\/(?:accounts|account|activities)\/[^/]+\/?$/,
    /^\/api\/v1\/portfolio\/holding\/[^/]+\/[^/]+\/tags\/?$/,
    /^\/api\/v1\/user\/setting\/?$/
  ],
  DELETE: [
    /^\/api\/v1\/(?:accounts|account)\/[^/]+(?:\/balances\/[^/]+)?\/?$/,
    /^\/api\/v1\/account-balance\/[^/]+\/?$/,
    /^\/api\/v1\/activities(?:\/[^/]+)?\/?$/,
    /^\/api\/v1\/watchlist\/[^/]+\/[^/]+\/?$/
  ]
};

export function isAllowedAdminSwitchRequest(method: string, path: string) {
  return ALLOWED_PATHS[method]?.some((pattern) => pattern.test(path)) ?? false;
}

export function restrictAdminSwitchPermissions(user: UserWithSettings) {
  const ordinaryPermissions = getPermissions('USER');
  const protectedPermissions: string[] = [
    ...getPermissions('ADMIN').filter(
      (permission) => !ordinaryPermissions.includes(permission)
    ),
    permissions.accessAdminControlBullBoard,
    permissions.createAccess,
    permissions.deleteAccess,
    permissions.updateAccess,
    permissions.createApiKey,
    permissions.deleteAuthDevice,
    permissions.updateAuthDevice,
    permissions.deleteOwnUser,
    permissions.impersonateAllUsers,
    permissions.requestOwnUserDeletion,
    permissions.syncDemoUserAccount,
    permissions.toggleReadOnlyMode,
    permissions.updateOwnAccessToken
  ];

  user.permissions = user.permissions.filter(
    (permission) => !protectedPermissions.includes(permission)
  );
}
