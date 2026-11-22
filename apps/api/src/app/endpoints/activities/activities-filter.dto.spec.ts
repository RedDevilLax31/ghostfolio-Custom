import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ActivitiesFilterDto } from './activities-filter.dto';

describe('ActivitiesFilterDto', () => {
  it.each([
    ['true', true],
    ['false', false]
  ])('parses draftsOnly=%s as %s', (value, expected) => {
    const filter = plainToInstance(ActivitiesFilterDto, { draftsOnly: value });

    expect(validateSync(filter)).toHaveLength(0);
    expect(filter.draftsOnly).toBe(expected);
  });

  it('rejects invalid draftsOnly values', () => {
    const filter = plainToInstance(ActivitiesFilterDto, { draftsOnly: 'yes' });

    expect(validateSync(filter)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'draftsOnly' })
      ])
    );
  });
});
