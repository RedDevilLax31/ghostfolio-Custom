import { getTimeSeriesTooltipOptions } from './chart.options';

describe('getTimeSeriesTooltipOptions', () => {
  it('updates monetary tooltip visibility without hiding percentage series', () => {
    let hidden = false;
    const monetary = getTimeSeriesTooltipOptions<'line'>({
      colorScheme: 'LIGHT',
      currency: 'USD',
      hideValues: () => hidden,
      locale: 'en-US'
    });
    const percentage = getTimeSeriesTooltipOptions<'line'>({
      colorScheme: 'LIGHT',
      locale: 'en-US',
      unit: '%'
    });
    const context = {
      dataset: { label: 'Portfolio' },
      parsed: { x: 0, y: 1234.5 }
    };
    const monetaryLabel = monetary.callbacks?.label as (
      context: unknown
    ) => string;
    const percentageLabel = percentage.callbacks?.label as (
      context: unknown
    ) => string;

    expect(monetaryLabel(context)).toBe('Portfolio: 1,234.50 USD');
    hidden = true;
    expect(monetaryLabel(context)).toBe('Portfolio: *****');
    expect(percentageLabel(context)).toBe('Portfolio: 1,234.50 %');
  });
});
