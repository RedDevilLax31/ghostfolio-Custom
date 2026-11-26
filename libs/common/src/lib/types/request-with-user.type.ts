import {
  ImpersonationContext,
  UserWithSettings
} from '@ghostfolio/common/types';

export type RequestWithUser = Request & {
  adminSwitchActorId?: string;
  impersonation?: ImpersonationContext;
  impersonationOfBearerToken?: ImpersonationContext;
  user: UserWithSettings;
};
