import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface MobileMetricCardProps {
  title: string;
  value: string;
  backgroundColor: string;
  emoji?: string;
  subtitle?: string;
}

const MobileMetricCard: React.FC<MobileMetricCardProps> = ({
  title,
  value,
  backgroundColor,
  emoji,
  subtitle,
}) => {
  const cardStyle: ViewStyle = {
    ...styles.card,
    backgroundColor,
  };

  return (
    <View style={cardStyle}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>{value}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {emoji && <Text style={styles.emoji}>{emoji}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  emoji: {
    fontSize: 32,
    marginLeft: 12,
  },
});

export default MobileMetricCard;
