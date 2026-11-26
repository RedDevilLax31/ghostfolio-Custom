import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { TokenStorageService } from '@ghostfolio/client/services/token-storage.service';
import { HEADER_KEY_IMPERSONATION } from '@ghostfolio/common/config';

import { HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor administrator switching', () => {
  const tokens = {
    getSwitchedUserId: jest.fn(),
    getToken: jest.fn()
  };
  const impersonation = { getId: jest.fn() };
  const next = { handle: jest.fn() };

  beforeEach(() => {
    tokens.getToken.mockReturnValue('credential');
    impersonation.getId.mockReturnValue('shared-access');
    next.handle.mockReturnValue(of(new HttpResponse()));
    TestBed.configureTestingModule({
      providers: [
        AuthInterceptor,
        { provide: TokenStorageService, useValue: tokens },
        { provide: ImpersonationStorageService, useValue: impersonation }
      ]
    });
  });

  it('does not send a shared-account header in a switched session', () => {
    tokens.getSwitchedUserId.mockReturnValue('target');
    TestBed.inject(AuthInterceptor).intercept(
      new HttpRequest('GET', '/'),
      next
    );

    const request = next.handle.mock.lastCall[0] as HttpRequest<unknown>;
    expect(request.headers.get('Authorization')).toBe('Bearer credential');
    expect(request.headers.has(HEADER_KEY_IMPERSONATION)).toBe(false);
  });

  it('preserves the shared-account header outside a switched session', () => {
    tokens.getSwitchedUserId.mockReturnValue(null);
    TestBed.inject(AuthInterceptor).intercept(
      new HttpRequest('GET', '/'),
      next
    );

    const request = next.handle.mock.lastCall[0] as HttpRequest<unknown>;
    expect(request.headers.get(HEADER_KEY_IMPERSONATION)).toBe('shared-access');
  });
});
