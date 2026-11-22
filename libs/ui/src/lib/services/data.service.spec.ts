import { HttpClient, HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { DataService } from './data.service';

describe('DataService draft filtering', () => {
  const get = jest
    .fn<
      Observable<{ activities: []; count: number }>,
      [string, { params: HttpParams }]
    >()
    .mockReturnValue(of({ activities: [], count: 0 }));
  const deleteRequest = jest
    .fn<Observable<number>, [string, { params: HttpParams }]>()
    .mockReturnValue(of(0));
  let service: DataService;

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        DataService,
        { provide: HttpClient, useValue: { get, delete: deleteRequest } }
      ]
    });
    service = TestBed.inject(DataService);
  });

  it('passes draft and existing filters to listing, export, and deletion', () => {
    const filters = [{ id: 'account-id', type: 'ACCOUNT' as const }];
    service.fetchActivities({
      activityTypes: ['BUY'],
      draftsOnly: true,
      filters
    });
    service.fetchExport({ activityTypes: ['BUY'], draftsOnly: true, filters });
    service.deleteActivities({
      activityTypes: ['BUY'],
      draftsOnly: true,
      filters
    });

    for (const call of [
      get.mock.calls[0],
      get.mock.calls[1],
      deleteRequest.mock.calls[0]
    ]) {
      const params: HttpParams = call[1].params;
      expect(params.get('draftsOnly')).toBe('true');
      expect(params.get('activityTypes')).toBe('BUY');
      expect(params.get('accounts')).toBe('account-id');
    }
  });

  it('omits draftsOnly when it is off', () => {
    service.fetchActivities({ draftsOnly: false });
    service.fetchExport({ draftsOnly: false });
    service.deleteActivities({ draftsOnly: false });

    for (const call of [
      get.mock.calls[0],
      get.mock.calls[1],
      deleteRequest.mock.calls[0]
    ]) {
      expect(call[1].params.has('draftsOnly')).toBe(false);
    }
  });
});
