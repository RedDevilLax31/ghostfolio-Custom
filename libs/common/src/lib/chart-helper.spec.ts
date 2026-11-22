import { getTooltipOptions } from './chart-helper';

describe('getTooltipOptions', () => {
  const getLabel = ({
    currency,
    hideValues,
    locale,
    unit,
    y
  }: {
    currency?: string;
    hideValues?: () => boolean;
    locale: string;
    unit?: string;
    y: number;
  }) => {
    const { callbacks } = getTooltipOptions({
      currency,
      hideValues,
      locale,
      unit,
      colorScheme: 'LIGHT'
    });

    return (callbacks?.label as (context: unknown) => string)({
      dataset: { label: 'Performance' },
      parsed: { y, x: 0 }
    });
  };

  it('formats the value with the locale for a currency', () => {
    expect(getLabel({ currency: 'EUR', locale: 'en-US', y: 1234.5 })).toBe(
      'Performance: 1,234.50 EUR'
    );
  });

  it('formats the value with the locale for a unit', () => {
    expect(getLabel({ locale: 'fr', unit: '%', y: 0.86 })).toBe(
      'Performance: 0,86 %'
    );
  });

  it('formats the value with the locale and grouping for a unit', () => {
    expect(getLabel({ locale: 'de', unit: '%', y: 1234.5 })).toBe(
      'Performance: 1.234,50 %'
    );
  });

  it('formats the value with the locale without a unit', () => {
    expect(getLabel({ locale: 'de', y: 1234.5 })).toBe('Performance: 1.234,50');
  });

  it('hides monetary tooltip values when requested', () => {
    let hidden = true;
    const hideValues = () => hidden;
    expect(
      getLabel({ currency: 'USD', hideValues, locale: 'en-US', y: 1234.5 })
    ).toBe('Performance: *****');
    hidden = false;
    expect(
      getLabel({ currency: 'USD', hideValues, locale: 'en-US', y: 1234.5 })
    ).toBe('Performance: 1,234.50 USD');
  });
});
