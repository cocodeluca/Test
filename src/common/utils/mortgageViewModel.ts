import { Mortgage, Property } from '../types';
import { formatCurrency, formatMortgageTermMonths, formatPercentage, formatShortDate } from './formatting';
import {
  calculateAmortization,
  calculateCurrentRate,
  calculateMortgageBonificationSummary,
  calculateMortgageSnapshot,
  calculateMonthlyPayment,
  calculateRemainingMortgageMonths,
  isMortgageInInitialPeriod,
  mergeMortgageBonifications,
} from './calculations';

const isFilledNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const notSpecified = 'Not specified';

export const getMortgageTypeLabel = (mortgage: Mortgage): string => {
  const rawType = mortgage.mortgageType?.trim();

  if (rawType) {
    return rawType;
  }

  if (mortgage.initialInterestRate !== null || /mixed/i.test(mortgage.mortgageType ?? '')) {
    return 'Mixed';
  }

  if (mortgage.fixedOrVariable === 'variable') {
    return 'Variable';
  }

  return 'Fixed';
};

const getPrimaryRateValue = (mortgage: Mortgage): number | null => {
  const snapshotRate = calculateCurrentRate(mortgage);
  if (isFilledNumber(snapshotRate)) {
    return snapshotRate;
  }

  if (isFilledNumber(mortgage.currentInterestRate)) {
    return mortgage.currentInterestRate;
  }

  if (isFilledNumber(mortgage.interestRate)) {
    return mortgage.interestRate;
  }

  if (isFilledNumber(mortgage.baseInterestRate)) {
    return mortgage.baseInterestRate;
  }

  if (isFilledNumber(mortgage.initialInterestRate)) {
    return mortgage.initialInterestRate;
  }

  return null;
};

export const getDisplayedRate = (mortgage: Mortgage): number | null => getPrimaryRateValue(mortgage);

export const getBonificationSummary = (mortgage: Mortgage) => {
  const bonificationSummary = calculateMortgageBonificationSummary(mortgage);
  const mergedBonifications = mergeMortgageBonifications(mortgage);
  const activeBonifications = bonificationSummary.activeBonifications;
  const availableBonifications = bonificationSummary.availableBonifications;
  const knownActiveBonificationPoints = bonificationSummary.knownActiveBonificationPoints;
  const hasUnknownActivePoints = bonificationSummary.hasUnknownActivePoints;
  const maxTotalBonificationPoints = mortgage.maxTotalBonificationPoints;
  const cappedActivePoints =
    isFilledNumber(maxTotalBonificationPoints)
      ? Math.min(knownActiveBonificationPoints, maxTotalBonificationPoints)
      : knownActiveBonificationPoints;

  return {
    mergedBonifications,
    activeBonifications,
    availableBonifications,
    knownActiveBonificationPoints: cappedActivePoints,
    rawKnownActiveBonificationPoints: knownActiveBonificationPoints,
    hasUnknownActivePoints,
    maxTotalBonificationPoints,
  };
};

export const getRateSummary = (mortgage: Mortgage) => {
  const displayedRate = getDisplayedRate(mortgage);
  const currentRate = calculateCurrentRate(mortgage);
  const bonificationSummary = getBonificationSummary(mortgage);
  const isMixed = /mixed/i.test(getMortgageTypeLabel(mortgage));
  const isInInitialPeriod = isMortgageInInitialPeriod(mortgage);
  const sections: Array<{
    label: string;
    value: string;
    tone?: 'default' | 'positive' | 'warning';
  }> = [];

  if (isFilledNumber(mortgage.baseInterestRate)) {
    sections.push({
      label: 'Base Rate',
      value: formatPercentage(mortgage.baseInterestRate, 2),
      tone: 'default',
    });
  }

  if (displayedRate !== null) {
    sections.push({
      label: 'Displayed / Current Rate',
      value: formatPercentage(displayedRate, 2),
      tone: 'default',
    });
  }

  if (isFilledNumber(mortgage.initialInterestRate) && (isMixed || isInInitialPeriod)) {
    sections.push({
      label: 'Initial Rate',
      value: formatPercentage(mortgage.initialInterestRate, 2),
      tone: 'default',
    });
  }

  if (bonificationSummary.knownActiveBonificationPoints > 0 || bonificationSummary.hasUnknownActivePoints) {
    sections.push({
      label: 'Active Bonification',
      value: bonificationSummary.hasUnknownActivePoints
        ? `${bonificationSummary.knownActiveBonificationPoints.toFixed(2)} pts+`
        : `${bonificationSummary.knownActiveBonificationPoints.toFixed(2)} pts`,
      tone: bonificationSummary.knownActiveBonificationPoints > 0 ? 'positive' : 'warning',
    });
  }

  if (isFilledNumber(mortgage.maxTotalBonificationPoints)) {
    sections.push({
      label: 'Max Total Bonification',
      value: `${mortgage.maxTotalBonificationPoints.toFixed(2)} pts`,
      tone: 'default',
    });
  }

  let explanation: string | null = null;
  if (isFilledNumber(mortgage.baseInterestRate) && displayedRate !== null) {
    if (isFilledNumber(mortgage.currentInterestRate) && mortgage.currentInterestRate !== mortgage.baseInterestRate) {
      explanation = 'Displayed rate follows the current mortgage state and stored rate fields.';
    } else if (bonificationSummary.knownActiveBonificationPoints > 0) {
      explanation = 'Rate is shown alongside active bonification data; the exact pricing formula is only surfaced when supported.';
    }
  } else if (isFilledNumber(currentRate)) {
    explanation = 'Displayed rate uses the best available rate value from the mortgage record.';
  }

  return {
    sections,
    displayedRate,
    currentRate,
    explanation,
  };
};

