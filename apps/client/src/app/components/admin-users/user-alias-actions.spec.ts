import { GfUserAliasDialogComponent } from '@ghostfolio/client/components/user-alias-dialog/user-alias-dialog.component';
import { GfUserDetailDialogComponent } from '@ghostfolio/client/components/user-detail-dialog/user-detail-dialog.component';
import { AdminUsersResponse } from '@ghostfolio/common/interfaces';

import '@angular/localize/init';
import { of } from 'rxjs';

import { GfAdminUsersComponent } from './admin-users.component';

jest.mock(
  '@ghostfolio/client/components/user-alias-dialog/user-alias-dialog.component',
  () => ({
    GfUserAliasDialogComponent: class {}
  })
);
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));
jest.mock('@ghostfolio/ui/notifications', () => ({
  NotificationService: class {}
}));
jest.mock('@ghostfolio/ui/services', () => ({
  AdminService: class {},
  DataService: class {}
}));
jest.mock('@ghostfolio/ui/value', () => ({ GfValueComponent: class {} }));
jest.mock('@ghostfolio/ui/premium-indicator', () => ({
  GfPremiumIndicatorComponent: class {}
}));
jest.mock('@ionic/angular/standalone', () => ({ IonIcon: class {} }));

describe('admin alias edit actions', () => {
  it('opens the editor for the selected user and refreshes the list on save', () => {
    const fetchUsers = jest.fn();
    const dialog = {
      open: jest.fn().mockReturnValue({ afterClosed: () => of(true) })
    };
    const component = Object.assign(
      Object.create(GfAdminUsersComponent.prototype),
      {
        destroyRef: { onDestroy: jest.fn() },
        dialog,
        fetchUsers,
        paginator: () => ({ pageIndex: 2 }),
        user: { id: 'admin' }
      }
    ) as GfAdminUsersComponent;

    component['onEditAlias']({
      alias: 'Family',
      id: 'target'
    } as AdminUsersResponse['users'][0]);

    expect(dialog.open).toHaveBeenCalledWith(
      GfUserAliasDialogComponent,
      expect.objectContaining({
        data: { alias: 'Family', currentUserId: 'admin', userId: 'target' }
      })
    );
    expect(fetchUsers).toHaveBeenCalledWith({
      pageIndex: 2,
      showLoading: false
    });
  });

  it('opens the same editor from user details and reloads the detail on save', () => {
    const initialize = jest.fn();
    const dialog = {
      open: jest.fn().mockReturnValue({ afterClosed: () => of(true) })
    };
    const component = Object.assign(
      Object.create(GfUserDetailDialogComponent.prototype),
      {
        data: { currentUserId: 'admin', userId: 'target' },
        destroyRef: { onDestroy: jest.fn() },
        dialog,
        initialize,
        user: { alias: 'Family' }
      }
    ) as GfUserDetailDialogComponent;

    component['editAlias']();

    expect(dialog.open).toHaveBeenCalledWith(
      GfUserAliasDialogComponent,
      expect.objectContaining({
        data: { alias: 'Family', currentUserId: 'admin', userId: 'target' }
      })
    );
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
