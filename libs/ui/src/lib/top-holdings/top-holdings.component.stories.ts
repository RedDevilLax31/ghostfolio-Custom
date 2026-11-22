import type { Meta, StoryObj } from '@storybook/angular';

import { GfTopHoldingsComponent } from './top-holdings.component';

export default {
  title: 'Top Holdings',
  component: GfTopHoldingsComponent
} as Meta<GfTopHoldingsComponent>;

type Story = StoryObj<GfTopHoldingsComponent>;

export const WithParents: Story = {
  args: {
    locale: 'en-US',
    topHoldings: [
      {
        allocationInPercentage: 0.25,
        name: 'Example holding',
        valueInBaseCurrency: 12345,
        parents: [
          {
            allocationInPercentage: 0.25,
            name: 'Example parent fund',
            valueInBaseCurrency: 12345
          }
        ]
      }
    ]
  }
};
