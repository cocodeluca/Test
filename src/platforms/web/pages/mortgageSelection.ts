import type { Mortgage, Property } from '../../../common/types';

export const normalizeSelectedMortgageId = (
  mortgages: Mortgage[],
  selectedMortgageId: string | null
): string | null =>
  selectedMortgageId && mortgages.some((mortgage) => mortgage.id === selectedMortgageId)
    ? selectedMortgageId
    : mortgages[0]?.id ?? null;

export const getMortgageSelectorLabel = (
  mortgage: Mortgage,
  property: Property | undefined
): string => `${mortgage.lenderName} — ${property?.name ?? 'Unlinked'}`;
