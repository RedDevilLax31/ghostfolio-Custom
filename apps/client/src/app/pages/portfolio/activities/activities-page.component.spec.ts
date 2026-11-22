import { IcsService } from '@ghostfolio/client/services/ics/ics.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { DataService, PresentationModeService } from '@ghostfolio/ui/services';

import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { DeviceDetectorService } from 'ngx-device-detector';
import { NEVER, of, Subject } from 'rxjs';

import { GfActivitiesPageComponent } from './activities-page.component';

jest.mock('uuid', () => ({ v4: () => '1ad7d4a2-6b2d-4e0f-9b1f-2c0f8d3e5a7b' }));
jest.mock('@ionic/angular/standalone', () => ({ IonIcon: class {} }));
jest.mock('ionicons', () => ({ addIcons: jest.fn() }));
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));

describe('GfActivitiesPageComponent draft filtering', () => {
  const fetchActivities = jest.fn();
  const fetchExport = jest.fn();
  const deleteActivities = jest.fn();
  const openDialog = jest.fn();
  let component: GfActivitiesPageComponent;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchActivities.mockReturnValue(of({ activities: [], count: 0 }));
    fetchExport.mockReturnValue(NEVER);
    deleteActivities.mockReturnValue(of(0));
    TestBed.configureTestingModule({
      imports: [GfActivitiesPageComponent],
      providers: [
        {
          provide: DataService,
          useValue: { deleteActivities, fetchActivities, fetchExport }
        },
        {
          provide: UserService,
          useValue: { get: () => of({}), getFilters: () => [] }
        },
        { provide: IcsService, useValue: {} },
        { provide: ImpersonationStorageService, useValue: {} },
        { provide: DeviceDetectorService, useValue: {} },
        { provide: MatDialog, useValue: { open: openDialog } },
        { provide: Router, useValue: { navigate: jest.fn() } }
      ]
    }).overrideComponent(GfActivitiesPageComponent, {
      set: { template: '', imports: [] }
    });
    component = TestBed.createComponent(
      GfActivitiesPageComponent
    ).componentInstance;
  });

  it('resets the page and applies the draft filter to list, export and delete', () => {
    component['pageIndex'] = 3;
    component['onTypesFilterChanged'](['BUY']);
    component['pageIndex'] = 3;
    component['onDraftsFilterChanged'](true);
    component['onExport']();
    component['onDeleteActivities']();

    expect(component['pageIndex']).toBe(0);
    for (const mock of [fetchActivities, fetchExport, deleteActivities]) {
      expect(mock).toHaveBeenLastCalledWith(
        expect.objectContaining({ activityTypes: ['BUY'], draftsOnly: true })
      );
    }

    component['onDraftsFilterChanged'](false);
    expect(fetchActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({ draftsOnly: false, skip: 0 })
    );
  });

  it('ignores a stale response after changing the filter', () => {
    const oldRequest = new Subject<{ activities: []; count: number }>();
    fetchActivities.mockReturnValueOnce(oldRequest);
    component['onDraftsFilterChanged'](true);
    component['onDraftsFilterChanged'](false);
    oldRequest.next({ activities: [], count: 42 });

    expect(component['totalItems']).toBe(0);
  });

  it('blocks imports and requires confirmation for exports in presentation mode', () => {
    const alert = jest
      .spyOn(window, 'alert')
      .mockImplementation(() => undefined);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const mode = TestBed.inject(PresentationModeService);
    mode.setEnabled(true);

    component['onImport']();
    component['onImportDividends']();
    component['onExport']();
    component['onExportDrafts']();
    expect(alert).toHaveBeenCalledTimes(2);
    expect(openDialog).not.toHaveBeenCalled();
    expect(fetchExport).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    component['onExport']();
    expect(fetchExport).toHaveBeenCalledTimes(1);

    mode.setEnabled(false);
    alert.mockRestore();
    confirm.mockRestore();
  });

  it('warns before a pending export if presentation mode was enabled meanwhile', () => {
    const response = new Subject<{ meta: { date: string } }>();
    fetchExport.mockReturnValue(response);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const mode = TestBed.inject(PresentationModeService);

    component['onExport']();
    mode.setEnabled(true);
    response.next({ meta: { date: '2026-01-01' } });
    expect(confirm).toHaveBeenCalledTimes(1);

    mode.setEnabled(false);
    confirm.mockRestore();
  });
});
