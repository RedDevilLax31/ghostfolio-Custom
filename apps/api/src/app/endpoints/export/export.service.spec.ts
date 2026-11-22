import { AccountService } from '@ghostfolio/api/services/account/account.service';
import { ActivitiesService } from '@ghostfolio/api/services/activities/activities.service';
import { TagService } from '@ghostfolio/api/services/tag/tag.service';

import { ExportService } from './export.service';

describe('ExportService', () => {
  it('exports only matching activity accounts when draftsOnly is enabled', async () => {
    const getActivities = jest.fn().mockResolvedValue({
      activities: [
        {
          accountId: 'draft-account',
          assetProfile: { currency: 'USD', dataSource: 'YAHOO', symbol: 'ABC' },
          date: new Date('2026-01-01'),
          id: 'draft-activity',
          tags: []
        }
      ]
    });
    const service = new ExportService(
      {
        accounts: jest.fn().mockResolvedValue([
          { id: 'draft-account', balances: [], tags: [] },
          { id: 'other-account', balances: [], tags: [] }
        ])
      } as unknown as AccountService,
      { getActivities } as unknown as ActivitiesService,
      null,
      {
        getTagsForUser: jest.fn().mockResolvedValue([])
      } as unknown as TagService
    );

    const result = await service.export({
      draftsOnly: true,
      userId: 'user-id',
      userSettings: { baseCurrency: 'USD' }
    });

    expect(getActivities).toHaveBeenCalledWith(
      expect.objectContaining({ draftsOnly: true, userId: 'user-id' })
    );
    expect(result.activities.map(({ id }) => id)).toEqual(['draft-activity']);
    expect(result.accounts.map(({ id }) => id)).toEqual(['draft-account']);
  });
});
