import { ImportActivitiesService } from '@ghostfolio/client/services/import-activities.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import {
  AI_ACTIVITIES_FILE_MAXIMUM_SIZE,
  AI_MAX_ACTIVITIES,
  DEFAULT_DATE_RANGE,
  TAG_ID_DRAFT
} from '@ghostfolio/common/config';
import {
  CreateAccountWithBalancesDto,
  CreateAssetProfileWithMarketDataDto,
  CreateOrderDto,
  CreatePlatformDto,
  CreateTagDto
} from '@ghostfolio/common/dtos';
import { downloadAsFile } from '@ghostfolio/common/helper';
import {
  Activity,
  AiActivityRow,
  PortfolioPosition
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { AssetClass } from '@ghostfolio/prisma/enums';
import { GfActivitiesTableComponent } from '@ghostfolio/ui/activities-table';
import { GfDialogFooterComponent } from '@ghostfolio/ui/dialog-footer';
import { GfDialogHeaderComponent } from '@ghostfolio/ui/dialog-header';
import {
  FileFormat,
  GfFileDropAreaComponent
} from '@ghostfolio/ui/file-drop-area';
import { GfPremiumIndicatorComponent } from '@ghostfolio/ui/premium-indicator';
import { DataService } from '@ghostfolio/ui/services';

import {
  StepperOrientation,
  StepperSelectionEvent
} from '@angular/cdk/stepper';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MatCheckboxChange,
  MatCheckboxModule
} from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef
} from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SortDirection } from '@angular/material/sort';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatTableDataSource } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { informationCircleOutline, warningOutline } from 'ionicons/icons';
import { isArray, sortBy } from 'lodash-es';
import ms from 'ms';
import { from, switchMap } from 'rxjs';

import { ImportStep } from './enums/import-step';
import {
  ImportActivitiesDialogParams,
  ImportActivitiesDialogResult
} from './interfaces/interfaces';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-flex flex-column h-100' },
  imports: [
    CommonModule,
    GfActivitiesTableComponent,
    GfDialogFooterComponent,
    GfDialogHeaderComponent,
    GfFileDropAreaComponent,
    GfPremiumIndicatorComponent,
    IonIcon,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatStepperModule,
    MatTooltipModule,
    ReactiveFormsModule
  ],
  selector: 'gf-import-activities-dialog',
  styleUrls: ['./import-activities-dialog.scss'],
  templateUrl: 'import-activities-dialog.html'
})
export class GfImportActivitiesDialogComponent {
  private static readonly FILE_FORMAT_CSV: FileFormat = {
    extensions: ['csv'],
    name: 'CSV',
    sampleUrl:
      'https://github.com/ghostfolio/ghostfolio/blob/main/test/import/ok/sample.csv'
  };

  private static readonly FILE_FORMAT_XLSX: FileFormat = {
    extensions: ['xlsx'],
    name: 'Excel'
  };

  private static readonly FILE_FORMAT_JSON: FileFormat = {
    extensions: ['json'],
    name: 'JSON',
    sampleUrl:
      'https://github.com/ghostfolio/ghostfolio/blob/main/test/import/ok/sample.json'
  };

  private static readonly FILE_FORMATS: FileFormat[] = [
    GfImportActivitiesDialogComponent.FILE_FORMAT_CSV,
    GfImportActivitiesDialogComponent.FILE_FORMAT_JSON,
    GfImportActivitiesDialogComponent.FILE_FORMAT_XLSX
  ];

  private static readonly FILE_FORMATS_OF_GHOSTFOLIO_AI: FileFormat[] = [
    GfImportActivitiesDialogComponent.FILE_FORMAT_CSV,
    { extensions: ['jpeg', 'jpg'], name: 'JPG' },
    { extensions: ['pdf'], name: 'PDF' },
    { extensions: ['png'], name: 'PNG' }
  ];

  private static readonly FILE_EXTENSIONS_OF_GHOSTFOLIO_AI =
    GfImportActivitiesDialogComponent.FILE_FORMATS_OF_GHOSTFOLIO_AI.flatMap(
      ({ extensions }) => {
        return extensions;
      }
    );

