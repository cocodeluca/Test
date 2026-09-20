import { randomUUID } from 'node:crypto';
import {
  readPlaidPilotConfiguration,
} from './openBankingPolicy';
import type {
  ProviderTransactionPage,
  ProviderTransactionRecord,
} from '../src/common/utils/bankTransactions';

const getPlaidBaseUrl = () => {
  const plaidEnvironment = readPlaidPilotConfiguration().environment;
  return plaidEnvironment === 'development'
    ? 'https://development.plaid.com'
    : plaidEnvironment === 'production'
    ? 'https://production.plaid.com'
    : 'https://sandbox.plaid.com';
};

interface PlaidLinkTokenResponse {
  link_token: string;
  expiration?: string;
}

interface PlaidPublicTokenExchangeResponse {
  access_token: string;
  item_id: string;
}

interface PlaidInstitutionResponse {
  institution: {
    institution_id: string;
    name: string;
    country_codes: string[];
    products: string[];
    oauth?: boolean;
  };
}

interface PlaidAccountBalance {
  available?: number | null;
  current?: number | null;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
}

export interface PlaidAccount {
  account_id: string;
  balances: PlaidAccountBalance;
  mask?: string | null;
  name?: string | null;
  official_name?: string | null;
  subtype?: string | null;
  type?: string | null;
}

export interface PlaidAccountsBalanceResponse {
  accounts: PlaidAccount[];
  item?: {
    consent_expiration_time?: string | null;
    institution_id?: string | null;
  };
}

export interface PlaidItemGetResponse {
  item: {
    item_id: string;
    institution_id?: string | null;
    consent_expiration_time?: string | null;
  };
}

const getRequiredEnv = (name: 'PLAID_CLIENT_ID' | 'PLAID_SECRET'): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export class PlaidProviderError extends Error {
  readonly code: string | null;
  readonly requestId: string | null;
  readonly errorType: string | null;
  readonly httpStatus: number | null;

  constructor(
    message: string,
    code?: string | null,
    requestId?: string | null,
    errorType?: string | null,
    httpStatus?: number | null
  ) {
    super(message);
    this.name = 'PlaidProviderError';
    this.code = code ?? null;
    this.requestId = requestId ?? null;
    this.errorType = errorType ?? null;
    this.httpStatus = httpStatus ?? null;
  }
}

export interface PlaidTransaction {
  account_id: string;
  transaction_id: string;
  pending_transaction_id?: string | null;
  pending: boolean;
  date: string;
  authorized_date?: string | null;
  amount: number;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  payment_channel?: string | null;
  website?: string | null;
  personal_finance_category?: {
    primary?: string | null;
    detailed?: string | null;
  } | null;
  counterparties?: Array<{ name?: string | null }>;
}

export interface PlaidTransactionsSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
  request_id?: string;
}

