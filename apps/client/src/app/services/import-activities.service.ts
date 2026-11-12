import {
  NON_INVESTMENT_ACTIVITY_TYPES,
  TAG_ID_DRAFT
} from '@ghostfolio/common/config';
import {
  CreateAccountWithBalancesDto,
  CreateAssetProfileWithMarketDataDto,
  CreateOrderDto,
  CreatePlatformDto,
  CreateTagDto
} from '@ghostfolio/common/dtos';
import {
  isValidCustomAssetProfileSymbol,
  parseDate as parseDateHelper
} from '@ghostfolio/common/helper';
import { Activity } from '@ghostfolio/common/interfaces';
import type { Account } from '@ghostfolio/prisma/browser';
import { DataSource, Type as ActivityType } from '@ghostfolio/prisma/enums';

import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { isFinite, isNumber, isString } from 'lodash-es';
import { parse as csvToJson } from 'papaparse';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

@Service()
export class ImportActivitiesService {
  private static ACCOUNT_KEYS = ['account', 'accountid'];
  private static COMMENT_KEYS = ['comment', 'note'];
  private static CURRENCY_KEYS = ['ccy', 'currency', 'currencyprimary'];
  private static DATA_SOURCE_KEYS = ['datasource'];
  private static DATE_KEYS = ['date', 'tradedate'];
  private static FEE_KEYS = ['commission', 'fee', 'ibcommission'];
  private static QUANTITY_KEYS = ['qty', 'quantity', 'shares', 'units'];
  private static SYMBOL_KEYS = ['code', 'symbol', 'ticker'];
  private static TYPE_KEYS = ['action', 'buy/sell', 'type'];
  private static UNIT_PRICE_KEYS = [
    'price',
    'tradeprice',
    'unitprice',
    'value'
  ];

  private readonly http = inject(HttpClient);

  /**
   * Gives the number of the lines of a CSV file which are not empty, without
   * the first line
   */
  public getDataRowCountOfCsv(fileContent: string) {
    const lineCount = fileContent.split(/\r\n|\r|\n/).filter((line) => {
      return line.trim().length > 0;
    }).length;

    return Math.max(lineCount - 1, 0);
  }

  public async importCsv({
    activityTagIds,
    fileContent,
    isDryRun = false,
    selectedAccountId,
    tags,
    userAccounts
  }: {
    activityTagIds?: string[];
    fileContent: string;
    isDryRun?: boolean;
    selectedAccountId?: string;
    tags?: CreateTagDto[];
    userAccounts: Account[];
  }): Promise<{
    activities: Activity[];
    assetProfiles: CreateAssetProfileWithMarketDataDto[];
  }> {
    const content = csvToJson<Record<string, unknown>>(fileContent, {
      dynamicTyping: true,
      header: true,
      skipEmptyLines: true
    }).data;

    const activities: CreateOrderDto[] = [];
    const assetProfiles: CreateAssetProfileWithMarketDataDto[] = [];
    const assetProfileSymbolMapping = new Map<string, string>();

    for (const [index, item] of content.entries()) {
      const currency = this.parseCurrency({ content, index, item });
      const type = this.parseType({ content, index, item });

      let dataSource = this.parseDataSource({ item });
      let symbol = this.parseSymbol({ content, index, item });

      if (!dataSource && NON_INVESTMENT_ACTIVITY_TYPES.includes(type)) {
        // Apply the same data source as the import service
        dataSource = DataSource.MANUAL;
      }

      if (dataSource === DataSource.MANUAL) {
        const name = symbol;

        if (!isValidCustomAssetProfileSymbol(symbol)) {
          // Generate a symbol and keep the free text as the name
          symbol = assetProfileSymbolMapping.get(name) ?? uuidv4();
          assetProfileSymbolMapping.set(name, symbol);
        }

        const isExistingAssetProfile = assetProfiles.some((assetProfile) => {
          return assetProfile.symbol === symbol;
        });

        if (!isExistingAssetProfile) {
          // Create synthetic asset profile for MANUAL data source
          assetProfiles.push({
            currency,
            name,
            symbol,
            assetClass: undefined,
            assetSubClass: undefined,
            comment: undefined,
            countries: [],
            cusip: undefined,
            dataSource: DataSource.MANUAL,
            figi: undefined,
            figiComposite: undefined,
            figiShareClass: undefined,
            holdings: [],
            isActive: true,
            isin: undefined,
            marketData: [],
            sectors: [],
            url: undefined
          });
        }
      }

      activities.push({
        currency,
        dataSource,
        symbol,
        type,
        accountId:
          selectedAccountId ?? this.parseAccount({ item, userAccounts }),
        comment: this.parseComment({ item }),
        date: this.parseDate({ content, index, item }),
        fee: this.parseFee({ content, index, item }),
        quantity: this.parseQuantity({ content, index, item }),
        tags: activityTagIds,
        unitPrice: this.parseUnitPrice({ content, index, item }),
        updateAccountBalance: false
      });
    }

    const result = await this.importJson({
      activities,
      assetProfiles,
      isDryRun,
      tags
    });
    return { ...result, assetProfiles };
  }

