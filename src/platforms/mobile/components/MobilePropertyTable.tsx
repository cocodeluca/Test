import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { PropertyMetrics } from '../../../common/types';

interface MobilePropertyTableProps {
  properties: PropertyMetrics[];
}

const MobilePropertyTable: React.FC<MobilePropertyTableProps> = ({
  properties,
}) => {
  const renderPropertyCard = ({
    item,
  }: {
    item: PropertyMetrics;
  }) => (
    <View style={styles.propertyCard}>
      <View style={styles.propertyHeader}>
        <View>
          <Text style={styles.propertyName}>{item.name}</Text>
          <Text style={styles.propertyLocation}>
            {item.city}, {item.country}
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <MetricRow
          label="Current Value"
          value={`€${Math.round(item.currentEstimatedValue).toLocaleString()}`}
        />
        <MetricRow
          label="Debt"
          value={`€${Math.round(item.mortgageBalance).toLocaleString()}`}
        />
        <MetricRow
          label="Equity"
          value={`€${Math.round(item.equity).toLocaleString()}`}
        />
        <MetricRow label="Equity %" value={`${item.equityPercentage.toFixed(1)}%`} />
        <MetricRow
          label="Monthly Rent"
          value={`€${Math.round(item.annualRentalIncome / 12).toLocaleString()}`}
        />
        <MetricRow
          label="Net Monthly CF"
          value={`€${Math.round(item.netMonthlyCashflow).toLocaleString()}`}
          valueColor={item.netMonthlyCashflow >= 0 ? '#16a34a' : '#dc2626'}
        />
        <MetricRow label="Gross Yield" value={`${item.grossYield.toFixed(2)}%`} />
        <MetricRow label="ROCE" value={`${item.roce.toFixed(2)}%`} />
      </View>
    </View>
  );

  return (
    <FlatList
      data={properties}
      renderItem={renderPropertyCard}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      nestedScrollEnabled={false}
    />
  );
};

interface MetricRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

const MetricRow: React.FC<MetricRowProps> = ({
  label,
  value,
  valueColor = '#1e293b',
}) => (
  <View style={styles.metricRow}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  propertyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  propertyHeader: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
  },
  propertyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  propertyLocation: {
    fontSize: 13,
    color: '#64748b',
  },
  metricsGrid: {
    gap: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  metricLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
});

export default MobilePropertyTable;
