import { LayoutService } from '@ghostfolio/client/core/layout.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { SettingsStorageService } from '@ghostfolio/client/services/settings-storage.service';
import { TokenStorageService } from '@ghostfolio/client/services/token-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { GF_ENVIRONMENT } from '@ghostfolio/ui/environment';
import { NotificationService } from '@ghostfolio/ui/notifications';
import { DataService } from '@ghostfolio/ui/services';

import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { GfHeaderComponent } from './header.component';

jest.mock(
  '@ghostfolio/client/components/login-with-access-token-dialog/login-with-access-token-dialog.component',
  () => ({
    GfLoginWithAccessTokenDialogComponent: class {}
  })
);
jest.mock('@ghostfolio/client/core/layout.service', () => ({
  LayoutService: class {}
}));
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));
jest.mock('@ghostfolio/ui/assistant/assistant.component', () => ({
  GfAssistantComponent: class {}
}));
jest.mock('@ghostfolio/ui/logo', () => ({ GfLogoComponent: class {} }));
jest.mock('@ghostfolio/ui/premium-indicator', () => ({
  GfPremiumIndicatorComponent: class {}
}));
jest.mock('@ghostfolio/ui/notifications', () => ({
  NotificationService: class {}
}));
jest.mock('@ghostfolio/ui/services', () => ({ DataService: class {} }));
jest.mock('@ionic/angular/standalone', () => ({ IonIcon: class {} }));

describe('switched user header alias', () => {
  it('uses the matching account alias and falls back without showing stale data', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: GF_ENVIRONMENT, useValue: { production: true } },
        { provide: LayoutService, useValue: {} },
        {
          provide: ImpersonationStorageService,
          useValue: { onChangeHasImpersonation: () => of(null) }
        },
        { provide: SettingsStorageService, useValue: {} },
        {
          provide: TokenStorageService,
          useValue: {
            getSwitchedUserId: () => 'target-123456',
            getToken: () => ''
          }
        },
        { provide: UserService, useValue: { hasFilters: () => false } },
        { provide: MatDialog, useValue: {} },
        { provide: DataService, useValue: {} },
        { provide: NotificationService, useValue: {} }
      ]
    }).overrideComponent(GfHeaderComponent, {
      set: {
        imports: [
          MatBadgeModule,
          MatButtonModule,
          MatMenuModule,
          MatToolbarModule,
          RouterModule
        ],
        schemas: [NO_ERRORS_SCHEMA]
      }
    });

    const fixture = TestBed.createComponent(GfHeaderComponent);
    for (const [name, value] of Object.entries({
      currentRoute: '',
      deviceType: 'desktop',
      hasPermissionToChangeDateRange: false,
      hasPermissionToChangeFilters: false,
      hasPromotion: false,
      hasTabs: false,
      info: undefined,
      pageTitle: 'Overview',
      user: undefined
    })) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.autoDetectChanges();
    await fixture.whenStable();

    const label = () => {
      const element = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLElement>('.switched-user-id');

      if (!element) {
        throw new Error('Switched user label was not rendered');
      }

      return element;
    };
    expect(label().textContent).toContain('target-1');
    expect(label().title).toBe('target-123456');

    fixture.componentRef.setInput('user', {
      alias: 'Stale admin alias',
      id: 'admin',
      permissions: []
    });
    await fixture.whenStable();
    expect(label().textContent).not.toContain('Stale admin alias');
    expect(label().textContent).toContain('target-1');

    fixture.componentRef.setInput('user', {
      alias: 'Family portfolio',
      id: 'target-123456',
      permissions: []
    });
    await fixture.whenStable();
    expect(label().textContent).toContain('Family portfolio');
    expect(label().title).toBe('Family portfolio (target-123456)');

    fixture.componentRef.setInput('user', {
      alias: null,
      id: 'target-123456',
      permissions: []
    });
    await fixture.whenStable();
    expect(label().textContent).toContain('target-1');
  });
});
