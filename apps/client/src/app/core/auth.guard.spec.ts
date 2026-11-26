import { SettingsStorageService } from '@ghostfolio/client/services/settings-storage.service';
import { TokenStorageService } from '@ghostfolio/client/services/token-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { DataService } from '@ghostfolio/ui/services';

import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot
} from '@angular/router';
import { of } from 'rxjs';

import { AuthGuard } from './auth.guard';

jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));

describe('AuthGuard administrator switching', () => {
  it('does not overwrite the target language with the browser language', async () => {
    const putUserSetting = jest.fn();
    const originalLanguage = document.documentElement.lang;
    document.documentElement.lang = 'en';
    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: DataService, useValue: { putUserSetting } },
        { provide: SettingsStorageService, useValue: {} },
        {
          provide: TokenStorageService,
          useValue: { getSwitchedUserId: () => 'target' }
        },
        {
          provide: UserService,
          useValue: {
            get: () => of({ settings: { language: 'fr', viewMode: 'DEFAULT' } })
          }
        },
        { provide: Router, useValue: { navigate: jest.fn() } }
      ]
    });

    try {
      await expect(
        TestBed.inject(AuthGuard).canActivate(
          { queryParams: {} } as ActivatedRouteSnapshot,
          { url: '/home' } as RouterStateSnapshot
        )
      ).resolves.toBe(true);
      expect(putUserSetting).not.toHaveBeenCalled();
    } finally {
      document.documentElement.lang = originalLanguage;
    }
  });
});