export const shouldShowBonifications = (mortgage: Mortgage): boolean => {
  const summary = getBonificationSummary(mortgage);
  return summary.activeBonifications.length > 0 || summary.availableBonifications.length > 0;
};

export const shouldShowSavings = (mortgage: Mortgage): boolean => {
  const savings = getBonificationSavings(mortgage);
  return savings.monthlySaving !== null;
};

export const shouldShowPaymentBreakdown = (mortgage: Mortgage): boolean => {
  const breakdown = getPaymentBreakdown(mortgage);
  return breakdown !== null && (breakdown.interestPortion !== null || breakdown.principalPortion !== null);
};

export const getBonificationSavings = (mortgage: Mortgage) => {
  const snapshot = calculateMortgageSnapshot(mortgage);
  const rateSummary = getRateSummary(mortgage);
  const displayedRate = rateSummary.displayedRate;
  const baseRate = isFilledNumber(mortgage.baseInterestRate) ? mortgage.baseInterestRate : null;
  const monthlyPayment = snapshot.currentMonthlyPayment ?? calculateMonthlyPayment(mortgage);
  const remainingMonths = snapshot.remainingMonths || calculateRemainingMortgageMonths(mortgage);
  const balance = snapshot.displayedBalance;

  if (
    !isFilledNumber(baseRate) ||
    !isFilledNumber(displayedRate) ||
    !isFilledNumber(monthlyPayment) ||
    remainingMonths <= 0 ||
    balance <= 0
  ) {
    return {
      monthlySaving: null as number | null,
      yearlySaving: null as number | null,
      paymentWithoutBonifications: null as number | null,
    };
  }

  const monthlyRateWithBonifications = displayedRate / 100 / 12;
  const monthlyRateWithoutBonifications = baseRate / 100 / 12;
  const calculatePayment = (rate: number) => {
    if (remainingMonths <= 0 || balance <= 0) {
      return null;
    }

    if (rate === 0) {
      return balance / remainingMonths;
    }

    const factor = Math.pow(1 + rate, remainingMonths);
    const denominator = factor - 1;
    if (denominator === 0) {
      return null;
    }
    return balance * ((rate * factor) / denominator);
  };

  const paymentWithoutBonifications = calculatePayment(monthlyRateWithoutBonifications);
  const paymentWithDisplayedRate = calculatePayment(monthlyRateWithBonifications) ?? monthlyPayment;

  if (paymentWithoutBonifications === null || paymentWithDisplayedRate === null) {
    return {
      monthlySaving: null,
      yearlySaving: null,
      paymentWithoutBonifications: null,
    };
  }

  const monthlySaving = Math.max(paymentWithoutBonifications - paymentWithDisplayedRate, 0);

  if (monthlySaving <= 0) {
    return {
      monthlySaving: null,
      yearlySaving: null,
      paymentWithoutBonifications: null,
    };
  }

  return {
    monthlySaving,
    yearlySaving: monthlySaving * 12,
    paymentWithoutBonifications,
  };
};

export const getPaymentBreakdown = (mortgage: Mortgage) => {
  const snapshot = calculateMortgageSnapshot(mortgage);
  const monthlyPayment = snapshot.currentMonthlyPayment ?? calculateMonthlyPayment(mortgage);
  const balance = snapshot.displayedBalance;
  const rate = snapshot.currentRate ?? calculateCurrentRate(mortgage);

  if (!isFilledNumber(monthlyPayment) || monthlyPayment <= 0) {
    return null;
  }

  if (!isFilledNumber(balance) || balance <= 0) {
    return {
      totalPayment: monthlyPayment,
      principalPortion: null,
      interestPortion: null,
    };
  }

  if (!isFilledNumber(rate) || rate < 0) {
    return {
      totalPayment: monthlyPayment,
      principalPortion: null,
      interestPortion: null,
    };
  }

  const monthlyRate = rate / 100 / 12;
  const interestPortion = balance * monthlyRate;
  const principalPortion = monthlyPayment - interestPortion;

  if (principalPortion <= 0) {
    return {
      totalPayment: monthlyPayment,
      principalPortion: null,
      interestPortion: null,
    };
  }

  return {
    totalPayment: monthlyPayment,
    principalPortion,
    interestPortion,
  };
};

