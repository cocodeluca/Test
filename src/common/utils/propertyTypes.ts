export const propertyTypeValues = [
  'Apartment',
  'House',
  'Garage / Parking',
  'Commercial Unit',
  'Storage Room',
  'Land',
  'Other',
] as const;

export type SupportedPropertyType = (typeof propertyTypeValues)[number];

export type ParkingCoverage = 'covered' | 'uncovered';

export const defaultPropertyType: SupportedPropertyType = 'Apartment';

export const isGarageParkingPropertyType = (propertyType?: string | null): boolean =>
  propertyType === 'Garage / Parking';

export const usesResidentialRoomFields = (propertyType?: string | null): boolean =>
  propertyType === 'Apartment' || propertyType === 'House';

export const usesResidentialAmenityFields = (propertyType?: string | null): boolean =>
  propertyType === 'Apartment' || propertyType === 'House' || propertyType === 'Commercial Unit';
