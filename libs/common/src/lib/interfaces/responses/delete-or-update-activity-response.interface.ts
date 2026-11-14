import type { Order } from '@ghostfolio/prisma/browser';

export type DeleteOrUpdateActivityResponse = Pick<
  Order,
  | 'accountId'
  | 'accountUserId'
  | 'comment'
  | 'createdAt'
  | 'currency'
  | 'date'
  | 'fee'
  | 'id'
  | 'quantity'
  | 'symbolProfileId'
  | 'type'
  | 'unitPrice'
  | 'updatedAt'
  | 'userId'
>;
