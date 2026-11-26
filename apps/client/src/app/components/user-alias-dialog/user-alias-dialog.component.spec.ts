import { UserService } from '@ghostfolio/client/services/user/user.service';
import { NotificationService } from '@ghostfolio/ui/notifications';
import { AdminService } from '@ghostfolio/ui/services';

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';

import { GfUserAliasDialogComponent } from './user-alias-dialog.component';

jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));
jest.mock('@ghostfolio/ui/notifications', () => ({
  NotificationService: class {}
}));
jest.mock('@ghostfolio/ui/services', () => ({
  AdminService: class {}
}));

describe('user alias dialog', () => {
  const adminService = { updateUserAlias: jest.fn() };
  const userService = { get: jest.fn() };
  const dialogRef = { close: jest.fn(), disableClose: false };
  const notifications = { alert: jest.fn() };
  const data = { alias: 'Old name', currentUserId: 'admin', userId: 'target' };

  beforeEach(() => {
    jest.clearAllMocks();
    dialogRef.disableClose = false;
    data.userId = 'target';
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: UserService, useValue: userService },
        { provide: NotificationService, useValue: notifications },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    });
  });

  async function createDialog() {
    const fixture = TestBed.createComponent(GfUserAliasDialogComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input');
    const form = element.querySelector('form');

    if (!input || !form) {
      throw new Error('Alias form was not rendered');
    }

    return { element, fixture, form, input };
  }

  it('trims and saves an alias, blocking duplicate submissions', async () => {
    const response = new Subject<void>();
    adminService.updateUserAlias.mockReturnValue(response);
    const { fixture, form, input } = await createDialog();

    input.value = '  Alice  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit'));
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(adminService.updateUserAlias).toHaveBeenCalledTimes(1);
    expect(adminService.updateUserAlias).toHaveBeenCalledWith({
      alias: 'Alice',
      id: 'target'
    });
    expect(dialogRef.disableClose).toBe(true);

    response.next();
    await fixture.whenStable();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('clears aliases and refreshes the current user after self-editing', async () => {
    data.userId = 'admin';
    adminService.updateUserAlias.mockReturnValue(of(undefined));
    userService.get.mockReturnValue(of({}));
    const { fixture, form, input } = await createDialog();
    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(adminService.updateUserAlias).toHaveBeenCalledWith({
      alias: '',
      id: 'admin'
    });
    expect(userService.get).toHaveBeenCalledWith(true);
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('rejects long aliases and reports duplicate conflicts', async () => {
    adminService.updateUserAlias.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 }))
    );
    const { element, fixture, form, input } = await createDialog();
    input.value = '😀'.repeat(26);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(adminService.updateUserAlias).not.toHaveBeenCalled();

    input.value = 'Existing';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'already in use'
    );
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(dialogRef.disableClose).toBe(false);
  });
});
