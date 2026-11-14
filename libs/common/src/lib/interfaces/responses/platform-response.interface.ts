import type { Platform } from '@ghostfolio/prisma/browser';

export type PlatformResponse = Pick<Platform, 'id' | 'name' | 'url'>;
