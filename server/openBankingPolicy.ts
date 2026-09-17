export const SANTANDER_SPAIN_INSTITUTION_ID = 'ins_65';
export const SANTANDER_SPAIN_COUNTRY_CODE = 'ES';
export const SANTANDER_SPAIN_INSTITUTION_NAME = 'Banco Santander';
export const PLAID_READ_ONLY_PRODUCTS = ['auth'] as const;

export type PlaidEnvironment = 'sandbox' | 'development' | 'production';

export interface PlaidPilotConfiguration {
  environment: PlaidEnvironment;
  products: ['auth'];
  countryCodes: ['ES'];
}

export class OpenBankingConfigurationError extends Error {
  readonly code = 'OPEN_BANKING_CONFIGURATION_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'OpenBankingConfigurationError';
  }
}

const parseCsv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const readPlaidPilotConfiguration = (
  environment: NodeJS.ProcessEnv = process.env
): PlaidPilotConfiguration => {
  const plaidEnvironment = environment.PLAID_ENV?.trim().toLowerCase();
  if (
    plaidEnvironment !== 'sandbox' &&
    plaidEnvironment !== 'development' &&
    plaidEnvironment !== 'production'
  ) {
    throw new OpenBankingConfigurationError(
      'PLAID_ENV must explicitly be sandbox, development, or production.'
    );
  }

  const products = parseCsv(environment.PLAID_PRODUCTS).map((value) => value.toLowerCase());
  if (
    products.length !== PLAID_READ_ONLY_PRODUCTS.length ||
    products.some((value, index) => value !== PLAID_READ_ONLY_PRODUCTS[index])
  ) {
    throw new OpenBankingConfigurationError(
      'The Santander pilot permits only the read-only Plaid auth bootstrap product.'
    );
  }

  const countryCodes = parseCsv(environment.PLAID_COUNTRY_CODES).map((value) => value.toUpperCase());
  if (countryCodes.length !== 1 || countryCodes[0] !== SANTANDER_SPAIN_COUNTRY_CODE) {
    throw new OpenBankingConfigurationError(
      'The Santander pilot permits only the ES country code.'
    );
  }

  return {
    environment: plaidEnvironment,
    products: ['auth'],
    countryCodes: ['ES'],
  };
};

export const validateSantanderSpainInstitution = (institution: {
  institutionId: string;
  name: string;
  countryCodes: string[];
  products: string[];
}) => {
  if (
    institution.institutionId !== SANTANDER_SPAIN_INSTITUTION_ID ||
    !institution.countryCodes.includes(SANTANDER_SPAIN_COUNTRY_CODE) ||
    !institution.products.includes('balance') ||
    !institution.products.includes('auth')
  ) {
    throw new OpenBankingConfigurationError(
      'The connected institution is not approved for the Santander Spain balance pilot.'
    );
  }
};
