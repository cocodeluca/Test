import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
} from 'react-native';
import { Mortgage, Property } from '../../../common/types';
import { mockMortgages } from '../../../common/data/mockData';
import { mockProperties } from '../../../common/data/mockData';

const MobileMortgagesScreen: React.FC = () => {
  const [mortgages, setMortgages] = useState<Mortgage[]>(mockMortgages);
  const [properties] = useState<Property[]>(mockProperties);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    propertyId: properties[0]?.id || '',
    lenderName: '',
    originalLoanAmount: '',
    currentBalance: '',
    interestRate: '',
    mortgageTermYears: '',
    monthlyMortgagePayment: '',
    mortgageStartDate: new Date().toISOString().split('T')[0],
    fixedOrVariable: 'fixed',
    notes: '',
  });

  const handleAddMortgage = () => {
    if (!formData.propertyId || !formData.lenderName) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const newMortgage: Mortgage = {
      id: 'mort' + Date.now(),
      propertyId: formData.propertyId,
      currency: properties.find((property) => property.id === formData.propertyId)?.currency ?? 'EUR',
      lenderName: formData.lenderName,
      originalLoanAmount: parseFloat(formData.originalLoanAmount) || 0,
      currentBalance: parseFloat(formData.currentBalance) || 0,
      interestRate: parseFloat(formData.interestRate) || 0,
      mortgageTermYears: parseFloat(formData.mortgageTermYears) || 0,
      monthlyMortgagePayment: parseFloat(formData.monthlyMortgagePayment) || 0,
      mortgageStartDate: formData.mortgageStartDate,
      fixedOrVariable: formData.fixedOrVariable as 'fixed' | 'variable',
      mortgageType: '',
      initialInterestRate: null,
      baseInterestRate: null,
      currentInterestRate: null,
      maxBonifiedRate: null,
      maxTotalBonificationPoints: null,
      rateNotes: '',
      availableBonifications: [],
      activeBonifications: [],
      notes: formData.notes,
    };

    setMortgages([...mortgages, newMortgage]);
    setFormData({
      propertyId: properties[0]?.id || '',
      lenderName: '',
      originalLoanAmount: '',
      currentBalance: '',
      interestRate: '',
      mortgageTermYears: '',
      monthlyMortgagePayment: '',
      mortgageStartDate: new Date().toISOString().split('T')[0],
      fixedOrVariable: 'fixed',
      notes: '',
    });
    setShowForm(false);
  };

  const handleDeleteMortgage = (id: string) => {
    Alert.alert('Delete Mortgage', 'Are you sure you want to delete this mortgage?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Delete',
        onPress: () => {
          setMortgages(mortgages.filter(m => m.id !== id));
        },
      },
    ]);
  };

  const renderMortgageCard = ({ item }: { item: Mortgage }) => {
    const property = properties.find(p => p.id === item.propertyId);
    const percentageAmortized =
      ((item.originalLoanAmount - item.currentBalance) / item.originalLoanAmount) * 100;

    return (
      <View style={styles.mortgageCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.lenderName}>{item.lenderName}</Text>
            {property && (
              <Text style={styles.propertyName}>
                🏠 {property.name} ({property.city})
              </Text>
            )}
            <Text style={styles.startDate}>
              Since: {new Date(item.mortgageStartDate).toLocaleDateString('es-ES')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDeleteMortgage(item.id)}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardContent}>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Original Loan</Text>
              <Text style={styles.value}>€{item.originalLoanAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Current Balance</Text>
              <Text style={[styles.value, { color: '#dc2626' }]}>
                €{item.currentBalance.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Monthly Payment</Text>
              <Text style={styles.value}>€{item.monthlyMortgagePayment.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Interest Rate</Text>
              <Text style={styles.value}>{item.interestRate.toFixed(2)}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <Text style={styles.label}>Term</Text>
            <Text style={styles.value}>{item.mortgageTermYears}y</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.label}>Type</Text>
            <Text style={styles.value}>{item.fixedOrVariable === 'fixed' ? '🔒' : '📈'}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.label}>Amortized</Text>
            <Text style={[styles.value, { color: '#16a34a' }]}>{percentageAmortized.toFixed(1)}%</Text>
          </View>
        </View>

        {item.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Terms & Notes</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  if (showForm) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Add New Mortgage</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Property</Text>
          {properties.length === 0 ? (
            <Text style={styles.errorText}>Please add a property first</Text>
          ) : (
            properties.map(prop => (
              <TouchableOpacity
                key={prop.id}
                style={[
                  styles.selectButton,
                  formData.propertyId === prop.id && styles.selectButtonActive,
                ]}
                onPress={() => setFormData({ ...formData, propertyId: prop.id })}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    formData.propertyId === prop.id && styles.selectButtonTextActive,
                  ]}
                >
                  {prop.name} - {prop.address}
                </Text>
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.sectionTitle}>Lender Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Lender Name (e.g., Main lender)"
            value={formData.lenderName}
            onChangeText={(text) => setFormData({ ...formData, lenderName: text })}
          />

          <Text style={styles.sectionTitle}>Loan Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Original Loan Amount (€)"
            value={formData.originalLoanAmount}
            onChangeText={(text) => setFormData({ ...formData, originalLoanAmount: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Current Balance (€)"
            value={formData.currentBalance}
            onChangeText={(text) => setFormData({ ...formData, currentBalance: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Term (Years)"
            value={formData.mortgageTermYears}
            onChangeText={(text) => setFormData({ ...formData, mortgageTermYears: text })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.sectionTitle}>Interest & Payment</Text>
          <TextInput
            style={styles.input}
            placeholder="Interest Rate (%)"
            value={formData.interestRate}
            onChangeText={(text) => setFormData({ ...formData, interestRate: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Monthly Payment (€)"
            value={formData.monthlyMortgagePayment}
            onChangeText={(text) => setFormData({ ...formData, monthlyMortgagePayment: text })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.sectionTitle}>Notes & Terms</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Add TAE, terms, conditions..."
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            multiline
          />

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setShowForm(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={handleAddMortgage}
              disabled={properties.length === 0}
            >
              <Text style={styles.submitButtonText}>Add Mortgage</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mortgages</Text>
          <Text style={styles.subtitle}>{mortgages.length} mortgages</Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, properties.length === 0 && styles.addButtonDisabled]}
          onPress={() => setShowForm(true)}
          disabled={properties.length === 0}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {mortgages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No Mortgages Yet</Text>
          <Text style={styles.emptySubtitle}>
            {properties.length === 0
              ? 'Add a property first'
              : 'Track your mortgages here'}
          </Text>
          {properties.length > 0 && (
            <TouchableOpacity style={styles.emptyButton} onPress={() => setShowForm(true)}>
              <Text style={styles.emptyButtonText}>Add Mortgage</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={mortgages}
          renderItem={renderMortgageCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    padding: 12,
  },
  mortgageCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  lenderName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  propertyName: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  startDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  cardContent: {
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoItem: {
    flex: 1,
    marginRight: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 4,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  statItem: {
    alignItems: 'center',
  },
  notesSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  formContainer: {
    backgroundColor: '#fff',
    flex: 1,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  closeButton: {
    fontSize: 24,
    color: '#64748b',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  selectButton: {
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  selectButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  selectButtonText: {
    fontSize: 14,
    color: '#64748b',
  },
  selectButtonTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  input: {
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    fontSize: 14,
    color: '#1e293b',
  },
  notesInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    marginHorizontal: 16,
    color: '#dc2626',
    fontSize: 12,
    marginBottom: 16,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: '#2563eb',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default MobileMortgagesScreen;
