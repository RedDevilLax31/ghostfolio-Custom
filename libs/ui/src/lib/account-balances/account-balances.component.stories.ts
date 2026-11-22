import { provideNativeDateAdapter } from '@angular/material/core';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import 'reflect-metadata';

import { NotificationService } from '../notifications';
import { GfAccountBalancesComponent } from './account-balances.component';

export default {
  title: 'Account Balances',
  component: GfAccountBalancesComponent,
  decorators: [
    applicationConfig({ providers: [provideNativeDateAdapter()] }),
    moduleMetadata({ providers: [NotificationService] })
  ]
} as Meta<GfAccountBalancesComponent>;

type Story = StoryObj<GfAccountBalancesComponent>;

export const Editable: Story = {
  args: {
    accountBalances: [],
    accountCurrency: 'USD',
    currentBalance: 12345,
    locale: 'en-US'
  }
};

export const ReadOnly: Story = {
  args: {
    ...Editable.args,
    showActions: false
  }
};
