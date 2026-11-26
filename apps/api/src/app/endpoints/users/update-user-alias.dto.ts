import { USER_ALIAS_MAXIMUM_LENGTH } from '@ghostfolio/common/config';

import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateUserAliasDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value
  )
  @IsString()
  @MaxLength(USER_ALIAS_MAXIMUM_LENGTH)
  // PostgreSQL text values cannot contain NUL.
  // eslint-disable-next-line no-control-regex
  @Matches(/^[^\u0000]*$/u)
  public alias: string;
}
