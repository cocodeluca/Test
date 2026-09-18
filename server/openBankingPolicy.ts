export const SANTANDER_SPAIN_INSTITUTION_ID = 'ins_65';
export const SANTANDER_SPAIN_COUNTRY_CODE = 'ES';
export const SANTANDER_SPAIN_INSTITUTION_NAME = 'Banco Santander';
export const PLAID_READ_ONLY_PRODUCTS = ['auth'] as const;

export type PlaidEnvironment = 'sandbox' | 'development' | 'production';

export interface PlaidPilotConfiguration {
  environment: PlaidEnvironment;
  products: ['auth'];
  countryCodes: string[];
  redirectUri: string;
}

export type PlaidPreflightIssue =
  | 'PLAID_CLIENT_ID_MISSING'
  | 'PLAID_SECRET_MISSING'
  | 'OPEN_BANKING_VAULT_KEY_MISSING'
  | 'OPEN_BANKING_VAULT_KEY_INVALID'
  | 'PLAID_ENV_INVALID'
  | 'PLAID_PRODUCTS_INVALID'
  | 'PLAID_COUNTRY_CODES_INVALID'
  | 'PLAID_REDIRECT_URI_MISSING'
  | 'PLAID_REDIRECT_URI_UNSAFE';

export interface PlaidPilotConfigurationStatus {
  ready: boolean;
  environment: PlaidEnvironment | null;
  credentials: {
    clientIdConfigured: boolean;
    secretConfigured: boolean;
  };
  vault: {
    configured: boolean;
    valid: boolean;
  };
  scope: {
    countryCodes: string[];
    linkProducts: ['auth'];
    accountsEnabled: true;
    balancesEnabled: true;
    transactionsEnabled: false;
    transferEnabled: false;
    paymentInitiationEnabled: false;
  };
  oauth: {
    required: true;
    redirectUriConfigured: boolean;
    redirectUriSafe: boolean;
  };
  issues: PlaidPreflightIssue[];
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

const isConfigured = (value: string | undefined) => Boolean(value?.trim());

const isValidVaultKey = (value: string | undefined) => {
  const normalized = value?.trim();
  if (!normalized || !/^[A-Za-z0-9+/]{43}=$/.test(normalized)) return false;
  const key = Buffer.from(normalized, 'base64');
  return key.length === 32 && key.toString('base64') === normalized;
};

const isSafeRedirectUri = (
  value: string | undefined,
  plaidEnvironment: PlaidEnvironment | null
) => {
  const normalized = value?.trim();
  if (!normalized) return false;

  try {
    const redirectUri = new URL(normalized);
    const sandboxLocalhost =
      plaidEnvironment === 'sandbox' &&
      redirectUri.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(redirectUri.hostname);
    return (
      (redirectUri.protocol === 'https:' || sandboxLocalhost) &&
      !redirectUri.username &&
      !redirectUri.password &&
      !redirectUri.search &&
      !redirectUri.hash
    );
  } catch {
    return false;
  }
};

export const inspectPlaidPilotConfiguration = (
  environment: NodeJS.ProcessEnv = process.env
): PlaidPilotConfigurationStatus => {
  const issues: PlaidPreflightIssue[] = [];
  const rawEnvironment = environment.PLAID_ENV?.trim().toLowerCase();
  const plaidEnvironment: PlaidEnvironment | null =
    rawEnvironment === 'sandbox' ||
    rawEnvironment === 'development' ||
    rawEnvironment === 'production'
      ? rawEnvironment
      : null;
  const clientIdConfigured = isConfigured(environment.PLAID_CLIENT_ID);
  const secretConfigured = isConfigured(environment.PLAID_SECRET);
  const vaultConfigured = isConfigured(environment.OPEN_BANKING_VAULT_KEY);
  const vaultValid = isValidVaultKey(environment.OPEN_BANKING_VAULT_KEY);
  const products = parseCsv(environment.PLAID_PRODUCTS).map((value) => value.toLowerCase());
  const productsValid =
    products.length === PLAID_READ_ONLY_PRODUCTS.length &&
    products.every((value, index) => value === PLAID_READ_ONLY_PRODUCTS[index]);
  const countryCodes = parseCsv(environment.PLAID_COUNTRY_CODES).map((value) => value.toUpperCase());
  const countryCodesValid = plaidEnvironment === 'sandbox'
    ? countryCodes.length > 0 && countryCodes.every((value) => /^[A-Z]{2}$/.test(value))
    : countryCodes.length === 1 && countryCodes[0] === SANTANDER_SPAIN_COUNTRY_CODE;
  const redirectUriConfigured = isConfigured(environment.PLAID_REDIRECT_URI);
  const redirectUriSafe = isSafeRedirectUri(environment.PLAID_REDIRECT_URI, plaidEnvironment);

  if (!clientIdConfigured) issues.push('PLAID_CLIENT_ID_MISSING');
  if (!secretConfigured) issues.push('PLAID_SECRET_MISSING');
  if (!vaultConfigured) issues.push('OPEN_BANKING_VAULT_KEY_MISSING');
  else if (!vaultValid) issues.push('OPEN_BANKING_VAULT_KEY_INVALID');
  if (!plaidEnvironment) issues.push('PLAID_ENV_INVALID');
  if (!productsValid) issues.push('PLAID_PRODUCTS_INVALID');
  if (!countryCodesValid) issues.push('PLAID_COUNTRY_CODES_INVALID');
  if (!redirectUriConfigured) issues.push('PLAID_REDIRECT_URI_MISSING');
  else if (!redirectUriSafe) issues.push('PLAID_REDIRECT_URI_UNSAFE');

  return {
    ready: issues.length === 0,
    environment: plaidEnvironment,
    credentials: { clientIdConfigured, secretConfigured },
    vault: { configured: vaultConfigured, valid: vaultValid },
    scope: {
      countryCodes,
      linkProducts: ['auth'],
      accountsEnabled: true,
      balancesEnabled: true,
      transactionsEnabled: false,
      transferEnabled: false,
      paymentInitiationEnabled: false,
    },
    oauth: {
      required: true,
      redirectUriConfigured,
      redirectUriSafe,
    },
    issues,
  };
};

export const readPlaidPilotConfiguration = (
  environment: NodeJS.ProcessEnv = process.env
): PlaidPilotConfiguration => {
  const status = inspectPlaidPilotConfiguration(environment);
  if (!status.ready || !status.environment) {
    throw new OpenBankingConfigurationError(
      `Santander Plaid configuration is not ready: ${status.issues.join(', ')}.`
    );
  }

  return {
    environment: status.environment,
    products: ['auth'],
    countryCodes: [...status.scope.countryCodes],
    redirectUri: environment.PLAID_REDIRECT_URI!.trim(),
  };
};

export const validatePlaidInstitutionForConfiguration = (
  institution: {
    institutionId: string;
    name: string;
    countryCodes: string[];
    products: string[];
    oauth?: boolean;
  },
  configuration: PlaidPilotConfiguration,
  expectedInstitutionId: string
) => {
  if (institution.institutionId !== expectedInstitutionId) {
    throw new OpenBankingConfigurationError(
      'Plaid institution metadata did not match the connected Item.'
    );
  }

  if (configuration.environment !== 'sandbox') {
    validateSantanderSpainInstitution(institution);
    return;
  }

  if (
    !institution.institutionId ||
    !institution.countryCodes.some((countryCode) =>
      configuration.countryCodes.includes(countryCode)
    ) ||
    !institution.products.includes('balance') ||
    !institution.products.includes('auth')
  ) {
    throw new OpenBankingConfigurationError(
      'The Sandbox institution does not support the configured read-only Accounts and Balance flow.'
    );
  }
};

export const validateSantanderSpainInstitution = (institution: {
  institutionId: string;
  name: string;
  countryCodes: string[];
  products: string[];
  oauth?: boolean;
}) => {
  if (
    institution.institutionId !== SANTANDER_SPAIN_INSTITUTION_ID ||
    !institution.countryCodes.includes(SANTANDER_SPAIN_COUNTRY_CODE) ||
    !institution.products.includes('balance') ||
    !institution.products.includes('auth') ||
    institution.oauth !== true
  ) {
    throw new OpenBankingConfigurationError(
      'The connected institution is not approved for the Santander Spain balance pilot.'
    );
  }
};
