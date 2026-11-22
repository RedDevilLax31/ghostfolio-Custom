import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

const PRESENTATION_MODE_KEY = 'presentationMode';

@Injectable({ providedIn: 'root' })
export class PresentationModeService {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly storage = this.window?.sessionStorage;
  private readonly enabled = signal(
    this.storage?.getItem(PRESENTATION_MODE_KEY) === 'true'
  );

  public readonly isEnabled = this.enabled.asReadonly();

  public setEnabled(enabled: boolean) {
    if (enabled) {
      this.storage?.setItem(PRESENTATION_MODE_KEY, 'true');
    } else {
      this.storage?.removeItem(PRESENTATION_MODE_KEY);
    }

    this.enabled.set(enabled);
  }

  public confirmDisclosure(): boolean {
    return (
      !this.isEnabled() ||
      !!this.window?.confirm(
        $localize`This action contains real monetary amounts. Continue?`
      )
    );
  }

  public allowMonetaryEditing(): boolean {
    if (!this.isEnabled()) {
      return true;
    }

    this.window?.alert(
      $localize`Turn off Hide monetary values in Settings to edit monetary data.`
    );
    return false;
  }
}