  public async importXlsx({
    currency,
    file,
    isDryRun = false,
    platformName,
    selectedAccountId,
    userAccounts
  }: {
    currency: string;
    file: File;
    isDryRun?: boolean;
    platformName?: string;
    selectedAccountId: string;
    userAccounts: Account[];
  }) {
    const workbook = XLSX.read(await file.arrayBuffer(), {
      cellDates: true,
      type: 'array'
    });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!worksheet) {
      throw new Error('The workbook does not contain a worksheet');
    }

    const rows = this.getSpreadsheetRows(worksheet);
    const skippedRowsData: Record<string, unknown>[] = [];
    const pairedReinvestmentIndexes = new Set<number>();
    const preparedRows =
      platformName?.toLowerCase() === 'vanguard'
        ? rows.flatMap((row, index) => {
            if (String(row['Transaction type']).toLowerCase() !== 'dividend') {
              return [row];
            }

            const dividendAmount = this.parseSpreadsheetNumber(row.Amount);
            const dividendDate = this.formatSpreadsheetDate({
              primary: row['Trade date'],
              fallback: row['Settlement date']
            });
            const reinvestmentIndex = rows.findIndex(
              (candidate, candidateIndex) => {
                if (
                  candidateIndex === index ||
                  pairedReinvestmentIndexes.has(candidateIndex) ||
                  String(candidate['Transaction type']).toLowerCase() !==
                    'reinvestment' ||
                  candidate.Symbol !== row.Symbol
                ) {
                  return false;
                }

                const reinvestmentDate = this.formatSpreadsheetDate({
                  primary: candidate['Trade date'],
                  fallback: candidate['Settlement date']
                });
                const reinvestmentAmount = this.parseSpreadsheetNumber(
                  candidate.Amount
                );

                return (
                  dividendDate === reinvestmentDate &&
                  dividendAmount !== undefined &&
                  reinvestmentAmount === dividendAmount
                );
              }
            );

            if (reinvestmentIndex >= 0) {
              const reinvestment = rows[reinvestmentIndex];
              const quantity = this.parseSpreadsheetNumber(
                reinvestment.Quantity
              );

              if (quantity && dividendAmount !== undefined) {
                pairedReinvestmentIndexes.add(reinvestmentIndex);

                return [
                  {
                    ...row,
                    Price: dividendAmount / quantity,
                    Quantity: quantity
                  }
                ];
              }
            }

            return [row];
          })
        : rows;
    const supportedRows = preparedRows.flatMap((row) => {
      if (
        String(row['Transaction type']).toLowerCase() === 'reinvestment' &&
        pairedReinvestmentIndexes.has(rows.indexOf(row))
      ) {
        return [];
      }

      const transactionType = String(row['Transaction type']).toLowerCase();
      const type =
        transactionType === 'reinvestment' ? 'Buy' : row['Transaction type'];

      if (
        !['buy', 'sell', 'dividend', 'fee', 'interest', 'liability'].includes(
          String(type).toLowerCase()
        )
      ) {
        skippedRowsData.push({
          ...row,
          'Import issue': 'Unsupported transaction type'
        });
        return [];
      }

      const amount = this.parseSpreadsheetNumber(row.Amount);
      const price = this.parseSpreadsheetNumber(row.Price);
      const normalizedType = String(type).toLowerCase();
      const quantity =
        this.parseSpreadsheetNumber(row.Quantity) ??
        (['dividend', 'fee', 'interest', 'liability'].includes(normalizedType)
          ? 1
          : undefined);

      if (!quantity || (!price && !amount)) {
        skippedRowsData.push({
          ...row,
          'Import issue': 'Missing quantity, price, or amount'
        });
        return [];
      }

      const date = this.formatSpreadsheetDate({
        primary: row['Trade date'],
        fallback: row['Settlement date']
      });

      if (!date) {
        skippedRowsData.push({
          ...row,
          'Import issue': 'Missing or invalid date'
        });
        return [];
      }

      return [
        {
          Currency: currency,
          Date: date,
          Fee: this.parseSpreadsheetNumber(row['Commission & fees**']) ?? 0,
          Quantity: quantity,
          Symbol: row.Symbol ?? 'CASH',
          Type: type,
          UnitPrice: price ?? Math.abs(amount ?? 0)
        }
      ];
    });