export const getMortgageInsightItems = (mortgage: Mortgage, property?: Property | undefined): string[] => {
  const items: string[] = [];
  const bonificationSummary = getBonificationSummary(mortgage);
  const savings = getBonificationSavings(mortgage);
  const rateSummary = getRateSummary(mortgage);
  const isMixed = /mixed/i.test(getMortgageTypeLabel(mortgage));
  const isInInitialPeriod = isMortgageInInitialPeriod(mortgage);
  const rateType = mortgage.fixedOrVariable === 'variable' ? 'variable' : 'fixed';

  if (bonificationSummary.knownActiveBonificationPoints > 0) {
    items.push(`Active bonifications reduce the rate by ${bonificationSummary.knownActiveBonificationPoints.toFixed(2)} pts.`);
  }

  if (savings.monthlySaving !== null) {
    items.push(`Estimated savings are ${formatCurrency(savings.monthlySaving, mortgage.currency)} per month.`);
  }

  if (mortgage.insuranceRequirements || mortgage.payrollBonificationConditions) {
    items.push('Linked insurance or payroll conditions are part of the mortgage package.');
  }

  if (isMixed && isInInitialPeriod) {
    items.push('The mortgage is currently in its initial fixed period.');
  } else if (isMixed) {
    items.push('The mortgage has moved beyond its initial fixed period.');
  } else {
    items.push(`The mortgage behaves as a ${rateType} mortgage.`);
  }

  if (rateSummary.explanation === null) {
    items.push('The current rate formula cannot be fully verified from the available data.');
  }

  if (property?.name) {
    items.push(`Linked to ${property.name}.`);
  }

  return items.slice(0, 4);
};

export const buildMortgageViewModel = (mortgage: Mortgage, property?: Property) => {
  const snapshot = calculateMortgageSnapshot(mortgage);
  const amortization = calculateAmortization(mortgage);
  const monthlyPayment = snapshot.currentMonthlyPayment ?? calculateMonthlyPayment(mortgage);
  const remainingMonths = snapshot.remainingMonths || calculateRemainingMortgageMonths(mortgage);
  const totalTermMonths = mortgage.totalPayments ?? mortgage.mortgageTermMonths ?? mortgage.mortgageTermYears * 12;
  const displayedRate = getDisplayedRate(mortgage);
  const rateSummary = getRateSummary(mortgage);
  const bonificationSummary = getBonificationSummary(mortgage);
  const savings = getBonificationSavings(mortgage);
  const paymentBreakdown = getPaymentBreakdown(mortgage);
  const insightItems = getMortgageInsightItems(mortgage, property);

  return {
    mortgageTypeLabel: getMortgageTypeLabel(mortgage),
    displayedRate,
    rateSummary,
    bonificationSummary,
    savings,
    paymentBreakdown,
    insightItems,
    summary: {
      monthlyPayment,
      balance: snapshot.displayedBalance,
      remainingMonths,
      remainingTermLabel:
        remainingMonths > 0
          ? formatMortgageTermMonths(remainingMonths, { suffix: 'remaining' })
          : totalTermMonths > 0
          ? formatMortgageTermMonths(totalTermMonths)
          : notSpecified,
      originalLoan: mortgage.originalLoanAmount,
      amortizedAmount: amortization.principalAmortized,
      amortizedPercentage: amortization.amortizedPercentage,
      linkedPropertyName: property?.name ?? null,
      sinceDate: mortgage.mortgageStartDate ? formatShortDate(mortgage.mortgageStartDate) : null,
      currentRate: rateSummary.currentRate,
      activeBonificationLabel:
        bonificationSummary.activeBonifications.length === 0
          ? 'None'
          : bonificationSummary.hasUnknownActivePoints
          ? `${bonificationSummary.knownActiveBonificationPoints.toFixed(2)} pts+`
          : `${bonificationSummary.knownActiveBonificationPoints.toFixed(2)} pts`,
      savingsLabel:
        savings.monthlySaving !== null
          ? `${formatCurrency(savings.monthlySaving, mortgage.currency)} / month`
          : null,
    },
    sections: {
      showBonifications: shouldShowBonifications(mortgage),
      showSavings: shouldShowSavings(mortgage),
      showPaymentBreakdown: shouldShowPaymentBreakdown(mortgage),
    },
    mortgageSnapshot: snapshot,
  };
};
