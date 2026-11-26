import { Service } from '@angular/core';

import { KEY_TOKEN } from './settings-storage.service';

const KEY_SWITCHED_TOKEN = 'adminSwitchedToken';
const KEY_SWITCHED_USER = 'adminSwitchedUser';

@Service()
export class TokenStorageService {
  public getToken(): string | null {
    return (
      window.sessionStorage.getItem(KEY_SWITCHED_TOKEN) ?? this.getLoginToken()
    );
  }

  public getLoginToken(): string | null {
    return (
      window.sessionStorage.getItem(KEY_TOKEN) ??
      window.localStorage.getItem(KEY_TOKEN)
    );
  }

  public getSwitchedUserId(): string | null {
    return window.sessionStorage.getItem(KEY_SWITCHED_USER);
  }

  public setSwitchedUser(userId: string, token: string) {
    window.sessionStorage.setItem(KEY_SWITCHED_USER, userId);
    window.sessionStorage.setItem(KEY_SWITCHED_TOKEN, token);
  }

  public clearSwitchedUser() {
    window.sessionStorage.removeItem(KEY_SWITCHED_USER);
    window.sessionStorage.removeItem(KEY_SWITCHED_TOKEN);
  }

  public saveToken(token: string, staySignedIn = false) {
    this.clearSwitchedUser();

    if (staySignedIn) {
      window.localStorage.setItem(KEY_TOKEN, token);
    }

    window.sessionStorage.setItem(KEY_TOKEN, token);
  }
}
