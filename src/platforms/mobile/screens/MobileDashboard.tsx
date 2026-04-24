import React from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
} from 'react-native';
import { Property, Mortgage } from '../../../common/types';
import {
  calculatePortfolioMetrics,
  calculateAllPropertyMetrics,
} from '../../../common/utils/calculations';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { getCurrentSettings } from '../../../common/utils/settingsStore';
import MobileMetricCard from '../components/MobileMetricCard';
import MobilePropertyTable from '../components/MobilePropertyTable';

interface DashboardProps {
  properties: Property[];
  mortgages: Mortgage[];
}

const MobileDashboard: React.FC<DashboardProps> = ({ properties, mortgages }) => {
  const settings = getCurrentSettings();
  const fxRates = getSettingsCurrencyRates(settings);
  const metrics = calculatePortfolioMetrics(properties, mortgages, [], [], settings.currency, fxRates);
  const propertyMetrics = calculateAllPropertyMetrics(properties, mortgages);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Summary Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Portfolio Summary</Text>
        <MobileMetricCard
          title="Total Portfolio Value"
          value={`€${Math.round(metrics.totalPortfolioValue).toLocaleString()}`}
          backgroundColor="#dbeafe"
          emoji="📈"
        />
        <MobileMetricCard
          title="Total Equity"
          value={`€${Math.round(metrics.totalEquity).toLocaleString()}`}
          backgroundColor="#dcfce7"
          emoji="🏦"
        />
        <MobileMetricCard
          title="Total Debt"
          value={`€${Math.round(metrics.totalDebt).toLocaleString()}`}
          backgroundColor="#fee2e2"
          emoji="🔒"
        />
        <MobileMetricCard
          title="Equity %"
          value={`${metrics.equityPercentage.toFixed(1)}%`}
          backgroundColor="#f3e8ff"
          emoji="📊"
        />
      </View>

      {/* Cashflow Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cashflow Analysis</Text>
        <MobileMetricCard
          title="Monthly Rent"
          value={`€${Math.round(metrics.totalMonthlyRent).toLocaleString()}`}
          backgroundColor="#dcfce7"
          emoji="💰"
        />
        <MobileMetricCard
          title="Monthly Expenses"
          value={`€${Math.round(metrics.totalAnnualExpenses / 12).toLocaleString()}`}
          backgroundColor="#fef3c7"
          emoji="📉"
        />
        <MobileMetricCard
          title="Mortgage Payments"
          value={`€${Math.round(metrics.totalMonthlyMortgagePayments).toLocaleString()}`}
          backgroundColor="#fee2e2"
          emoji="🔒"
        />
        <MobileMetricCard
          title="Net Monthly Cashflow"
          value={`€${Math.round(metrics.totalNetMonthlyCashflow).toLocaleString()}`}
          backgroundColor={
            metrics.totalNetMonthlyCashflow >= 0 ? '#dcfce7' : '#fee2e2'
          }
          emoji={
            metrics.totalNetMonthlyCashflow >= 0 ? '✅' : '⚠️'
          }
        />
      </View>

      {/* Returns Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Returns & Ratios</Text>
        <MobileMetricCard
          title="Gross Yield"
          value={`${metrics.averageGrossYield.toFixed(2)}%`}
          backgroundColor="#f3e8ff"
          emoji="🎯"
        />
        <MobileMetricCard
          title="Debt-to-Value"
          value={`${metrics.debtToValueRatio.toFixed(1)}%`}
          backgroundColor="#fef3c7"
          emoji="📊"
        />
      </View>

      {/* Properties Table */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Properties</Text>
        <MobilePropertyTable properties={propertyMetrics} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
});

export default MobileDashboard;