  private static readonly FILE_FORMATS_WITH_GHOSTFOLIO_AI = sortBy(
    [
      ...GfImportActivitiesDialogComponent.FILE_FORMATS_OF_GHOSTFOLIO_AI,
      GfImportActivitiesDialogComponent.FILE_FORMAT_JSON,
      GfImportActivitiesDialogComponent.FILE_FORMAT_XLSX
    ],
    ({ name }) => {
      return name;
    }
  );

  protected readonly assetProfileForm = new FormGroup({
    assetProfileIdentifier: new FormControl<PortfolioPosition | null>(null, {
      validators: [Validators.required]
    })
  });
  protected readonly accountForm = new FormGroup({
    accountId: new FormControl<string | null>(null, {
      validators: [Validators.required]
    })
  });
  protected readonly data =
    inject<ImportActivitiesDialogParams>(MAT_DIALOG_DATA);
  protected dataSource: MatTableDataSource<Activity>;
  protected details: any[] = [];
  protected duplicateRows = 0;
  protected dialogTitle = $localize`Import Activities`;
  protected errorMessages: string[] = [];
  protected readonly ghostfolioAiLoadingText = $localize`Ghostfolio AI is processing the file...`;
  protected readonly ghostfolioAiTooltip = $localize`The content of your file will be processed by third-party AI providers. Please remove any personal data before uploading.`;

  protected readonly hasPermissionToEnableGhostfolioAi = hasPermission(
    this.data.user?.permissions,
    permissions.enableGhostfolioAi
  );

  protected holdings: PortfolioPosition[] = [];
  protected importStep: ImportStep = ImportStep.UPLOAD_FILE;

  protected isGhostfolioAiEnabled =
    this.data.deviceType !== 'mobile' &&
    this.hasPermissionToEnableGhostfolioAi &&
    this.data.user?.settings?.isGhostfolioAiEnabled === true;

  protected isLoading = false;
  protected importedCount = 0;
  protected isMaxActivitiesOfGhostfolioAiReached = false;
  protected readonly isSubmitting = signal(false);
  protected readonly language = document.documentElement.lang;
  protected readonly maxActivitiesOfGhostfolioAi = AI_MAX_ACTIVITIES;
  protected mode: 'DIVIDEND';
  protected pageIndex = 0;
  protected readonly pageSize = 8;
  protected rowsWithoutMatch: AiActivityRow[] = [];
  protected skippedRows = 0;
  protected skippedRowsFileContent?: string;
  protected selectedActivities: Activity[] = [];
  protected readonly sortColumn = 'date';
  protected readonly sortDirection: SortDirection = 'desc';
  protected readonly stepperOrientation: StepperOrientation =
    this.data.deviceType === 'mobile' ? 'vertical' : 'horizontal';
  protected totalItems: number;

  private accounts: CreateAccountWithBalancesDto[] = [];
  private activities: Activity[] = [];
  private assetProfiles: CreateAssetProfileWithMarketDataDto[] = [];
  private hasChangedUserSettings = false;
  private hasImportedActivities = false;
  private isFidelityCsvImport = false;
  private platforms: CreatePlatformDto[] = [];
  private skippedRowsData: Record<string, unknown>[] = [];
  private sourceRowsByActivityId = new Map<string, Record<string, unknown>[]>();
  private tags: CreateTagDto[] = [];

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogRef =
    inject<
      MatDialogRef<
        GfImportActivitiesDialogComponent,
        ImportActivitiesDialogResult
      >
    >(MatDialogRef);
  private readonly importActivitiesService = inject(ImportActivitiesService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly userService = inject(UserService);

  public constructor() {
    addIcons({ informationCircleOutline, warningOutline });
  }

  protected get fileFormats() {
    return this.isGhostfolioAiEnabled
      ? GfImportActivitiesDialogComponent.FILE_FORMATS_WITH_GHOSTFOLIO_AI
      : GfImportActivitiesDialogComponent.FILE_FORMATS;
  }

  protected get selectedAccountId() {
    return this.accountForm.controls.accountId.value ?? undefined;
  }

  protected get isFidelityAccount() {
    return (
      this.data.user.accounts
        .find(({ id }) => id === this.selectedAccountId)
        ?.platform?.name?.trim()
        .toLowerCase() === 'fidelity'
    );
  }

  public ngOnInit() {
    // No takeUntilDestroyed(), the component is already destroyed here
    // The opener refreshes the user if withRefresh is true
    this.dialogRef.afterClosed().subscribe((result) => {
      if (this.hasChangedUserSettings && !result?.withRefresh) {
        this.userService.get(true).subscribe();
      }
    });

    if (
      this.data?.activityTypes?.length === 1 &&
      this.data?.activityTypes?.[0] === 'DIVIDEND'
    ) {
      this.isLoading = true;

      this.dialogTitle = $localize`Import Dividends`;
      this.mode = 'DIVIDEND';
      this.assetProfileForm.controls.assetProfileIdentifier.disable();

      this.dataService
        .fetchPortfolioHoldings({
          filters: [
            {
              id: AssetClass.EQUITY,
              type: 'ASSET_CLASS'
            },
            {
              id: AssetClass.FIXED_INCOME,
              type: 'ASSET_CLASS'
            },
            {
              id: 'ACTIVE',
              type: 'HOLDING_TYPE'
            }
          ],
          range: DEFAULT_DATE_RANGE
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ holdings }) => {
          this.holdings = sortBy(holdings, ({ assetProfile }) => {
            return assetProfile.name?.toLowerCase();
          });

          this.assetProfileForm.controls.assetProfileIdentifier.enable();

          this.isLoading = false;

          this.changeDetectorRef.markForCheck();
        });
    }
  }

