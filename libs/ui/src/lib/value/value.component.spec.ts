import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { PresentationModeService } from '../services/presentation-mode.service';
import { GfValueComponent } from './value.component';

jest.mock('@ionic/angular/standalone', () => ({ IonIcon: class {} }));
jest.mock('ionicons', () => ({ addIcons: jest.fn() }));

describe('GfValueComponent presentation mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [GfValueComponent],
      providers: [
        { provide: Clipboard, useValue: { copy: jest.fn() } },
        { provide: MatSnackBar, useValue: { open: jest.fn() } }
      ]
    }).overrideComponent(GfValueComponent, {
      set: { imports: [CommonModule, MatButtonModule, NgxSkeletonLoaderModule] }
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('masks monetary values but keeps percentages visible, and restores values', async () => {
    const money = TestBed.createComponent(GfValueComponent);
    money.componentRef.setInput('value', 1234.5);
    money.componentRef.setInput('isCurrency', true);
    money.componentRef.setInput('locale', 'en-US');
    money.autoDetectChanges();
    await money.whenStable();
    expect(money.nativeElement.textContent).toContain('1,234.50');

    const percentage = TestBed.createComponent(GfValueComponent);
    percentage.componentRef.setInput('value', 0.125);
    percentage.componentRef.setInput('isPercent', true);
    percentage.componentRef.setInput('locale', 'en-US');
    percentage.autoDetectChanges();
    await percentage.whenStable();

    const mode = TestBed.inject(PresentationModeService);
    mode.setEnabled(true);
    await Promise.all([money.whenStable(), percentage.whenStable()]);
    expect(money.nativeElement.textContent).not.toContain('1,234.50');
    expect(money.nativeElement.textContent).toContain('*****');
    expect(percentage.nativeElement.textContent).toContain('12.50');

    mode.setEnabled(false);
    await money.whenStable();
    expect(money.nativeElement.textContent).toContain('1,234.50');
  });

  it('requires confirmation before copying a hidden amount', async () => {
    const fixture = TestBed.createComponent(GfValueComponent);
    fixture.componentRef.setInput('value', 42);
    fixture.componentRef.setInput('isCurrency', true);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    TestBed.inject(PresentationModeService).setEnabled(true);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const clipboard = TestBed.inject(Clipboard);

    fixture.componentInstance.onCopyValueToClipboard();
    expect(clipboard.copy).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fixture.componentInstance.onCopyValueToClipboard();
    expect(clipboard.copy).toHaveBeenCalledWith('42');
    expect(TestBed.inject(MatSnackBar).open).not.toHaveBeenCalledWith(
      expect.stringContaining('42'),
      expect.anything(),
      expect.anything()
    );
    fixture.destroy();
  });
});
