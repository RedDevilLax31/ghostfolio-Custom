import { Activity } from '@ghostfolio/common/interfaces';

import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import * as XLSX from 'xlsx';

import { ImportActivitiesService } from './import-activities.service';

jest.mock('uuid', () => ({ v4: () => '1ad7d4a2-6b2d-4e0f-9b1f-2c0f8d3e5a7b' }));

describe('ImportActivitiesService', () => {
  let service: ImportActivitiesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ImportActivitiesService, provideHttpClient()]
    });
    service = TestBed.inject(ImportActivitiesService);
  });

  it('retains the original CSV rows when the preview is sorted', async () => {
    jest.spyOn(service, 'importJson').mockResolvedValue({
      activities: [
        { id: 'later', importIndex: 1 },
        { id: 'first', importIndex: 0, error: { code: 'IS_DUPLICATE' } }
      ] as Activity[]
    });

    const result = await service.importCsv({
      fileContent:
        'Date,Symbol,Type,Quantity,UnitPrice,Currency,Fee,Note\n' +
        '2024-01-02,AAPL,Buy,1,100,USD,0,original first\n' +
        '2024-01-01,MSFT,Buy,2,200,USD,0,original second',
      isDryRun: true,
      userAccounts: []
    });

    expect(result.sourceRows[result.activities[1].importIndex!]).toMatchObject({
      Symbol: 'AAPL',
      Note: 'original first'
    });
    expect(result.sourceRows[result.activities[0].importIndex!]).toMatchObject({
      Symbol: 'MSFT',
      Note: 'original second'
    });
  });

  it('maps spreadsheet rows across normal and draft requests and retains skipped rows', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          'Trade date': '01/02/2024',
          'Transaction type': 'Buy',
          Symbol: 'MISSING',
          Quantity: 1,
          Price: 100,
          Description: 'original draft'
        },
        {
          'Trade date': '01/01/2024',
          'Transaction type': 'Buy',
          Symbol: 'AAPL',
          Quantity: 1,
          Price: 200,
          Description: 'original normal'
        },
        {
          'Trade date': '01/01/2024',
          'Transaction type': 'Unsupported',
          Symbol: 'AAPL',
          Description: 'original skipped'
        }
      ]),
      'Transactions'
    );
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const file = { arrayBuffer: async () => buffer } as File;
    jest
      .spyOn(service, 'importCsv')
      .mockRejectedValueOnce({
        error: {
          message: ['activities.0.symbol ("MISSING") cannot be resolved']
        }
      })
      .mockResolvedValueOnce({
        activities: [{ id: 'normal', importIndex: 0 }] as Activity[],
        assetProfiles: [],
        sourceRows: []
      })
      .mockResolvedValueOnce({
        activities: [
          { id: 'draft', importIndex: 0, error: { code: 'IS_DUPLICATE' } }
        ] as Activity[],
        assetProfiles: [],
        sourceRows: []
      });

    const result = await service.importXlsx({
      currency: 'USD',
      file,
      isDryRun: true,
      selectedAccountId: 'account',
      userAccounts: []
    });

    expect(result.sourceRows[result.activities[0].importIndex!]).toMatchObject({
      Description: 'original normal'
    });
    expect(result.sourceRows[result.activities[1].importIndex!]).toMatchObject({
      Description: 'original draft'
    });
    expect(result.skippedRowsData).toEqual([
      expect.objectContaining({
        Description: 'original skipped',
        'Import issue': 'Unsupported transaction type'
      })
    ]);
  });

  it('maps a Vanguard workbook through CSV validation to sorted preview activities', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          'Trade date': '01/02/2024',
          'Transaction type': 'Buy',
          Symbol: 'AAPL',
          Quantity: 1,
          Price: 100,
          Description: 'new'
        },
        {
          'Trade date': '01/01/2024',
          'Transaction type': 'Buy',
          Symbol: 'MSFT',
          Quantity: 2,
          Price: 200,
          Description: 'duplicate'
        }
      ]),
      'Transactions'
    );
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const importJson = jest.spyOn(service, 'importJson').mockResolvedValue({
      activities: [
        { id: 'duplicate', importIndex: 1, error: { code: 'IS_DUPLICATE' } },
        { id: 'new', importIndex: 0 }
      ] as Activity[]
    });

    const result = await service.importXlsx({
      currency: 'USD',
      file: { arrayBuffer: async () => buffer } as File,
      isDryRun: true,
      platformName: 'Vanguard',
      selectedAccountId: 'account',
      userAccounts: []
    });

    expect(importJson).toHaveBeenCalledWith(
      expect.objectContaining({
        isDryRun: true,
        activities: [
          expect.objectContaining({ accountId: 'account', symbol: 'AAPL' }),
          expect.objectContaining({ accountId: 'account', symbol: 'MSFT' })
        ]
      })
    );
    expect(result.activities.map(({ importIndex }) => importIndex)).toEqual([
      1, 0
    ]);
    expect(result.sourceRows[result.activities[0].importIndex!]).toMatchObject({
      Description: 'duplicate'
    });
    expect(result.sourceRows[result.activities[1].importIndex!]).toMatchObject({
      Description: 'new'
    });
  });

  it('retains both original rows for a paired Vanguard reinvestment', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          'Trade date': '01/02/2024',
          'Transaction type': 'Dividend',
          Symbol: 'AAPL',
          Amount: 100,
          Description: 'dividend'
        },
        {
          'Trade date': '01/02/2024',
          'Transaction type': 'Reinvestment',
          Symbol: 'AAPL',
          Amount: 100,
          Quantity: 2,
          Description: 'reinvestment'
        }
      ]),
      'Transactions'
    );
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    jest.spyOn(service, 'importCsv').mockResolvedValue({
      activities: [
        { id: 'paired', importIndex: 0, error: { code: 'IS_DUPLICATE' } }
      ] as Activity[],
      assetProfiles: [],
      sourceRows: []
    });

    const result = await service.importXlsx({
      currency: 'USD',
      file: { arrayBuffer: async () => buffer } as File,
      isDryRun: true,
      platformName: 'Vanguard',
      selectedAccountId: 'account',
      userAccounts: []
    });

    expect(result.sourceRows[0]).toMatchObject({ Description: 'dividend' });
    expect(result.relatedSourceRows[0]).toEqual([
      expect.objectContaining({ Description: 'reinvestment' })
    ]);
  });

  it('exports skipped rows with their reason and escaped original values', () => {
    const csv = service.getSkippedRowsCsv([
      { Symbol: 'AAPL', Note: 'a, b', 'Import issue': 'Duplicate record' },
      { Symbol: 'MSFT', 'Import issue': 'Unsupported transaction type' }
    ]);

    expect(
      XLSX.utils.sheet_to_json(XLSX.read(csv, { type: 'string' }).Sheets.Sheet1)
    ).toEqual([
      { Symbol: 'AAPL', Note: 'a, b', 'Import issue': 'Duplicate record' },
      { Symbol: 'MSFT', 'Import issue': 'Unsupported transaction type' }
    ]);
  });
});
