import type { AccountBalance } from '@ghostfolio/prisma/browser';

export type AccountBalanceResponse = Pick<
  AccountBalance,
  'accountId' | 'comment' | 'date' | 'id' | 'value'
>;
