import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type { Mortgage, Property } from '../src/common/types';
import { AppSafetyProvider } from '../src/platforms/web/context/AppSafetyContext';
import { SettingsProvider } from '../src/platforms/web/context/SettingsContext';
import { PropertyCard } from '../src/platforms/web/components/PropertyCardExpanded';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const property = {
  id: 'property-summary',
  name: 'Málaga Apartment',
  address: 'Paseo Conde de Ferrería, 6',
  city: 'Málaga',
  country: 'Spain',
  currency: 'EUR',
  operatingCurrency: 'EUR',
  propertyValueCurrency: 'EUR',
  purchasePriceCurrency: 'EUR',
  currentEstimatedValueCurrency: 'EUR',
  monthlyRentCurrency: 'EUR',
  occupancyStatus: 'occupied',
  propertyType: 'apartment',
  purchasePrice: 221000,
  currentEstimatedValue: 280000,
  totalInitialInvestment: 236500,
  totalPurchaseCost: 236500,
  monthlyRent: 1200,
  hasMortgage: true,
  currentMortgageBalance: 189000,
  monthlyMortgagePayment: 690,
  originalLoanAmount: 200000,
  recurringExpenses: [],
  imageUrls: ['https://example.test/property.jpg'],
  primaryImageIndex: 0,
  builtAreaSqm: 72,
  bedrooms: 2,
  bathrooms: 1,
  floor: 7,
  hasElevator: true,
  renovatedYear: 2024,
  yearBuilt: 2004,
  annualIBI: 0,
  annualCommunityFees: 0,
  annualHomeInsurance: 0,
  annualLifeInsurance: 0,
  annualRentDefaultInsurance: 0,
  annualNonPaymentInsurance: 0,
  annualManagementFees: 0,
  annualMaintenance: 0,
  annualUtilitiesPaidByOwner: 0,
  annualOtherExpenses: 0,
} as unknown as Property;

const mortgage = {
  id: 'mortgage-summary',
  propertyId: property.id,
  currency: 'EUR',
  lenderName: 'CaixaBank',
  originalLoanAmount: 200000,
  currentBalance: 189000,
  interestRate: 2,
  mortgageTermYears: 30,
  mortgageTermMonths: 360,
  monthlyMortgagePayment: 690,
  mortgageStartDate: '2024-09-15',
  fixedOrVariable: 'fixed',
  mortgageType: 'Fixed',
  initialInterestRate: null,
  baseInterestRate: null,
  currentInterestRate: 2,
  maxBonifiedRate: null,
  maxTotalBonificationPoints: null,
  rateNotes: '',
  availableBonifications: [],
  activeBonifications: [],
  notes: '',
} as Mortgage;

const renderSummary = (summaryProperty: Property = property) =>
  renderToStaticMarkup(
    React.createElement(
      AppSafetyProvider,
      null,
      React.createElement(SettingsProvider, {
        storageKey: 'property-summary-dom-test',
        enableFxRefresh: false,
        children: React.createElement(PropertyCard, {
          property: summaryProperty,
          mortgage,
          onDelete: () => undefined,
          onEdit: () => undefined,
          activeTabOverride: 'overview',
        }),
      })
    )
  );

test('renders the compact Summary hero, KPI strip, valuation and mortgage sections', () => {
  const markup = renderSummary();

  assert.match(markup, /property-summary-overview/);
  assert.match(markup, /Málaga Apartment/);
  assert.match(markup, /Compra y valoracion/);
  assert.match(markup, /CaixaBank/);
  assert.match(markup, /67\.5% LTV/);
});

test('uses the compact photo empty state when no gallery image exists', () => {
  const markup = renderSummary({ ...property, imageUrls: [], imageUrl: '' });

  assert.match(markup, /Todavia no hay imágenes cargadas|Todavía no hay imágenes cargadas/);
});
