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
import { Property } from '../../../common/types';
import { mockProperties } from '../../../common/data/mockData';
import { calculatePropertyDetails } from '../../../common/utils/calculations';

const MobilePropertiesScreen: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>(mockProperties);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    country: 'Spain',
    purchasePrice: '',
    currentEstimatedValue: '',
    monthlyRent: '',
    annualIBI: '',
    annualHomeInsurance: '',
    annualCommunityFees: '',
    annualMaintenance: '',
    annualOtherExpenses: '',
    notes: '',
  });

  const handleAddProperty = () => {
    if (!formData.name || !formData.address || !formData.city) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const newProperty: Property = {
      id: 'prop' + Date.now(),
      currency: 'EUR',
      name: formData.name,
      address: formData.address,
      city: formData.city,
      country: formData.country,
      purchasePrice: parseFloat(formData.purchasePrice) || 0,
      currentEstimatedValue: parseFloat(formData.currentEstimatedValue) || 0,
      purchaseDate: new Date().toISOString().split('T')[0],
      monthlyRent: parseFloat(formData.monthlyRent) || 0,
      annualIBI: parseFloat(formData.annualIBI) || 0,
      annualHomeInsurance: parseFloat(formData.annualHomeInsurance) || 0,
      annualLifeInsurance: 0,
      annualRentDefaultInsurance: 0,
      annualNonPaymentInsurance: 0,
      annualCommunityFees: parseFloat(formData.annualCommunityFees) || 0,
      annualMaintenance: parseFloat(formData.annualMaintenance) || 0,
      annualOtherExpenses: parseFloat(formData.annualOtherExpenses) || 0,
      propertyManagementRate: 0,
      notes: formData.notes,
    } as Property;

    setProperties([...properties, newProperty]);
    setFormData({
      name: '',
      address: '',
      city: '',
      country: 'Spain',
      purchasePrice: '',
      currentEstimatedValue: '',
      monthlyRent: '',
      annualIBI: '',
      annualHomeInsurance: '',
      annualCommunityFees: '',
      annualMaintenance: '',
      annualOtherExpenses: '',
      notes: '',
    });
    setShowForm(false);
  };

  const handleDeleteProperty = (id: string) => {
    Alert.alert('Delete Property', 'Are you sure you want to delete this property?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Delete',
        onPress: () => {
          setProperties(properties.filter(p => p.id !== id));
        },
      },
    ]);
  };

  const renderPropertyCard = ({ item }: { item: Property }) => {
    const details = calculatePropertyDetails(item);

    return (
      <View style={styles.propertyCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.propertyName}>{item.name}</Text>
            <Text style={styles.propertyLocation}>
              📍 {item.address}
            </Text>
            <Text style={styles.propertyCity}>
              {item.city}, {item.country}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDeleteProperty(item.id)}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardContent}>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Current Value</Text>
              <Text style={styles.value}>€{item.currentEstimatedValue.toLocaleString('es-ES')}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Monthly Rent</Text>
              <Text style={[styles.value, { color: '#16a34a' }]}>
                €{details.monthlyRent.toLocaleString('es-ES')}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Monthly Expenses</Text>
              <Text style={[styles.value, { color: '#b45309' }]}>
                €{details.totalMonthlyExpenses.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.label}>Net Cashflow</Text>
              <Text style={[styles.value, { color: details.netMonthlyCashflow >= 0 ? '#16a34a' : '#dc2626' }]}>
                €{details.netMonthlyCashflow.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>
        </View>

        {item.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
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
            <Text style={styles.formTitle}>Add New Property</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Basic Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Property Name"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Address"
            value={formData.address}
            onChangeText={(text) => setFormData({ ...formData, address: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="City"
            value={formData.city}
            onChangeText={(text) => setFormData({ ...formData, city: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Country"
            value={formData.country}
            onChangeText={(text) => setFormData({ ...formData, country: text })}
          />

          <Text style={styles.sectionTitle}>Financial Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Purchase Price (€)"
            value={formData.purchasePrice}
            onChangeText={(text) => setFormData({ ...formData, purchasePrice: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Current Estimated Value (€)"
            value={formData.currentEstimatedValue}
            onChangeText={(text) => setFormData({ ...formData, currentEstimatedValue: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Monthly Rent (€)"
            value={formData.monthlyRent}
            onChangeText={(text) => setFormData({ ...formData, monthlyRent: text })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.sectionTitle}>Annual Expenses (€)</Text>
          <TextInput
            style={styles.input}
            placeholder="IBI (Property Tax)"
            value={formData.annualIBI}
            onChangeText={(text) => setFormData({ ...formData, annualIBI: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Insurance"
            value={formData.annualHomeInsurance}
            onChangeText={(text) => setFormData({ ...formData, annualHomeInsurance: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Community Fees"
            value={formData.annualCommunityFees}
            onChangeText={(text) => setFormData({ ...formData, annualCommunityFees: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Maintenance"
            value={formData.annualMaintenance}
            onChangeText={(text) => setFormData({ ...formData, annualMaintenance: text })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Other Expenses"
            value={formData.annualOtherExpenses}
            onChangeText={(text) => setFormData({ ...formData, annualOtherExpenses: text })}
            keyboardType="decimal-pad"
          />

          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Add any additional notes..."
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
            <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={handleAddProperty}>
              <Text style={styles.submitButtonText}>Add Property</Text>
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
          <Text style={styles.title}>Properties</Text>
          <Text style={styles.subtitle}>{properties.length} properties</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {properties.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🏢</Text>
          <Text style={styles.emptyTitle}>No Properties Yet</Text>
          <Text style={styles.emptySubtitle}>Add your first property to get started</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => setShowForm(true)}>
            <Text style={styles.emptyButtonText}>Add Property</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={properties}
          renderItem={renderPropertyCard}
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
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    padding: 12,
  },
  propertyCard: {
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
  propertyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  propertyLocation: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  propertyCity: {
    fontSize: 12,
    color: '#64748b',
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

export default MobilePropertiesScreen;
