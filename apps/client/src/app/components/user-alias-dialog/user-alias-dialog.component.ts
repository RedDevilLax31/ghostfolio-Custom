import { UserService } from '@ghostfolio/client/services/user/user.service';
import { USER_ALIAS_MAXIMUM_LENGTH } from '@ghostfolio/common/config';
import { NotificationService } from '@ghostfolio/ui/notifications';
import { AdminService } from '@ghostfolio/ui/services';

import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface UserAliasDialogParams {
  alias: string | null;
  currentUserId: string;
  userId: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  selector: 'gf-user-alias-dialog',
  templateUrl: './user-alias-dialog.html'
})
export class GfUserAliasDialogComponent {
  protected readonly data = inject<UserAliasDialogParams>(MAT_DIALOG_DATA);
  protected readonly aliasControl = new FormControl(this.data.alias ?? '', {
    nonNullable: true,
    validators: [
      (control: AbstractControl<string>) => {
        const value = control.value.trim();

        if (value.includes('\0')) {
          return { invalidCharacter: true };
        }

        return Array.from(value).length > USER_ALIAS_MAXIMUM_LENGTH
          ? { maxlength: true }
          : null;
      }
    ]
  });
  protected errorMessage: string | undefined;
  protected isSaving = false;

  private readonly adminService = inject(AdminService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogRef =
    inject<MatDialogRef<GfUserAliasDialogComponent, boolean>>(MatDialogRef);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  protected save() {
    if (this.aliasControl.invalid || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = undefined;
    this.dialogRef.disableClose = true;
    this.adminService
      .updateUserAlias({
        alias: this.aliasControl.value.trim(),
        id: this.data.userId
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.data.userId === this.data.currentUserId) {
            this.userService
              .get(true)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: () => this.dialogRef.close(true),
                error: () => {
                  this.notificationService.alert({
                    title: $localize`Alias saved`,
                    message: $localize`Unable to refresh your account. Reload the page to see the updated alias.`
                  });
                  this.dialogRef.close(true);
                }
              });
          } else {
            this.dialogRef.close(true);
          }
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage =
            error.status === 409
              ? $localize`This alias is already in use.`
              : $localize`Unable to save the alias. Please try again.`;
          this.isSaving = false;
          this.dialogRef.disableClose = false;
          this.changeDetectorRef.markForCheck();
        }
      });
  }
}
