import { TestBed } from '@angular/core/testing';
import { cloneDeep } from 'lodash-es';
import svgMap from 'svgmap';

import { GfWorldMapChartComponent } from './world-map-chart.component';

jest.mock('svgmap', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    countries: {},
    mapWrapper: { remove: jest.fn() },
    options: {},
    tooltip: { remove: jest.fn() }
  }))
}));

describe('GfWorldMapChartComponent', () => {
  it('switches between monetary and percentage data without mutating the inputs', async () => {
    globalThis.structuredClone ??= (value) => cloneDeep(value);
    TestBed.configureTestingModule({
      imports: [GfWorldMapChartComponent]
    }).overrideComponent(GfWorldMapChartComponent, {
      set: { template: '', imports: [] }
    });

    const fixture = TestBed.createComponent(GfWorldMapChartComponent);
    const countries = { US: { value: 100 }, DE: { value: 300 } };
    fixture.componentRef.setInput('countries', countries);
    fixture.componentRef.setInput('format', '{0} USD');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    const map = svgMap as jest.Mock;
    expect(map.mock.lastCall[0].data.values.US.value).toBe(100);
    fixture.componentRef.setInput('isInPercentage', true);
    fixture.componentRef.setInput('format', '{0}%');
    await fixture.whenStable();
    expect(map.mock.lastCall[0].data.values.US.value).toBe(25);
    expect(countries.US.value).toBe(100);

    fixture.componentRef.setInput('isInPercentage', false);
    fixture.componentRef.setInput('format', '{0} USD');
    await fixture.whenStable();
    expect(map.mock.lastCall[0].data.values.US.value).toBe(100);
    fixture.destroy();
  });
});
