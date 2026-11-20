import { TAG_ID_DRAFT } from '@ghostfolio/common/config';
import { Activity } from '@ghostfolio/common/interfaces';

import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import * as XLSX from 'xlsx';

import { ImportActivitiesService } from './import-activities.service';

jest.mock('uuid', () => ({ v4: () => '1ad7d4a2-6b2d-4e0f-9b1f-2c0f8d3e5a7b' }));

describe('ImportActivitiesService', () => {
  let service: ImportActivitiesService;
  const fidelityHeader =
    'Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date\n';
  const fidelityRows =
    '04/17/2026,DIVIDEND RECEIVED EXAMPLE (VOO) (Cash),VOO,Example,Cash,,0.0,,,,7.22,7.78,\n' +
    '03/16/2026,REINVESTMENT CASH (315994103) (Cash),315994103,CASH,Cash,1.0,0.12,,,,-0.12,0.56,\n' +
    '03/16/2026,INTEREST EARNED CASH (315994103) (Cash),315994103,CASH,Cash,,0.0,,,,0.12,0.56,\n' +
    '03/07/2026,YOU BOUGHT EXAMPLE (VOO) (Cash),VOO,Example,Cash,630.4,3.0,0.10,0.20,,-1891.2,0.44,03/08/2026\n' +
    '03/07/2026,YOU BOUGHT EXAMPLE (VOO) (Cash),VOO,Example,Cash,630.4,0.854,,,,-538.36,1891.64,03/08/2026\n' +
    '03/06/2026,YOU SOLD EXAMPLE (JNJ) (Cash),JNJ,Example,Cash,243.0,-10.0,,,,2430.0,2430.0,03/07/2026\n' +
    '03/02/2026,YOU BOUGHT RSU#### EXAMPLE (JNJ) (Cash),JNJ,Example,Cash,,10.0,,,,0.0,0.0,03/06/2026\n' +
    'The data and information in this spreadsheet is provided for your use,,,,,,,,,,,,\n' +
    '"More legal text, with a comma",,,,,,,,,,,,\n' +
    'Date downloaded 04/25/2026,,,,,,,,,,,,\n';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ImportActivitiesService, provideHttpClient()]
    });
    service = TestBed.inject(ImportActivitiesService);
  });

  it('maps Fidelity transactions and tags vested RSUs without importing the cash sweep or footer', async () => {
    const importJson = jest
      .spyOn(service, 'importJson')
      .mockImplementation(async ({ activities }) => ({
        activities: activities.map((_, index) => ({
          id: `${index}`,
          importIndex: index
        })) as Activity[]
      }));

    const result = await service.importFidelityCsv({
      fileContent: fidelityHeader + fidelityRows,
      isDryRun: true,
      selectedAccountId: 'account',
      userAccounts: [],
      userTags: [{ id: 'existing-rsu-tag', name: 'Vested RSUs' }]
    });

    const activities = importJson.mock.calls[0][0].activities;
    expect(activities).toHaveLength(6);
    expect(activities.map(({ type }) => type)).toEqual([
      'DIVIDEND',
      'INTEREST',
      'BUY',
      'BUY',
      'SELL',
      'BUY'
    ]);
    expect(activities[0]).toMatchObject({
      symbol: 'VOO',
      currency: 'USD',
      quantity: 1,
      unitPrice: 7.22
    });
    expect(activities[1]).toMatchObject({
      type: 'INTEREST',
      currency: 'USD',
      quantity: 1,
      unitPrice: 0.12,
      dataSource: 'MANUAL'
    });
    expect(activities[2]).toMatchObject({
      accountId: 'account',
      quantity: 3,
      unitPrice: 630.4,
      fee: expect.closeTo(0.3),
      updateAccountBalance: false
    });
    expect(activities[3]).toMatchObject({ quantity: 0.854 });
    expect(activities[4]).toMatchObject({
      symbol: 'JNJ',
      quantity: 10,
      unitPrice: 243,
      type: 'SELL'
    });
    expect(activities[5]).toMatchObject({
      symbol: 'JNJ',
      quantity: 10,
      unitPrice: 0,
      tags: [TAG_ID_DRAFT, 'existing-rsu-tag']
    });
    expect(activities[5].date).toContain('2026-03-02');
    expect(result.tags).toEqual([]);
    expect(result.sourceRows[5]).toMatchObject({
      Action: 'YOU BOUGHT RSU#### EXAMPLE (JNJ) (Cash)'
    });
    expect(result.skippedRowsData).toEqual([
      expect.objectContaining({
        Action: 'REINVESTMENT CASH (315994103) (Cash)',
        'Import issue': 'Unsupported transaction type'
      })
    ]);
  });

  it('creates an RSU tag for preview and retains it when the RSU symbol is unresolved', async () => {
    const importJson = jest
      .spyOn(service, 'importJson')
      .mockRejectedValueOnce({
        error: { message: ['activities.0.symbol ("JNJ") cannot be resolved'] }
      })
      .mockImplementationOnce(async ({ activities }) => ({
        activities: activities.map((_, index) => ({
          id: `${index}`,
          importIndex: index
        })) as Activity[]
      }));
    const row =
      '03/02/2026,YOU BOUGHT RSU123 EXAMPLE,JNJ,Example,Cash,,10,,,,0,0,\n';

    const result = await service.importFidelityCsv({
      fileContent: fidelityHeader + row,
      isDryRun: true,
      selectedAccountId: 'account',
      userAccounts: [],
      userTags: []
    });

    expect(result.tags).toEqual([
      { id: '1ad7d4a2-6b2d-4e0f-9b1f-2c0f8d3e5a7b', name: 'Vested RSUs' }
    ]);
    expect(importJson.mock.calls[1][0].activities[0]).toMatchObject({
      dataSource: 'MANUAL',
      tags: [TAG_ID_DRAFT, result.tags[0].id]
    });
    expect(result.sourceRows[result.activities[0].importIndex!]).toMatchObject({
      Symbol: 'JNJ'
    });
  });

  it('rejects invalid Fidelity headers and reports unsupported or invalid transactions', async () => {
    await expect(
      service.importFidelityCsv({
        fileContent: 'Date,Symbol\n2026-01-01,VOO',
        selectedAccountId: 'account',
        userAccounts: [],
        userTags: []
      })
    ).rejects.toThrow('required Fidelity headers');

    const result = await service.importFidelityCsv({
      fileContent:
        fidelityHeader +
        '02/30/2026,YOU BOUGHT EXAMPLE,VOO,Example,Cash,2,1,,,,2,0,\n' +
        '03/02/2026,YOU BOUGHT EXAMPLE,VOO,Example,Cash,,1,,,,2,0,\n' +
        '03/02/2026,TRANSFER,VOO,Example,Cash,,1,,,,2,0,\n',
      selectedAccountId: 'account',
      userAccounts: [],
      userTags: []
    });

    expect(result.activities).toEqual([]);
    expect(result.skippedRowsData.map((row) => row['Import issue'])).toEqual([
      'Missing or invalid date',
      'Missing or invalid symbol, quantity, price, amount, or fees',
      'Unsupported transaction type'
    ]);
  });

  it('retains the source row of a sorted duplicate and uses the settlement date when needed', async () => {
    const importJson = jest
      .spyOn(service, 'importJson')
      .mockImplementation(async ({ activities }) => ({
        activities: activities
          .map((_, index) => ({
            id: `${index}`,
            importIndex: index,
            ...(index === 0 ? { error: { code: 'IS_DUPLICATE' } } : {})
          }))
          .reverse() as Activity[]
      }));

    const result = await service.importFidelityCsv({
      fileContent:
        fidelityHeader +
        ',YOU BOUGHT EXAMPLE,VOO,"Example, Inc",Cash,2,1,,,,2,0,03/09/2026\n' +
        '03/10/2026,YOU SOLD EXAMPLE,JNJ,Example,Cash,4,-1,,,,4,0,\n',
      isDryRun: true,
      selectedAccountId: 'account',
      userAccounts: [],
      userTags: []
    });

    expect(importJson.mock.calls[0][0].activities[0].date).toContain(
      '2026-03-09'
    );
    const duplicate = result.activities.find(
      ({ error }) => error?.code === 'IS_DUPLICATE'
    )!;
    expect(result.sourceRows[duplicate.importIndex!]).toMatchObject({
      Symbol: 'VOO',
      Description: 'Example, Inc'
    });
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
