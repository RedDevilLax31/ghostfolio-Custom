import { KEY_TOKEN } from './settings-storage.service';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService administrator switching', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    service = new TokenStorageService();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('keeps the admin login separate and restores it on return', () => {
    service.saveToken('admin-token', true);
    service.setSwitchedUser('target', 'switched-token');

    expect(service.getToken()).toBe('switched-token');
    expect(service.getLoginToken()).toBe('admin-token');
    expect(window.localStorage.getItem(KEY_TOKEN)).toBe('admin-token');
    expect(service.getSwitchedUserId()).toBe('target');

    service.clearSwitchedUser();
    expect(service.getToken()).toBe('admin-token');
    expect(service.getSwitchedUserId()).toBeNull();
  });

  it('clears a switched session on a new login', () => {
    service.saveToken('admin-token');
    service.setSwitchedUser('target', 'switched-token');
    service.saveToken('new-login');

    expect(service.getToken()).toBe('new-login');
    expect(service.getSwitchedUserId()).toBeNull();
  });
});
