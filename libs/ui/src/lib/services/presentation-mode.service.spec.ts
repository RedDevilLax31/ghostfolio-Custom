import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';

import { PresentationModeService } from './presentation-mode.service';

describe('PresentationModeService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('starts disabled and persists changes for the browser session', () => {
    const service = TestBed.inject(PresentationModeService);
    expect(service.isEnabled()).toBe(false);

    service.setEnabled(true);
    expect(service.isEnabled()).toBe(true);

    TestBed.resetTestingModule();
    const restored = TestBed.inject(PresentationModeService);
    expect(restored.isEnabled()).toBe(true);

    restored.setEnabled(false);
    TestBed.resetTestingModule();
    expect(TestBed.inject(PresentationModeService).isEnabled()).toBe(false);
  });

  it('blocks monetary editing and asks before disclosure when enabled', () => {
    const service = TestBed.inject(PresentationModeService);
    const alert = jest
      .spyOn(window, 'alert')
      .mockImplementation(() => undefined);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);

    expect(service.allowMonetaryEditing()).toBe(true);
    expect(service.confirmDisclosure()).toBe(true);
    service.setEnabled(true);
    expect(service.allowMonetaryEditing()).toBe(false);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(service.confirmDisclosure()).toBe(false);
    confirm.mockReturnValue(true);
    expect(service.confirmDisclosure()).toBe(true);
  });
});
