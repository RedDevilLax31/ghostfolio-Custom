import { NotificationService } from '@ghostfolio/ui/notifications';

import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';

import { GfActivitiesTableComponent } from './activities-table.component';

jest.mock('@ionic/angular/standalone', () => ({ IonIcon: class {} }));
jest.mock('ionicons', () => ({ addIcons: jest.fn() }));

describe('GfActivitiesTableComponent', () => {
  it('emits changes to the drafts-only toggle', () => {
    TestBed.configureTestingModule({
      imports: [GfActivitiesTableComponent],
      providers: [{ provide: NotificationService, useValue: {} }]
    }).overrideComponent(GfActivitiesTableComponent, {
      set: { template: '', imports: [] }
    });

    const component = TestBed.createComponent(
      GfActivitiesTableComponent
    ).componentInstance;
    const emit = jest.spyOn(component.draftsFilterChanged, 'emit');
    component.ngOnInit();
    component.draftsFilter.setValue(true);
    component.draftsFilter.setValue(false);

    expect(emit.mock.calls).toEqual([[true], [false]]);
  });
});
