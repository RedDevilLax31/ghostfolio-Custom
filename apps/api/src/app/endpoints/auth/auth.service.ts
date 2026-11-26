import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { UserService } from '@ghostfolio/api/services/user/user.service';

import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ValidateOAuthLoginParams } from './interfaces/interfaces';

@Injectable()
export class AuthService {
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly jwtService: JwtService,
    private readonly propertyService: PropertyService,
    private readonly userService: UserService
  ) {}

  public async switchUser({
    actorId,
    token,
    targetId
  }: {
    actorId: string;
    token: string;
    targetId: string;
  }): Promise<string> {
    let payload: {
      exp?: number;
      id?: string;
      switchActorId?: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch (error) {
      if (
        error instanceof Error &&
        ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(
          error.name
        )
      ) {
        throw new UnauthorizedException();
      }

      throw error;
    }
    const actor = await this.userService.user({ id: actorId });
    const target = await this.userService.user({ id: targetId });
    const issuedAt = Math.floor(Date.now() / 1000);

    if (
      actor?.role !== 'ADMIN' ||
      !target ||
      payload.id !== actorId ||
      payload.switchActorId !== undefined ||
      typeof payload.exp !== 'number' ||
      payload.exp <= issuedAt
    ) {
      throw new ForbiddenException();
    }

    return this.jwtService.sign(
      { iat: issuedAt, id: target.id, switchActorId: actor.id },
      { expiresIn: payload.exp - issuedAt }
    );
  }

  public async validateAnonymousLogin(accessToken: string): Promise<string> {
    const hashedAccessToken = this.userService.createAccessToken({
      password: accessToken,
      salt: this.configurationService.get('ACCESS_TOKEN_SALT')
    });

    const [user] = await this.userService.users({
      where: { accessToken: hashedAccessToken }
    });

    if (user) {
      return this.jwtService.sign({
        id: user.id
      });
    }

    throw new Error();
  }

  public async validateOAuthLogin({
    provider,
    thirdPartyId
  }: ValidateOAuthLoginParams): Promise<string> {
    try {
      let [user] = await this.userService.users({
        where: { provider, thirdPartyId }
      });

      if (!user) {
        const isUserSignupEnabled =
          await this.propertyService.isUserSignupEnabled();

        if (!isUserSignupEnabled) {
          throw new Error('Sign up forbidden');
        }

        // Create new user if not found
        user = await this.userService.createUser({
          data: {
            provider,
            thirdPartyId
          }
        });
      }

      return this.jwtService.sign({
        id: user.id
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'validateOAuthLogin',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}
