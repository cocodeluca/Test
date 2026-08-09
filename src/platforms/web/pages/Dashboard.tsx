import React, { useEffect, useMemo, useState } from 'react';
import { WealthAccountsEditor } from '../components/WealthAccountsEditor';
import {
  AttentionStrip,
  DashboardHeader,
  DashboardOverviewGrid,
  PrimaryMetrics,
} from '../components/dashboard/DashboardSections';
import { useSettings } from '../context/SettingsContext';
import {
  calculateAllPropertyMetrics,
  calculatePortfolioMetrics,
} from '../../../common/utils/calculations';
import {
  getActiveFxSnapshot,
  getSettingsCurrencyRates,
} from '../../../common/utils/fxRates';
import { formatCurrencyValue } from '../../../common/utils/formatting';
import { convertCurrency } from '../../../common/utils/currency';
import { generatePortfolioAlerts } from '../../../common/utils/alerts';
import type {
  CashAccount,
  InvestmentAccount,
  Mortgage,
  Opportunity,
  Property,
  RehabProject,
} from '../../../common/types';
import type { DisplayCurrency } from '../../../common/types/settings';
import {
  buildDashboardViewModel,
  type DashboardPropertySummaryItem,
} from './dashboardViewModel';

interface DashboardProps {
  properties: Property[];
  mortgages: Mortgage[];
  cashAccounts: CashAccount[];
  investmentAccounts: InvestmentAccount[];
  opportunities: Opportunity[];
  rehabProjects: RehabProject[];
  onUpdateCashAccounts: (accounts: CashAccount[]) => void;
  onUpdateInvestmentAccounts: (accounts: InvestmentAccount[]) => void;
  onConnectEtoroAccount: () => Promise<void>;
  onSyncInvestmentAccount: (accountId: string) => Promise<void>;
}

export const Dashboard: React.FC<DashboardProps> = ({
  properties,
  mortgages,
  cashAccounts,
  investmentAccounts,
  onUpdateCashAccounts,
  onUpdateInvestmentAccounts,
  onConnectEtoroAccount,
  onSyncInvestmentAccount,
}) => {
  const { settings, t } = useSettings();
  const activeFxSnapshot = getActiveFxSnapshot(settings);
  const fxRates = getSettingsCurrencyRates(settings);
  const [showWealthEditor, setShowWealthEditor] = useState(false);

  const metrics = useMemo(
    () =>
      calculatePortfolioMetrics(
        properties,
        mortgages,
        cashAccounts,
        investmentAccounts,
        settings.currency,
        fxRates
      ),
    [properties, mortgages, cashAccounts, investmentAccounts, settings.currency, fxRates]
  );

  const propertyMetrics = useMemo(
    () => calculateAllPropertyMetrics(properties, mortgages, settings.currency, fxRates),
    [properties, mortgages, settings.currency, fxRates]
  );

  const alerts = useMemo(() => generatePortfolioAlerts(properties), [properties]);

  const viewModel = useMemo(
    () =>
      buildDashboardViewModel({
        metrics,
        properties,
        propertyMetrics,
        alerts,
        rateOverrides: fxRates,
      }),
    [alerts, fxRates, metrics, properties, propertyMetrics]
  );

  useEffect(() => {
    console.info('[fx]', {
      event: 'portfolio-calculation-snapshot',
      provider: activeFxSnapshot?.provider ?? null,
      status: activeFxSnapshot?.status ?? 'error',
      fetchedAt: activeFxSnapshot?.fetchedAt ?? null,
      lastSuccessfulUpdateAt: activeFxSnapshot?.lastSuccessfulUpdateAt ?? null,
      reportingCurrency: settings.currency,
      rates: fxRates,
    });
  }, [activeFxSnapshot, fxRates, settings.currency]);

  const dashboardValuationDisplayCurrency: DisplayCurrency =
    settings.currency === 'ARS' ? 'USD' : metrics.valuationDisplayCurrency;
  const dashboardOperatingDisplayCurrency: DisplayCurrency =
    settings.currency === 'ARS' ? 'ARS' : metrics.operatingDisplayCurrency;

  const formatDashboardCurrency = (
    value: number,
    sourceCurrency: DisplayCurrency,
    targetCurrency: DisplayCurrency
  ) =>
    formatCurrencyValue(
      convertCurrency(value, sourceCurrency, targetCurrency, fxRates),
      targetCurrency,
      { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    );

  const formatValuationCurrency = (value: number) =>
    formatDashboardCurrency(
      value,
      metrics.valuationDisplayCurrency,
      dashboardValuationDisplayCurrency
    );
  const formatOperatingCurrency = (value: number) =>
    formatDashboardCurrency(
      value,
      metrics.operatingDisplayCurrency,
      dashboardOperatingDisplayCurrency
    );
  const formatPropertyValue = (
    item: DashboardPropertySummaryItem,
    value: number
  ) =>
    formatDashboardCurrency(
      value,
      item.valuationDisplayCurrency,
      dashboardValuationDisplayCurrency
    );
  const formatPropertyCashflow = (
    item: DashboardPropertySummaryItem,
    value: number
  ) =>
    formatDashboardCurrency(
      value,
      item.operatingDisplayCurrency,
      dashboardOperatingDisplayCurrency
    );

  const profileName = settings.profile.name.trim();
  const firstName = profileName.split(/\s+/)[0] || t('dashboardUi.ownerFallback');

  return (
    <div className="space-y-[14px] pb-2">
      <DashboardHeader
        firstName={firstName}
        onEditWealth={() => setShowWealthEditor(true)}
        t={t}
      />

      <PrimaryMetrics
        primary={viewModel.primary}
        formatValuation={formatValuationCurrency}
        formatOperating={formatOperatingCurrency}
        t={t}
      />

      <AttentionStrip attention={viewModel.attention} t={t} />

      <DashboardOverviewGrid
        viewModel={viewModel}
        formatValuation={formatValuationCurrency}
        formatOperating={formatOperatingCurrency}
        formatPropertyValue={formatPropertyValue}
        formatPropertyCashflow={formatPropertyCashflow}
        t={t}
      />

      {showWealthEditor ? (
        <WealthAccountsEditor
          cashAccounts={cashAccounts}
          investmentAccounts={investmentAccounts}
          onChangeCashAccounts={onUpdateCashAccounts}
          onChangeInvestmentAccounts={onUpdateInvestmentAccounts}
          onConnectEtoroAccount={onConnectEtoroAccount}
          onSyncInvestmentAccount={onSyncInvestmentAccount}
          onClose={() => setShowWealthEditor(false)}
        />
      ) : null}
    </div>
  );
};
