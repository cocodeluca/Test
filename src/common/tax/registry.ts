import { Property } from '../types';
import { argentinaTaxModule } from './modules/argentina';
import { genericTaxModule } from './modules/generic';
import { portugalTaxModule } from './modules/portugal';
import { spainTaxModule } from './modules/spain';
import { CountryTaxModule, PropertyTaxProfile } from './types';

const countryTaxModules: CountryTaxModule[] = [
  spainTaxModule,
  argentinaTaxModule,
  portugalTaxModule,
];

export const normalizeCountryName = (country: string | undefined | null): string => {
  const normalized = (country ?? '').trim().toLowerCase();

  switch (normalized) {
    case 'spain':
    case 'espana':
    case 'españa':
    case 'espaÃ±a':
      return 'Spain';
    case 'argentina':
      return 'Argentina';
    case 'portugal':
      return 'Portugal';
    default:
      return 'Other';
  }
};

export const getCountryTaxModule = (country: string | undefined | null): CountryTaxModule => {
  const normalizedCountry = normalizeCountryName(country);

  return (
    countryTaxModules.find((module) => module.country === normalizedCountry) ?? genericTaxModule
  );
};

export const getPropertyTaxModule = (
  property: Pick<Property, 'country'>
): CountryTaxModule => {
  const normalizedCountry = normalizeCountryName(property.country);

  return (
    countryTaxModules.find(
      (module) =>
        module.country === normalizedCountry && module.supportsProperty({ country: normalizedCountry })
    ) ?? genericTaxModule
  );
};

export const getPropertyTaxProfile = (
  property: Pick<Property, 'country'>
): PropertyTaxProfile => {
  const module = getPropertyTaxModule(property);

  return {
    moduleId: module.id,
    country: module.country,
    label: module.label,
    status: module.status,
    description: module.description,
    fieldDefinitions: module.fieldDefinitions,
    computationOutline: module.computationOutline,
  };
};

export const getAvailableCountryTaxModules = (): CountryTaxModule[] => [
  ...countryTaxModules,
  genericTaxModule,
];