  protected onCancel() {
    this.dialogRef.close({ withRefresh: this.hasImportedActivities });
  }

  protected async onImportActivities() {
    this.isSubmitting.set(true);

    try {
      this.snackBar.open('⏳ ' + $localize`Importing data...`);

      const { activities, skippedActivities = [] } =
        await this.importActivitiesService.importSelectedActivities({
          accounts: this.accounts,
          activities: this.selectedActivities,
          assetProfiles: this.assetProfiles,
          platforms: this.platforms,
          selectedAccountId: this.selectedAccountId,
          tags: this.isFidelityCsvImport
            ? this.tags.filter(({ id }) =>
                this.selectedActivities.some((activity) =>
                  activity.tags?.some((tag) => tag.id === id)
                )
              )
            : this.tags
        });

      this.hasImportedActivities ||= activities.length > 0;
      this.importedCount += activities.length;

      if (skippedActivities.length > 0 || this.duplicateRows > 0) {
        for (const activity of skippedActivities) {
          const selectedActivity =
            this.selectedActivities[activity.importIndex ?? -1];
          const sourceRows =
            selectedActivity &&
            (this.sourceRowsByActivityId.get(selectedActivity.id) ??
              (this.mode === 'DIVIDEND'
                ? [{ ...selectedActivity }]
                : undefined));

          if (!sourceRows) {
            throw new Error(
              'The skipped activity could not be matched to its source row'
            );
          }

          this.skippedRowsData.push(
            ...sourceRows.map((row) => ({
              ...row,
              'Import issue': 'Duplicate record'
            }))
          );
        }

        this.duplicateRows += skippedActivities.length;
        this.skippedRowsFileContent =
          this.importActivitiesService.getSkippedRowsCsv(this.skippedRowsData);
        const submittedIds = new Set(
          this.selectedActivities.map(({ id }) => id)
        );
        this.activities = this.activities.filter(
          ({ id }) => !submittedIds.has(id)
        );
        this.dataSource = new MatTableDataSource(this.activities);
        this.totalItems = this.activities.length;
        this.selectedActivities = [];
        this.isSubmitting.set(false);
        this.snackBar.dismiss();
        this.changeDetectorRef.markForCheck();
        return;
      }

      this.snackBar.open(
        '✅ ' + $localize`Import has been completed`,
        undefined,
        {
          duration: ms('3 seconds')
        }
      );
      this.dialogRef.close({ withRefresh: true });
    } catch (error) {
      console.error(error);
      const response: unknown =
        error instanceof HttpErrorResponse ? error.error : undefined;
      const responseMessage =
        response && typeof response === 'object' && 'message' in response
          ? response.message
          : undefined;
      const message = Array.isArray(responseMessage)
        ? responseMessage
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
        : responseMessage;
      this.snackBar.open(
        typeof message === 'string' && message.trim()
          ? message
          : $localize`Oops! Something went wrong.` +
              ' ' +
              $localize`Please try again later.`,
        $localize`Okay`,
        {
          duration: ms('3 seconds')
        }
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected onFileSelected({
    file,
    stepper
  }: {
    file: File;
    stepper: MatStepper;
  }) {
    if (this.importStep !== ImportStep.UPLOAD_FILE) {
      return;
    }

    if (!this.accountForm.valid) {
      this.snackBar.open(
        $localize`Please select an account first.`,
        undefined,
        {
          duration: ms('3 seconds')
        }
      );

      return;
    }

    this.handleFile({ file, stepper });
  }

  protected onGhostfolioAiChange({ checked }: MatCheckboxChange) {
    this.hasChangedUserSettings = true;
    this.isGhostfolioAiEnabled = checked;

    this.dataService
      .putUserSetting({ isGhostfolioAiEnabled: checked })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  protected onImportStepChange(event: StepperSelectionEvent) {
    if (event.selectedIndex === ImportStep.UPLOAD_FILE) {
      this.importStep = ImportStep.UPLOAD_FILE;
    } else if (event.selectedIndex === ImportStep.SELECT_ACTIVITIES) {
      this.importStep = ImportStep.SELECT_ACTIVITIES;
    }
  }

  protected onLoadDividends(aStepper: MatStepper) {
    this.assetProfileForm.controls.assetProfileIdentifier.disable();

    const { dataSource, symbol } =
      this.assetProfileForm.controls.assetProfileIdentifier.value
        ?.assetProfile ?? {};

    if (!dataSource || !symbol) {
      return;
    }

    this.dataService
      .fetchDividendsImport({
        dataSource,
        symbol
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ activities }) => {
        this.activities = activities;
        this.dataSource = new MatTableDataSource(activities.reverse());
        this.pageIndex = 0;
        this.totalItems = activities.length;

        aStepper.next();

        this.changeDetectorRef.markForCheck();
      });
  }

  protected onPageChanged({ pageIndex }: PageEvent) {
    this.pageIndex = pageIndex;
  }

  protected onReset(aStepper: MatStepper) {
    this.details = [];
    this.duplicateRows = 0;
    this.importedCount = 0;
    this.isFidelityCsvImport = false;
    this.errorMessages = [];
    this.importStep = ImportStep.SELECT_ACTIVITIES;
    this.isMaxActivitiesOfGhostfolioAiReached = false;
    this.pageIndex = 0;
    this.rowsWithoutMatch = [];
    this.skippedRows = 0;
    this.skippedRowsFileContent = undefined;
    this.skippedRowsData = [];
    this.sourceRowsByActivityId.clear();
    this.assetProfileForm.controls.assetProfileIdentifier.enable();

    aStepper.reset();
  }

  protected updateSelection(activities: Activity[]) {
    const availableIds = new Set(this.activities.map(({ id }) => id));
    this.selectedActivities = activities.filter(({ error, id }) => {
      return !error && availableIds.has(id);
    });
  }

  /**
   * Gives the activities of a CSV file in the format of Ghostfolio, which is
   * imported without Ghostfolio AI, or undefined for any other CSV file
   */
  private async getActivitiesOfCsvInGhostfolioFormat(file: File) {
    this.snackBar.open('⏳ ' + $localize`Validating data...`);

    try {
      return await this.importActivitiesService.importCsv({
        fileContent: await file.text(),
        isDryRun: true,
        selectedAccountId: this.selectedAccountId,
        userAccounts: this.data.user.accounts
      });
    } catch {
      return undefined;
    } finally {
      this.snackBar.dismiss();
    }
  }

  /**
   * Gives the error message of a file which the server rejects, as a rejected
   * file counts towards the weekly limit of Ghostfolio AI
   */
  private async getErrorMessageOfFileForGhostfolioAi({
    file,
    fileExtension
  }: {
    file: File;
    fileExtension?: string;
  }) {
    if (file.size > AI_ACTIVITIES_FILE_MAXIMUM_SIZE) {
      return $localize`The file is larger than ${AI_ACTIVITIES_FILE_MAXIMUM_SIZE / 1024 / 1024}:maxFileSize: MB`;
    }

    if (
      fileExtension === 'csv' &&
      this.importActivitiesService.getDataRowCountOfCsv(await file.text()) >
        AI_MAX_ACTIVITIES
    ) {
      return $localize`The CSV file has more than ${AI_MAX_ACTIVITIES}:maxActivities: rows of activities`;
    }

    return undefined;
  }

  private async handleFile({
    file,
    stepper
  }: {
    file: File;
    stepper: MatStepper;
  }) {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    this.details = [];
    this.duplicateRows = 0;
    this.importedCount = 0;
    this.errorMessages = [];
    this.isMaxActivitiesOfGhostfolioAiReached = false;
    this.rowsWithoutMatch = [];
    this.skippedRows = 0;
    this.skippedRowsFileContent = undefined;
    this.skippedRowsData = [];
    this.sourceRowsByActivityId.clear();
    this.isFidelityCsvImport = false;

    const selectedAccountId = this.selectedAccountId;
    if (
      fileExtension === 'csv' &&
      this.isFidelityAccount &&
      selectedAccountId
    ) {
      this.isFidelityCsvImport = true;
      this.snackBar.open('⏳ ' + $localize`Validating data...`);

      try {
        const {
          activities,
          assetProfiles,
          skippedRows,
          skippedRowsData,
          sourceRows,
          tags
        } = await this.importActivitiesService.importFidelityCsv({
          fileContent: await file.text(),
          isDryRun: true,
          selectedAccountId,
          userAccounts: this.data.user.accounts,
          userTags: this.data.user.tags ?? []
        });

        this.setImportPreview({ activities, skippedRowsData, sourceRows });
        this.assetProfiles = assetProfiles;
        this.tags = tags;
        this.skippedRows = skippedRows;
        this.dataSource = new MatTableDataSource(activities.reverse());
        this.pageIndex = 0;
        this.totalItems = activities.length;
      } catch (error) {
        console.error(error);
        this.handleImportError({
          activities: [],
          error
        });
      } finally {
        this.snackBar.dismiss();
        this.showSelectActivitiesStep(stepper);
      }

      return;
    }

    if (fileExtension === 'xlsx') {
      this.snackBar.open('⏳ ' + $localize`Validating data...`);

      try {
        const {
          activities,
          assetProfiles,
          relatedSourceRows,
          skippedRows,
          skippedRowsData,
          sourceRows
        } = await this.importActivitiesService.importXlsx({
          file,
          isDryRun: true,
          currency: this.data.user.settings.baseCurrency ?? 'USD',
          platformName:
            this.data.user.accounts.find(
              ({ id }) => id === this.accountForm.controls.accountId.value
            )?.platform?.name ?? undefined,
          selectedAccountId: this.accountForm.controls.accountId.value!,
          userAccounts: this.data.user.accounts
        });

        this.setImportPreview({
          activities,
          relatedSourceRows,
          skippedRowsData,
          sourceRows
        });
        this.assetProfiles = assetProfiles;
        this.tags = [{ id: TAG_ID_DRAFT, name: 'DRAFT' }];
        this.skippedRows = skippedRows;
        this.dataSource = new MatTableDataSource(activities.reverse());
        this.pageIndex = 0;
        this.totalItems = activities.length;
      } catch (error) {
        console.error(error);
        this.handleImportError({
          activities: error?.error?.activities ?? [],
          error
        });
      } finally {
        this.snackBar.dismiss();
        this.showSelectActivitiesStep(stepper);
      }

      return;
    }

    if (
      this.isGhostfolioAiEnabled &&
      GfImportActivitiesDialogComponent.FILE_EXTENSIONS_OF_GHOSTFOLIO_AI.includes(
        fileExtension ?? ''
      )
    ) {
      void this.handleFileWithGhostfolioAi({ file, fileExtension, stepper });

      return;
    }

    this.snackBar.open('⏳ ' + $localize`Validating data...`);

    // Setting up the reader
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');

    reader.onload = async (readerEvent) => {
      const fileContent = readerEvent.target?.result as string;

      try {
        if (fileExtension === 'json') {
          const content = JSON.parse(fileContent);

          this.accounts = content.accounts;
          this.assetProfiles = content.assetProfiles;
          this.platforms = content.platforms;
          this.tags = content.tags;

          if (!isArray(content.activities)) {
            if (isArray(content.orders)) {
              this.handleImportError({
                activities: [],
                error: {
                  error: {
                    message: [`orders needs to be renamed to activities`]
                  }
                }
              });
              return;
            } else {
              throw new Error();
            }
          }

          content.activities = content.activities.map((activity) => {
            if (activity.id) {
              delete activity.id;
            }

            return activity;
          });

          try {
            const { activities } =
              await this.importActivitiesService.importJson({
                accounts: content.accounts,
                activities: content.activities,
                assetProfiles: content.assetProfiles,
                isDryRun: true,
                platforms: content.platforms,
                selectedAccountId: this.selectedAccountId,
                tags: content.tags
              });

            this.setImportPreview({
              activities,
              sourceRows: content.activities
            });
            this.dataSource = new MatTableDataSource(activities.reverse());
            this.pageIndex = 0;
            this.totalItems = activities.length;
          } catch (error) {
            console.error(error);
            this.handleImportError({ error, activities: content.activities });
          }

          return;
        } else if (fileExtension === 'csv') {
          const content = fileContent.split('\n').slice(1);

          try {
            const { activities, assetProfiles, sourceRows } =
              await this.importActivitiesService.importCsv({
                fileContent,
                isDryRun: true,
                selectedAccountId: this.selectedAccountId,
                userAccounts: this.data.user.accounts
              });

            this.setImportPreview({ activities, sourceRows });
            this.assetProfiles = assetProfiles;
            this.dataSource = new MatTableDataSource(activities.reverse());
            this.pageIndex = 0;
            this.totalItems = activities.length;
          } catch (error) {
            console.error(error);
            this.handleImportError({
              activities: error?.activities ?? content,
              error: {
                error: { message: error?.error?.message ?? [error?.message] }
              }
            });
          }

          return;
        }

        throw new Error();
      } catch (error) {
        console.error(error);
        this.handleImportError({
          activities: [],
          error: { error: { message: ['Unexpected format'] } }
        });
      } finally {
        this.snackBar.dismiss();
        this.showSelectActivitiesStep(stepper);
      }
    };
  }

  /**
   * Reads the file with Ghostfolio AI, except a CSV file in the format of
   * Ghostfolio. The request is canceled if the dialog is closed, which stops
   * the models on the server.
   */
  private async handleFileWithGhostfolioAi({
    file,
    fileExtension,
    stepper
  }: {
    file: File;
    fileExtension?: string;
    stepper: MatStepper;
  }) {
    this.accounts = [];
    this.activities = [];
    this.assetProfiles = [];
    this.platforms = [];
    this.tags = [];

    if (fileExtension === 'csv') {
      const csvInGhostfolioFormat =
        await this.getActivitiesOfCsvInGhostfolioFormat(file);

      if (csvInGhostfolioFormat) {
        const { activities, assetProfiles, sourceRows } = csvInGhostfolioFormat;

        this.setImportPreview({ activities, sourceRows });
        this.assetProfiles = assetProfiles;
        this.dataSource = new MatTableDataSource(activities.reverse());
        this.pageIndex = 0;
        this.totalItems = activities.length;

        this.showSelectActivitiesStep(stepper);

        return;
      }
    }

    const errorMessage = await this.getErrorMessageOfFileForGhostfolioAi({
      file,
      fileExtension
    });

    if (errorMessage) {
      this.handleImportError({
        activities: [],
        error: { error: { message: [errorMessage] } }
      });

      this.showSelectActivitiesStep(stepper);

      return;
    }

    this.isLoading = true;
    this.changeDetectorRef.markForCheck();

    let activitiesOfFile: CreateOrderDto[] = [];

    this.dataService
      .postAiActivities(file)
      .pipe(
        switchMap(({ activities, assetProfiles, rowsWithoutMatch }) => {
          activitiesOfFile = activities;
          this.assetProfiles = assetProfiles;
          this.isMaxActivitiesOfGhostfolioAiReached =
            activities.length + rowsWithoutMatch.length >= AI_MAX_ACTIVITIES;
          this.rowsWithoutMatch = rowsWithoutMatch;

          return from(
            this.importActivitiesService.importJson({
              activities,
              assetProfiles,
              isDryRun: true,
              selectedAccountId: this.selectedAccountId
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        error: (error: HttpErrorResponse) => {
          console.error(error);

          const { message } = (error.error ?? {}) as { message?: unknown };

          this.handleImportError({
            activities: activitiesOfFile,
            error: {
              error: {
                message: isArray(message)
                  ? message
                  : [
                      $localize`Oops! Something went wrong.` +
                        ' ' +
                        $localize`Please try again later.`
                    ]
              }
            }
          });

          this.isLoading = false;
          this.showSelectActivitiesStep(stepper);
        },
        next: ({ activities }) => {
          this.setImportPreview({
            activities,
            sourceRows: activitiesOfFile.map((activity) => ({ ...activity }))
          });
          this.dataSource = new MatTableDataSource(activities.reverse());
          this.pageIndex = 0;
          this.totalItems = activities.length;

          this.isLoading = false;
          this.showSelectActivitiesStep(stepper);
        }
      });
  }

  protected downloadSkippedRows() {
    if (!this.skippedRowsFileContent) {
      return;
    }

    downloadAsFile({
      content: this.skippedRowsFileContent,
      contentType: 'text/csv',
      fileName: 'ghostfolio-skipped-import-rows.csv',
      format: 'string'
    });
  }

  private setImportPreview({
    activities,
    relatedSourceRows = {},
    skippedRowsData = [],
    sourceRows
  }: {
    activities: Activity[];
    relatedSourceRows?: Record<number, Record<string, unknown>[]>;
    skippedRowsData?: Record<string, unknown>[];
    sourceRows: Record<string, unknown>[];
  }) {
    this.activities = activities;
    this.skippedRowsData = [...skippedRowsData];
    this.sourceRowsByActivityId.clear();

    for (const activity of activities) {
      const sourceRow = sourceRows[activity.importIndex ?? -1];

      if (!sourceRow) {
        throw new Error(
          'The imported activity could not be matched to its source row'
        );
      }

      const sourceRowsForActivity = [
        sourceRow,
        ...(relatedSourceRows[activity.importIndex ?? -1] ?? [])
      ];
      this.sourceRowsByActivityId.set(activity.id, sourceRowsForActivity);

      if (activity.error?.code === 'IS_DUPLICATE') {
        this.duplicateRows++;
        this.skippedRowsData.push(
          ...sourceRowsForActivity.map((row) => ({
            ...row,
            'Import issue': 'Duplicate record'
          }))
        );
      }
    }

    this.skippedRowsFileContent = this.skippedRowsData.length
      ? this.importActivitiesService.getSkippedRowsCsv(this.skippedRowsData)
      : undefined;
  }

  private handleImportError({
    activities,
    error
  }: {
    activities: any[];
    error: unknown;
  }) {
    const response =
      error && typeof error === 'object' && 'error' in error
        ? error.error
        : undefined;
    const responseMessage =
      response && typeof response === 'object' && 'message' in response
        ? response.message
        : undefined;
    const messages = Array.isArray(responseMessage)
      ? responseMessage
      : [responseMessage];
    this.errorMessages = messages.filter(
      (message): message is string =>
        typeof message === 'string' && message.trim().length > 0
    );

    if (this.errorMessages.length === 0) {
      this.errorMessages = [
        error instanceof Error && error.message
          ? error.message
          : $localize`Oops! Something went wrong. Please try again later.`
      ];
    }

    this.activities = [];
    this.selectedActivities = [];
    this.dataSource = new MatTableDataSource<Activity>([]);
    this.totalItems = 0;
    this.details = [];

    for (const message of this.errorMessages) {
      if (message.includes('activities.')) {
        let [index] = message.split(' ');
        index = index.replace('activities.', '');
        [index] = index.split('.');

        this.details.push(activities[index]);
      } else {
        this.details.push('');
      }
    }

    this.changeDetectorRef.markForCheck();
  }

  private showSelectActivitiesStep(stepper: MatStepper) {
    this.importStep = ImportStep.SELECT_ACTIVITIES;
    this.updateSelection(this.activities);

    stepper.next();

    this.changeDetectorRef.markForCheck();
  }
}
