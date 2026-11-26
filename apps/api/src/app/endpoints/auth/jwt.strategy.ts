import { isBrowserUserAgent } from '@ghostfolio/api/helper/user-agent.helper';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { UserService } from '@ghostfolio/api/services/user/user.service';
import {
  DEFAULT_CURRENCY,
  DEFAULT_LANGUAGE_CODE,
  HEADER_KEY_TIMEZONE
} from '@ghostfolio/common/config';
import { hasRole } from '@ghostfolio/common/permissions';
import type { UserWithSettings } from '@ghostfolio/common/types';

import { HttpException, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { RequestClient } from '@prisma/client';
import * as countriesAndTimezones from 'countries-and-timezones';
import { Request } from 'express';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  isAllowedAdminSwitchRequest,
  restrictAdminSwitchPermissions
} from './admin-switch-policy';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly userService: UserService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      passReqToCallback: true,
      secretOrKey: configurationService.get('JWT_SECRET_KEY')
    });
  }

  public async validate(
    request: Request & { adminSwitchActorId?: string },
    { id, switchActorId }: { id: string; switchActorId?: string }
  ) {
    try {
      const timezone = request.headers[HEADER_KEY_TIMEZONE.toLowerCase()];
      let actor: UserWithSettings | null = null;

      if (switchActorId !== undefined) {
        if (
          typeof switchActorId !== 'string' ||
          !switchActorId ||
          !isAllowedAdminSwitchRequest(
            request.method,
            request.originalUrl.split('?')[0]
          ) ||
          request.headers['impersonation-id']
        ) {
          throw new HttpException(
            getReasonPhrase(StatusCodes.FORBIDDEN),
            StatusCodes.FORBIDDEN
          );
        }

        actor = await this.userService.user({ id: switchActorId });

        if (!actor || !hasRole(actor, 'ADMIN')) {
          throw new HttpException(
            getReasonPhrase(StatusCodes.UNAUTHORIZED),
            StatusCodes.UNAUTHORIZED
          );
        }

        request.adminSwitchActorId = switchActorId;
      }

      const user = await this.userService.user({ id });

      if (user) {
        if (switchActorId !== undefined) {
          restrictAdminSwitchPermissions(user);
        }

        if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
          const requestingUser = actor ?? user;

          if (hasRole(requestingUser, 'INACTIVE')) {
            throw new HttpException(
              getReasonPhrase(StatusCodes.TOO_MANY_REQUESTS),
              StatusCodes.TOO_MANY_REQUESTS
            );
          }

          if (
            await this.userService.isDailyRequestLimitExceeded({
              user: requestingUser
            })
          ) {
            throw new HttpException(
              getReasonPhrase(StatusCodes.TOO_MANY_REQUESTS),
              StatusCodes.TOO_MANY_REQUESTS
            );
          }

          const country =
            typeof timezone === 'string'
              ? countriesAndTimezones.getCountryForTimezone(timezone)?.id
              : undefined;

          await this.userService.updateAnalytics({
            country,
            requestClient: isBrowserUserAgent(request.headers['user-agent'])
              ? RequestClient.WEB
              : RequestClient.API,
            userId: requestingUser.id
          });
        }

        if (!user.settings.settings.baseCurrency) {
          user.settings.settings.baseCurrency = DEFAULT_CURRENCY;
        }

        if (!user.settings.settings.language) {
          user.settings.settings.language = DEFAULT_LANGUAGE_CODE;
        }

        return user;
      } else {
        throw new HttpException(
          getReasonPhrase(StatusCodes.NOT_FOUND),
          StatusCodes.NOT_FOUND
        );
      }
    } catch (error) {
      if (
        error instanceof HttpException &&
        (error.getStatus() === StatusCodes.TOO_MANY_REQUESTS ||
          error.getStatus() === StatusCodes.FORBIDDEN)
      ) {
        throw error;
      } else {
        throw new HttpException(
          getReasonPhrase(StatusCodes.UNAUTHORIZED),
          StatusCodes.UNAUTHORIZED
        );
      }
    }
  }
}
