import { generateAccessToken } from '@ghostfolio/api/helper/access-token.helper';

import { PrismaClient } from '@prisma/client';

type RecoveryDatabase = Pick<PrismaClient, 'user'>;

export class RecoveryError extends Error {}

export async function listRecoverableAdmins(database: RecoveryDatabase) {
  return database.user.findMany({
    where: { provider: 'ANONYMOUS', role: 'ADMIN' },
    select: { createdAt: true, id: true },
    orderBy: { createdAt: 'asc' }
  });
}

export async function recoverAdminToken({
  database,
  salt,
  userId
}: {
  database: RecoveryDatabase;
  salt: string;
  userId: string;
}) {
  if (!salt || !userId) {
    throw new RecoveryError(
      'An access token salt and admin user ID are required.'
    );
  }

  const { accessToken, hashedAccessToken } = generateAccessToken({
    salt,
    userId
  });
  const result = await database.user.updateMany({
    where: { id: userId, provider: 'ANONYMOUS', role: 'ADMIN' },
    data: { accessToken: hashedAccessToken }
  });

  if (result.count !== 1) {
    throw new RecoveryError('The selected user is not an anonymous admin.');
  }

  return accessToken;
}

export async function runAdminRecovery({
  ask,
  database,
  salt,
  write
}: {
  ask: (question: string) => Promise<string>;
  database: RecoveryDatabase;
  salt: string;
  write: (message: string) => void;
}) {
  const admins = await listRecoverableAdmins(database);
  if (admins.length === 0) {
    throw new RecoveryError('No anonymous admin accounts were found.');
  }

  write('Anonymous admin accounts (user ID, creation time):');
  for (const admin of admins) {
    write(`${admin.id}  ${admin.createdAt.toISOString()}`);
  }

  const userId = (await ask('Enter the admin user ID: ')).trim();
  if (!admins.some((admin) => admin.id === userId)) {
    throw new RecoveryError('The selected user is not an anonymous admin.');
  }
  write(
    'The old token will stop working. Existing sessions and authentication devices will remain active.'
  );
  const confirmation = await ask(
    `Type the full user ID ${userId} to confirm: `
  );
  if (confirmation.trim() !== userId) {
    throw new RecoveryError('Recovery cancelled; no token was changed.');
  }

  const token = await recoverAdminToken({ database, salt, userId });
  write(`New security token (shown once; store it securely):\n${token}`);
}