    let rowsToImport = supportedRows;
    const draftRows: typeof supportedRows = [];
    let result:
      Awaited<ReturnType<ImportActivitiesService['importCsv']>> | undefined;

    while (rowsToImport.length > 0) {
      try {
        result = await this.importCsv({
          fileContent: XLSX.utils.sheet_to_csv(
            XLSX.utils.json_to_sheet(rowsToImport),
            { blankrows: false }
          ),
          isDryRun,
          selectedAccountId,
          userAccounts
        });

        break;
      } catch (error) {
        const unresolvableSymbol = this.getUnresolvableSymbol(error);

        if (!unresolvableSymbol) {
          throw error;
        }

        const filteredRows = rowsToImport.filter(({ Symbol }) => {
          return String(Symbol) !== unresolvableSymbol;
        });

        if (filteredRows.length === rowsToImport.length) {
          throw error;
        }

        draftRows.push(
          ...rowsToImport.filter(({ Symbol }) => {
            return String(Symbol) === unresolvableSymbol;
          })
        );
        rowsToImport = filteredRows;
      }
    }

    if (draftRows.length > 0) {
      const draftResult = await this.importCsv({
        activityTagIds: [TAG_ID_DRAFT],
        fileContent: XLSX.utils.sheet_to_csv(
          XLSX.utils.json_to_sheet(
            draftRows.map((row) => ({
              ...row,
              DataSource: DataSource.MANUAL
            }))
          ),
          { blankrows: false }
        ),
        isDryRun,
        selectedAccountId,
        tags: [{ id: TAG_ID_DRAFT, name: 'DRAFT' }],
        userAccounts
      });

      result = result
        ? {
            activities: [...result.activities, ...draftResult.activities],
            assetProfiles: [
              ...result.assetProfiles,
              ...draftResult.assetProfiles
            ]
          }
        : draftResult;
    }

    if (!result) {
      throw new Error('The workbook does not contain importable activities');
    }

    const skippedRows = skippedRowsData.length;