const plaidRequest = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const clientId = getRequiredEnv('PLAID_CLIENT_ID');
  const secret = getRequiredEnv('PLAID_SECRET');

  const response = await fetch(`${getPlaidBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Plaid-Version': '2020-09-14',
    },
    body: JSON.stringify({
      client_id: clientId,
      secret,
      ...body,
    }),
  });

  const payload = (await response.json()) as T & {
    error_message?: string;
    error_code?: string;
    error_type?: string;
    request_id?: string;
  };

  if (!response.ok) {
    const message =
      payload.error_message ||
      `${path} failed with status ${response.status}`;
    throw new PlaidProviderError(
      message,
      payload.error_code,
      payload.request_id,
      payload.error_type,
      response.status
    );
  }

  return payload;
};

export const createPlaidLinkToken = async (input: {
  userId: string;
  accessToken?: string | null;
  intent?: 'connect' | 'reauthentication' | 'transactions-consent';
}): Promise<{ linkToken: string; expiration?: string; mode: 'create' | 'update' }> => {
  const configuration = readPlaidPilotConfiguration();
  const products = input.accessToken ? undefined : configuration.products;
  const body: Record<string, unknown> = {
    client_name: process.env.PLAID_CLIENT_NAME ?? 'RePortfolio',
    user: { client_user_id: input.userId },
    language: 'en',
    country_codes: configuration.countryCodes,
  };

  if (input.accessToken) {
    body.access_token = input.accessToken;
    if (input.intent === 'transactions-consent') {
      body.additional_consented_products = ['transactions'];
    } else {
      body.update = { account_selection_enabled: true };
    }
  } else {
    body.products = products;
  }

  body.redirect_uri = configuration.redirectUri;

  const result = await plaidRequest<PlaidLinkTokenResponse>('/link/token/create', body);
  return {
    linkToken: result.link_token,
    expiration: result.expiration,
    mode: input.accessToken ? 'update' : 'create',
  };
};

export const exchangePlaidPublicToken = async (publicToken: string) =>
  plaidRequest<PlaidPublicTokenExchangeResponse>('/item/public_token/exchange', {
    public_token: publicToken,
  });

export const fetchPlaidItem = async (accessToken: string) =>
  plaidRequest<PlaidItemGetResponse>('/item/get', {
    access_token: accessToken,
  });

export const fetchPlaidInstitution = async (institutionId: string) => {
  const configuration = readPlaidPilotConfiguration();
  const result = await plaidRequest<PlaidInstitutionResponse>('/institutions/get_by_id', {
    institution_id: institutionId,
    country_codes: configuration.countryCodes,
  });
  return {
    institutionId: result.institution.institution_id,
    name: result.institution.name,
    countryCodes: result.institution.country_codes,
    products: result.institution.products,
    oauth: result.institution.oauth === true,
  };
};

export const fetchPlaidBalances = async (accessToken: string) =>
  plaidRequest<PlaidAccountsBalanceResponse>('/accounts/balance/get', {
    access_token: accessToken,
  });

export const fetchPlaidTransactionsSyncPage = async (
  accessToken: string,
  cursor?: string | null
) => plaidRequest<PlaidTransactionsSyncResponse>('/transactions/sync', {
  access_token: accessToken,
  ...(cursor ? { cursor } : {}),
});

export const removePlaidItem = async (accessToken: string) =>
  plaidRequest<{ removed: boolean; request_id: string }>('/item/remove', {
    access_token: accessToken,
  });

const mapCurrency = (currency: string | null | undefined): 'EUR' | 'USD' | 'ARS' | 'GBP' => {
  const value = (currency ?? '').toUpperCase();
  if (value === 'EUR') return 'EUR';
  if (value === 'USD') return 'USD';
  if (value === 'ARS') return 'ARS';
  if (value === 'GBP') return 'GBP';
  throw new PlaidProviderError('Plaid returned an unsupported account currency.');
};

const mapPlaidTransaction = (transaction: PlaidTransaction): ProviderTransactionRecord => {
  if (!transaction.account_id || !transaction.transaction_id || !transaction.date) {
    throw new PlaidProviderError('Plaid returned an incomplete transaction identity.');
  }
  if (!Number.isFinite(transaction.amount)) {
    throw new PlaidProviderError('Plaid returned an invalid transaction amount.');
  }
  const category = transaction.personal_finance_category;
  const metadata = {
    ...(transaction.payment_channel ? { paymentChannel: transaction.payment_channel } : {}),
    ...(transaction.website ? { website: transaction.website } : {}),
    ...(category?.primary ? { categoryPrimary: category.primary } : {}),
    ...(category?.detailed ? { categoryDetailed: category.detailed } : {}),
  };
  const counterparty = transaction.merchant_name ??
    transaction.counterparties?.find((candidate) => candidate.name)?.name ??
    null;

  return {
    externalTransactionId: transaction.transaction_id,
    pendingExternalTransactionId: transaction.pending_transaction_id ?? null,
    externalAccountId: transaction.account_id,
    bookingDate: transaction.date,
    authorizedDate: transaction.authorized_date ?? null,
    amount: Math.abs(transaction.amount),
    // Plaid signs money leaving an account positively; the canonical model does the opposite.
    direction: transaction.amount < 0 ? 'credit' : 'debit',
    currency: mapCurrency(
      transaction.iso_currency_code ?? transaction.unofficial_currency_code
    ),
    description: transaction.merchant_name ?? transaction.name ?? 'Plaid transaction',
    counterparty,
    pending: transaction.pending,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
};

export const mapPlaidTransactionsSyncPage = (
  response: PlaidTransactionsSyncResponse
): ProviderTransactionPage => ({
  transactions: [...response.added, ...response.modified].map(mapPlaidTransaction),
  removedTransactions: response.removed.map((transaction) => ({
    externalTransactionId: transaction.transaction_id,
    externalAccountId: null,
    reason: 'provider-removed',
  })),
  nextCursor: response.next_cursor,
  hasMore: response.has_more,
});

const mapAccountType = (account: PlaidAccount) => {
  const subtype = (account.subtype ?? '').toLowerCase();
  const type = (account.type ?? '').toLowerCase();
  if (subtype.includes('checking')) return 'checking' as const;
  if (subtype.includes('savings')) return 'savings' as const;
  if (subtype.includes('brokerage')) return 'brokerage-cash' as const;
  if (type.includes('depository')) return 'checking' as const;
  return 'other' as const;
};

export const mapPlaidAccountsToCashAccounts = (input: {
  userId: string;
  providerName: 'plaid';
  connectionId: string;
  institutionName: string;
  institutionId: string;
  accounts: PlaidAccount[];
  selectedAccountIds?: string[];
  syncedAt: string;
}) =>
  input.accounts
    .filter((account) =>
      input.selectedAccountIds && input.selectedAccountIds.length > 0
        ? input.selectedAccountIds.includes(account.account_id)
        : true
    )
    .map((account) => ({
      id: `cash-linked-${randomUUID()}`,
      userId: input.userId,
      nickname: account.name || account.official_name || 'Linked account',
      institutionName: input.institutionName,
      accountType: mapAccountType(account),
      currency: mapCurrency(
        account.balances.iso_currency_code ?? account.balances.unofficial_currency_code
      ),
      currentBalance: typeof account.balances.current === 'number' ? account.balances.current : 0,
      availableBalance:
        typeof account.balances.available === 'number' ? account.balances.available : null,
      sourceType: 'linked' as const,
      providerName: input.providerName,
      externalAccountId: account.account_id,
      institutionId: input.institutionId,
      maskedReference: account.mask ? `****${account.mask}` : null,
      connectionId: input.connectionId,
      status: 'active' as const,
      syncStatus: 'success' as const,
      lastSyncedAt: input.syncedAt,
      notes: '',
      createdAt: input.syncedAt,
      updatedAt: input.syncedAt,
      name: account.name || account.official_name || 'Linked account',
      balance: typeof account.balances.current === 'number' ? account.balances.current : 0,
      isManual: false,
    }));

export const isPlaidLoginRequiredError = (error: unknown) =>
  error instanceof Error &&
  /ITEM_LOGIN_REQUIRED|PENDING_EXPIRATION|PENDING_DISCONNECT|login required/i.test(error.message);
