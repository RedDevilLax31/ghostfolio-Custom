import { DATE_RANGE_PATTERN } from '@ghostfolio/api/dtos/date-range-filter.dto';
import { FilterDto } from '@ghostfolio/api/dtos/filter.dto';
import { DateRange } from '@ghostfolio/common/types';

import { Type as ActivityType } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, Matches } from 'class-validator';
import { isString } from 'lodash-es';

export class ActivitiesFilterDto extends FilterDto {
  @IsEnum(ActivityType, { each: true })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    return isString(value) ? value.split(',') : value;
  })
  activityTypes?: ActivityType[];

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    if (input === 'true') return true;
    if (input === 'false') return false;
    return input;
  })
  draftsOnly?: boolean;

  @IsOptional()
  @Matches(DATE_RANGE_PATTERN)
  range?: DateRange;
}
