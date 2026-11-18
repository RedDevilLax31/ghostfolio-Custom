import { ImportActivitiesService } from '@ghostfolio/client/services/import-activities.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { Activity } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper } from '@angular/material/stepper';

import { GfImportActivitiesDialogComponent } from './import-activities-dialog.component';

jest.mock('uuid', () => ({
  v4: () => '1ad7d4a2-6b2d-4e0f-9b1f-2c0f8d3e5a7b'
}));
jest.mock('@ionic/angular/standalone', () => ({ IonIcon: class {} }));
jest.mock('ionicons', () => ({ addIcons: jest.fn() }));
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));

describe('GfImportActivitiesDialogComponent', () => {
  let component: GfImportActivitiesDialogComponent;
  const importSelectedActivities = jest.fn();
  const importXlsx = jest.fn();
  const getSkippedRowsCsv = jest.fn((rows: Record<string, unknown>[]) =>
    JSON.stringify(rows)
  );
  const close = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [GfImportActivitiesDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            deviceType: 'desktop',
            user: { accounts: [], permissions: [], settings: {} }
          }
        },
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: MatSnackBar,
          useValue: { open: jest.fn(), dismiss: jest.fn() }
        },
        {
          provide: ImportActivitiesService,
          useValue: { getSkippedRowsCsv, importSelectedActivities, importXlsx }
        },
        { provide: DataService, useValue: {} },
        { provide: UserService, useValue: {} }
      ]
    }).overrideComponent(GfImportActivitiesDialogComponent, {
      set: { template: '', imports: [] }
    });

    component = TestBed.createComponent(
      GfImportActivitiesDialogComponent
    ).componentInstance;
  });

  it('exports duplicate preview rows and excludes them from selection', () => {
    const activities = [
      { id: 'existing', importIndex: 1, error: { code: 'IS_DUPLICATE' } },
      { id: 'new', importIndex: 0 }
    ] as Activity[];

    component['setImportPreview']({
      activities,
      sourceRows: [{ symbol: 'new' }, { symbol: 'existing' }],
      relatedSourceRows: { 1: [{ symbol: 'paired' }] }
    });
    component['updateSelection'](activities);

    expect(component['duplicateRows']).toBe(1);
    expect(component['selectedActivities']).toEqual([activities[1]]);
    expect(getSkippedRowsCsv).toHaveBeenCalledWith([
      { symbol: 'existing', 'Import issue': 'Duplicate record' },
      { symbol: 'paired', 'Import issue': 'Duplicate record' }
    ]);
  });

  it('keeps the dialog open and maps a submission-time duplicate to its source row', async () => {
    const activities = [
      { id: 'first', importIndex: 0 },
      { id: 'second', importIndex: 1 }
    ] as Activity[];
    component['setImportPreview']({
      activities,
      sourceRows: [{ symbol: 'first' }, { symbol: 'second' }]
    });
    component['updateSelection'](activities);
    importSelectedActivities.mockResolvedValue({
      activities: [{ id: 'created', importIndex: 0 }],
      skippedActivities: [{ importIndex: 1, error: { code: 'IS_DUPLICATE' } }]
    });

    await component['onImportActivities']();

    expect(component['importedCount']).toBe(1);
    expect(component['duplicateRows']).toBe(1);
    expect(component['selectedActivities']).toEqual([]);
    expect(component['activities']).toEqual([]);
    component['updateSelection'](activities);
    expect(component['selectedActivities']).toEqual([]);
    expect(getSkippedRowsCsv).toHaveBeenCalledWith([
      { symbol: 'second', 'Import issue': 'Duplicate record' }
    ]);
    expect(close).not.toHaveBeenCalled();
    component['onCancel']();
    expect(close).toHaveBeenCalledWith({ withRefresh: true });
  });

  it('keeps the duplicate export available after importing nonduplicates', async () => {
    const activities = [
      { id: 'duplicate', importIndex: 0, error: { code: 'IS_DUPLICATE' } },
      { id: 'new', importIndex: 1 }
    ] as Activity[];
    component['setImportPreview']({
      activities,
      sourceRows: [{ symbol: 'duplicate' }, { symbol: 'new' }]
    });
    component['updateSelection'](activities);
    importSelectedActivities.mockResolvedValue({
      activities: [{ id: 'created', importIndex: 0 }],
      skippedActivities: []
    });

    await component['onImportActivities']();

    expect(component['importedCount']).toBe(1);
    expect(component['duplicateRows']).toBe(1);
    expect(component['selectedActivities']).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });

  it('displays a spreadsheet validation error and clears a previous preview', async () => {
    const previousActivities = [
      { id: 'previous', importIndex: 0 }
    ] as Activity[];
    component['setImportPreview']({
      activities: previousActivities,
      sourceRows: [{ symbol: 'previous' }]
    });
    component['updateSelection'](previousActivities);
    importXlsx.mockRejectedValueOnce(
      new Error('The imported activity could not be matched to its source row')
    );
    const logError = jest.spyOn(console, 'error').mockImplementation();
    const next = jest.fn();

    try {
      await component['handleFile']({
        file: { name: 'transactions.xlsx' } as File,
        stepper: { next } as unknown as MatStepper
      });

      expect(component['errorMessages']).toEqual([
        'The imported activity could not be matched to its source row'
      ]);
      expect(component['activities']).toEqual([]);
      expect(component['selectedActivities']).toEqual([]);
      expect(component['dataSource'].data).toEqual([]);
      expect(next).toHaveBeenCalled();
    } finally {
      logError.mockRestore();
    }
  });

  it('shows and selects new spreadsheet activities while excluding duplicates', async () => {
    const newActivity = { id: 'new', importIndex: 0 } as Activity;
    const duplicate = {
      id: 'duplicate',
      importIndex: 1,
      error: { code: 'IS_DUPLICATE' }
    } as Activity;
    importXlsx.mockResolvedValueOnce({
      activities: [newActivity, duplicate],
      assetProfiles: [],
      sourceRows: [{ symbol: 'new' }, { symbol: 'duplicate' }],
      skippedRows: 0,
      skippedRowsData: []
    });
    const next = jest.fn();

    await component['handleFile']({
      file: { name: 'transactions.xlsx' } as File,
      stepper: { next } as unknown as MatStepper
    });

    expect(component['dataSource'].data).toEqual([duplicate, newActivity]);
    expect(component['selectedActivities']).toEqual([newActivity]);
    expect(component['duplicateRows']).toBe(1);
    expect(next).toHaveBeenCalled();
  });

  it('retains server validation messages and their activity details', () => {
    const activity = { symbol: 'AAPL' };

    component['handleImportError']({
      activities: [activity],
      error: { error: { message: ['activities.0.symbol is invalid'] } }
    });

    expect(component['errorMessages']).toEqual([
      'activities.0.symbol is invalid'
    ]);
    expect(component['details']).toEqual([activity]);
  });
});
