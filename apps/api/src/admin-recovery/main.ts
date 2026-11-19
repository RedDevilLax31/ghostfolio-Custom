import {
  RecoveryError,
  runAdminRecovery
} from '@ghostfolio/api/admin-recovery/admin-recovery';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const salt = process.env.ACCESS_TOKEN_SALT;

  if (!databaseUrl || !salt) {
    throw new RecoveryError(
      'DATABASE_URL and ACCESS_TOKEN_SALT must be configured.'
    );
  }
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new RecoveryError('Recovery requires an interactive terminal.');
  }

  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new RecoveryError(
      'DATABASE_URL must be a PostgreSQL connection URL.'
    );
  }

  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl })
  });
  const terminal = createInterface({ input: stdin, output: stdout });

  try {
    console.log(`Database host: ${url.hostname}:${url.port || '5432'}`);
    console.log(
      `Database name: ${JSON.stringify(decodeURIComponent(url.pathname.slice(1)))}`
    );
    await runAdminRecovery({
      ask: (question) => terminal.question(question),
      database,
      salt,
      write: (message) => console.log(message)
    });
  } finally {
    terminal.close();
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof RecoveryError) {
    console.error(`Recovery failed: ${error.message}`);
  } else {
    console.error(
      'Recovery failed due to a database or runtime error. Check the target configuration and database availability.'
    );
  }
  process.exitCode = 1;
});