    return {
      ...result,
      skippedRows,
      skippedRowsFileContent: skippedRows
        ? XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(skippedRowsData), {
            blankrows: false
          })
        : undefined
    };
  }

  private formatSpreadsheetDate({
    fallback,
    primary
  }: {
    fallback: unknown;
    primary: unknown;
  }) {
    const value =
      typeof primary === 'string' && primary.trim().length > 0
        ? primary
        : fallback;

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());

      if (match) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    const parsedDate = parseDateHelper(String(value).trim());

    return parsedDate?.toISOString();
  }

  private getSpreadsheetRows(worksheet: XLSX.WorkSheet) {
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: ''
    });
    const headerRowIndex = rawRows.findIndex((row) => {
      const headers = new Set(
        row.map((value) => this.normalizeSpreadsheetHeader(value))
      );

      return (
        headers.has('symbol') &&
        headers.has('transactiontype') &&
        (headers.has('tradedate') || headers.has('settlementdate'))
      );
    });

    if (headerRowIndex < 0) {
      throw new Error(
        'The workbook does not contain a recognizable transaction header row'
      );
    }

    const headers = rawRows[headerRowIndex].map((value) => {
      return this.getSpreadsheetHeaderName(value);
    });

    return rawRows.slice(headerRowIndex + 1).map((row) => {
      return Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ''])
      );
    });
  }

  private getSpreadsheetHeaderName(value: unknown) {
    switch (this.normalizeSpreadsheetHeader(value)) {
      case 'commissionfees':
        return 'Commission & fees**';
      case 'amount':
        return 'Amount';
      case 'price':
        return 'Price';
      case 'quantity':
        return 'Quantity';
      case 'settlementdate':
        return 'Settlement date';
      case 'symbol':
        return 'Symbol';
      case 'tradedate':
        return 'Trade date';
      case 'transactiontype':
        return 'Transaction type';
      default:
        return String(value);
    }
  }

  private normalizeSpreadsheetHeader(value: unknown) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private getUnresolvableSymbol(error: unknown) {
    if (!error || typeof error !== 'object' || !('error' in error)) {
      return undefined;
    }

    const response = error.error;

    if (!response || typeof response !== 'object' || !('message' in response)) {
      return undefined;
    }

    const messages = Array.isArray(response.message)
      ? response.message
      : [response.message];

    for (const message of messages) {
      if (isString(message)) {
        const match =
          /activities\.\d+\.symbol \("([^"]+)"\) cannot be resolved/.exec(
            message
          );

        if (match) {
          return match[1];
        }
      }
    }

    return undefined;
  }

  private parseSpreadsheetNumber(value: unknown) {
    if (typeof value === 'number' && isFinite(value)) {
      return Math.abs(value);
    }

    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[$,]/g, ''));

      return isFinite(parsed) ? Math.abs(parsed) : undefined;
    }

    return undefined;
  }

  public importJson({
    accounts,
    activities,
    assetProfiles,
    isDryRun = false,
    platforms,
    selectedAccountId,
    tags
  }: {
    activities: CreateOrderDto[];
    accounts?: CreateAccountWithBalancesDto[];
    assetProfiles?: CreateAssetProfileWithMarketDataDto[];
    isDryRun?: boolean;
    platforms?: CreatePlatformDto[];
    selectedAccountId?: string;
    tags?: CreateTagDto[];
  }): Promise<{
    activities: Activity[];
  }> {
    return firstValueFrom(
      this.postImport(
        {
          accounts,
          activities: selectedAccountId
            ? activities.map((activity) => ({
                ...activity,
                accountId: selectedAccountId
              }))
            : activities,
          assetProfiles,
          platforms,
          tags
        },
        isDryRun
      )
    );
  }

  public importSelectedActivities({
    accounts,
    activities,
    assetProfiles,
    platforms,
    selectedAccountId,
    tags
  }: {
    accounts?: CreateAccountWithBalancesDto[];
    activities: Activity[];
    assetProfiles?: CreateAssetProfileWithMarketDataDto[];
    platforms?: CreatePlatformDto[];
    selectedAccountId?: string;
    tags?: CreateTagDto[];
  }): Promise<{
    activities: Activity[];
  }> {
    const importData = activities.map((activity) =>
      this.convertToCreateOrderDto(activity)
    );

    return this.importJson({
      accounts,
      assetProfiles,
      platforms,
      selectedAccountId,
      tags,
      activities: importData
    });
  }

  private convertToCreateOrderDto({
    accountId,
    assetProfile,
    comment,
    currency,
    date,
    fee,
    quantity,
    tags,
    type,
    unitPrice,
    updateAccountBalance
  }: Activity): CreateOrderDto {
    return {
      fee,
      quantity,
      type,
      unitPrice,
      updateAccountBalance,
      accountId: accountId ?? undefined,
      comment: comment ?? undefined,
      currency: currency ?? assetProfile.currency ?? '',
      dataSource: assetProfile.dataSource,
      date: date.toString(),
      symbol: assetProfile.symbol,
      tags: tags?.map(({ id }) => {
        return id;
      })
    };
  }

  private lowercaseKeys(
    aObject: Record<string, unknown>
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(aObject).map(([key, val]) => {
        return [key.toLowerCase(), val];
      })
    );
  }

  private parseAccount({
    item,
    userAccounts
  }: {
    item: Record<string, unknown>;
    userAccounts: Account[];
  }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.ACCOUNT_KEYS) {
      const value = item[key];

      if (isNumber(value) || isString(value)) {
        return userAccounts.find(({ id, name }) => {
          return (
            id === value || name?.toLowerCase() === String(value).toLowerCase()
          );
        })?.id;
      }
    }

    return undefined;
  }

  private parseComment({ item }: { item: Record<string, unknown> }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.COMMENT_KEYS) {
      const value = item[key];

      if (isNumber(value) || isString(value)) {
        return String(value);
      }
    }

    return undefined;
  }

  private parseCurrency({
    content,
    index,
    item
  }: {
    content: Record<string, unknown>[];
    index: number;
    item: Record<string, unknown>;
  }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.CURRENCY_KEYS) {
      const value = item[key];

      if (isString(value)) {
        return value;
      }
    }

    throw {
      activities: content,
      message: `activities.${index}.currency is not valid`
    };
  }

  private parseDataSource({ item }: { item: Record<string, unknown> }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.DATA_SOURCE_KEYS) {
      const value = item[key];

      if (isString(value)) {
        return DataSource[value.toUpperCase() as keyof typeof DataSource];
      }
    }

    return undefined;
  }

  private parseDate({
    content,
    index,
    item
  }: {
    content: Record<string, unknown>[];
    index: number;
    item: Record<string, unknown>;
  }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.DATE_KEYS) {
      const value = item[key];

      if (isNumber(value) || isString(value)) {
        try {
          const parsedDate = parseDateHelper(String(value));

          if (parsedDate) {
            return parsedDate.toISOString();
          }
        } catch {}
      }
    }

    throw {
      activities: content,
      message: `activities.${index}.date is not valid`
    };
  }

  private parseFee({
    content,
    index,
    item
  }: {
    content: Record<string, unknown>[];
    index: number;
    item: Record<string, unknown>;
  }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.FEE_KEYS) {
      const value = item[key];

      if (isNumber(value) && isFinite(value)) {
        return Math.abs(value);
      }
    }

    throw {
      activities: content,
      message: `activities.${index}.fee is not valid`
    };
  }

  private parseQuantity({
    content,
    index,
    item
  }: {
    content: Record<string, unknown>[];
    index: number;
    item: Record<string, unknown>;
  }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.QUANTITY_KEYS) {
      const value = item[key];

      if (isNumber(value) && isFinite(value)) {
        return Math.abs(value);
      }
    }

    throw {
      activities: content,
      message: `activities.${index}.quantity is not valid`
    };
  }

  private parseSymbol({
    content,
    index,
    item
  }: {
    content: Record<string, unknown>[];
    index: number;
    item: Record<string, unknown>;
  }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.SYMBOL_KEYS) {
      const value = item[key];

      if (isNumber(value) || isString(value)) {
        return String(value);
      }
    }

    throw {
      activities: content,
      message: `activities.${index}.symbol is not valid`
    };
  }

  private parseType({
    content,
    index,
    item
  }: {
    content: Record<string, unknown>[];
    index: number;
    item: Record<string, unknown>;
  }): ActivityType {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.TYPE_KEYS) {
      const value = item[key];

      if (isString(value)) {
        switch (value.toLowerCase()) {
          case 'buy':
            return 'BUY';
          case 'dividend':
            return 'DIVIDEND';
          case 'fee':
            return 'FEE';
          case 'interest':
            return 'INTEREST';
          case 'liability':
            return 'LIABILITY';
          case 'sell':
            return 'SELL';
          default:
            break;
        }
      }
    }

    throw {
      activities: content,
      message: `activities.${index}.type is not valid`
    };
  }

  private parseUnitPrice({
    content,
    index,
    item
  }: {
    content: Record<string, unknown>[];
    index: number;
    item: Record<string, unknown>;
  }) {
    item = this.lowercaseKeys(item);

    for (const key of ImportActivitiesService.UNIT_PRICE_KEYS) {
      const value = item[key];

      if (isNumber(value) && isFinite(value)) {
        return Math.abs(value);
      }
    }

    throw {
      activities: content,
      message: `activities.${index}.unitPrice is not valid`
    };
  }

  private postImport(
    aImportData: {
      accounts?: CreateAccountWithBalancesDto[];
      activities: CreateOrderDto[];
      assetProfiles?: CreateAssetProfileWithMarketDataDto[];
      platforms?: CreatePlatformDto[];
      tags?: CreateTagDto[];
    },
    aIsDryRun = false
  ) {
    return this.http.post<{ activities: Activity[] }>(
      `/api/v1/import?dryRun=${aIsDryRun}`,
      aImportData
    );
  }
}
