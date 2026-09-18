import type { BankConnection, CashAccount, OpenBankingProviderName } from '../../../common/types';
import {
  connectionStatusFromSync,
  createBankConnection,
  createLinkedCashAccount,
  normalizeBankConnection,
  normalizeCashAccount,
} from '../../../common/utils/cashAccounts';
import type {
  ProviderTransactionPage,
  ProviderTransactionRecord,
} from '../../../common/utils/bankTransactions';

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (
          publicToken: string,
          metadata: {
            institution?: { name?: string | null; institution_id?: string | null } | null;
            accounts?: Array<{ id: string }>;
          }
        ) => void;
        onExit?: (error: { error_code?: string; error_message?: string } | null) => void;
      }) => { open: () => void; destroy: () => void };
    };
  }
}

export interface ProviderConnectionSession {
  sessionId: string;
  providerName: OpenBankingProviderName;
  status: 'created' | 'redirect-required' | 'completed' | 'mock';
  redirectUrl?: string | null;
  createdAt: string;
  linkToken?: string | null;
  mode?: 'create' | 'update';
  connectionId?: string | null;
}

export interface ProviderConnectionResult {
  connection: BankConnection;
  accounts: CashAccount[];
}

export interface ProviderAdapter {
  providerName: OpenBankingProviderName;
  createConnectionSession: (input: {
    userId: string;
    institutionName: string;
    institutionId?: string;
    scenario?: 'success' | 'needs-reauth' | 'error';
    connectionId?: string;
    connectionStatus?: BankConnection['connectionStatus'];
  }) => Promise<ProviderConnectionSession>;
  completeConnection: (
    session: ProviderConnectionSession,
    input: {
      userId: string;
      institutionName: string;
      institutionId?: string;
      scenario?: 'success' | 'needs-reauth' | 'error';
      connectionId?: string;
    }
  ) => Promise<ProviderConnectionResult>;
  fetchAccounts: (connection: BankConnection) => Promise<CashAccount[]>;
  fetchBalances: (accounts: CashAccount[]) => Promise<CashAccount[]>;
  fetchTransactions?: (
    connection: BankConnection,
    accounts: CashAccount[],
    cursor?: string | null
  ) => Promise<ProviderTransactionPage>;
  refreshConnection: (connection: BankConnection, accounts: CashAccount[]) => Promise<ProviderConnectionResult>;
  disconnectConnection: (connection: BankConnection) => Promise<BankConnection>;
  deleteConnection: (connection: BankConnection) => Promise<void>;
}

const buildId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const jsonRequest = async <T>(url: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Open banking request failed');
  }
  return payload;
};

const loadPlaidScript = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Plaid Link is only available in the browser.');
  }

  if (window.Plaid) {
    return window.Plaid;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-provider="plaid-link"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Plaid Link.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    script.dataset.provider = 'plaid-link';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Plaid Link.'));
    document.head.appendChild(script);
  });

  if (!window.Plaid) {
    throw new Error('Plaid Link did not initialize correctly.');
  }

  return window.Plaid;
};

const launchPlaidLink = async (linkToken: string) => {
  const Plaid = await loadPlaidScript();

  return new Promise<{
    publicToken: string;
    institutionName: string;
    institutionId: string;
    selectedAccountIds: string[];
  }>((resolve, reject) => {
    const handler = Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        handler.destroy();
        resolve({
          publicToken,
          institutionName: metadata.institution?.name ?? 'Connected institution',
          institutionId: metadata.institution?.institution_id ?? 'plaid-institution',
          selectedAccountIds: metadata.accounts?.map((account) => account.id) ?? [],
        });
      },
      onExit: (error) => {
        handler.destroy();
        if (error?.error_code === 'INVALID_LINK_TOKEN') {
          reject(new Error('The connection session expired. Please try again.'));
          return;
        }
        if (error?.error_message) {
          reject(new Error(error.error_message));
          return;
        }
        reject(new Error('The bank connection flow was canceled.'));
      },
    });

    handler.open();
  });
};

const buildMockAccounts = (
  providerName: OpenBankingProviderName,
  userId: string,
  connectionId: string,
  institutionName: string,
  institutionId: string
): CashAccount[] => [
  createLinkedCashAccount({
    id: buildId('linked-checking'),
    userId,
    nickname: 'Main Checking',
    institutionName,
    institutionId,
    connectionId,
    providerName,
    externalAccountId: `${institutionId}:checking`,
    accountType: 'checking',
    currency: 'EUR',
    currentBalance: 14320,
    availableBalance: 14210,
    maskedReference: '****1042',
  }),
  createLinkedCashAccount({
    id: buildId('linked-savings'),
    userId,
    nickname: 'Reserve Savings',
    institutionName,
    institutionId,
    connectionId,
    providerName,
    externalAccountId: `${institutionId}:savings`,
    accountType: 'savings',
    currency: 'USD',
    currentBalance: 11890,
    availableBalance: 11890,
    maskedReference: '****5580',
  }),
];

const buildMockTransactions = (
  institutionId: string,
  lifecycle: 'pending' | 'posted'
): ProviderTransactionRecord[] => [
  {
    externalTransactionId: `${institutionId}:rent-2026-09`,
    externalAccountId: `${institutionId}:checking`,
    bookingDate: '2026-09-03',
    authorizedDate: '2026-09-02',
    amount: 1450,
    direction: 'credit',
    currency: 'EUR',
    description: 'September rent',
    counterparty: 'Tenant transfer',
    pending: false,
    metadata: { category: 'transfer' },
  },
  {
    externalTransactionId: `${institutionId}:insurance-2026`,
    externalAccountId: `${institutionId}:checking`,
    bookingDate: '2026-09-05',
    amount: 185,
    direction: 'debit',
    currency: 'EUR',
    description: 'Property insurance',
    counterparty: 'Insurance provider',
    pending: false,
    metadata: { category: 'insurance' },
  },
  {
    externalTransactionId: `${institutionId}:maintenance-pending`,
    externalAccountId: `${institutionId}:checking`,
    bookingDate: '2026-09-15',
    amount: 72,
    direction: 'debit',
    currency: 'EUR',
    description: 'Maintenance authorization',
    pending: true,
    metadata: { category: 'maintenance' },
  },
  {
    externalTransactionId: lifecycle === 'pending'
      ? `${institutionId}:card-lifecycle-pending`
      : `${institutionId}:card-lifecycle-posted`,
    ...(lifecycle === 'posted'
      ? { pendingExternalTransactionId: `${institutionId}:card-lifecycle-pending` }
      : {}),
    externalAccountId: `${institutionId}:checking`,
    bookingDate: lifecycle === 'pending' ? '2026-09-14' : '2026-09-15',
    authorizedDate: '2026-09-14',
    amount: 48,
    direction: 'debit',
    currency: 'EUR',
    description: 'Card purchase',
    counterparty: 'Local supplier',
    pending: lifecycle === 'pending',
    metadata: { category: 'card', lifecycle },
  },
  {
    externalTransactionId: `${institutionId}:card-similar-unrelated`,
    externalAccountId: `${institutionId}:checking`,
    bookingDate: '2026-09-15',
    authorizedDate: '2026-09-14',
    amount: 48,
    direction: 'debit',
    currency: 'EUR',
    description: 'Card purchase',
    counterparty: 'Local supplier',
    pending: false,
    metadata: { category: 'card', lifecycle: 'unrelated' },
  },
  {
    externalTransactionId: `${institutionId}:unmatched-removal`,
    externalAccountId: `${institutionId}:checking`,
    bookingDate: '2026-09-12',
    amount: 33,
    direction: 'debit',
    currency: 'EUR',
    description: 'Unmatched provider removal',
    pending: false,
    metadata: { category: 'other' },
  },
  {
    externalTransactionId: `${institutionId}:usd-interest`,
    externalAccountId: `${institutionId}:savings`,
    bookingDate: '2026-09-10',
    amount: 25,
    direction: 'credit',
    currency: 'USD',
    description: 'Savings interest',
    counterparty: 'Mock Bank',
    pending: false,
    metadata: { category: 'interest' },
  },
  ...(lifecycle === 'posted' ? [{
    externalTransactionId: `${institutionId}:usd-interest-reversal`,
    reversesExternalTransactionId: `${institutionId}:usd-interest`,
    externalAccountId: `${institutionId}:savings`,
    bookingDate: '2026-09-16',
    amount: 25,
    direction: 'debit' as const,
    currency: 'USD' as const,
    description: 'Savings interest reversal',
    counterparty: 'Mock Bank',
    pending: false,
    metadata: { category: 'interest', lifecycle: 'reversal' },
  }] : []),
];

const buildMockRemovedTransactions = (institutionId: string) => [
  {
    externalTransactionId: `${institutionId}:rent-2026-09`,
    externalAccountId: `${institutionId}:checking`,
    reason: 'provider-deleted',
  },
  {
    externalTransactionId: `${institutionId}:insurance-2026`,
    externalAccountId: `${institutionId}:checking`,
    reason: 'provider-deleted',
  },
  {
    externalTransactionId: `${institutionId}:unmatched-removal`,
    externalAccountId: `${institutionId}:checking`,
    reason: 'provider-deleted',
  },
  {
    externalTransactionId: `${institutionId}:card-similar-unrelated`,
    externalAccountId: `${institutionId}:checking`,
    reason: 'provider-deleted',
  },
];

const createMockAdapter = (providerName: OpenBankingProviderName): ProviderAdapter => ({
  providerName,
  async createConnectionSession({
    userId,
    institutionId,
    scenario = 'success',
    connectionId,
    connectionStatus,
  }) {
    await delay(450);
    return {
      sessionId: buildId(`session-${userId}`),
      providerName,
      status: scenario === 'success' ? 'redirect-required' : 'created',
      redirectUrl: `https://provider.mock/${institutionId ?? buildId('institution')}`,
      createdAt: new Date().toISOString(),
      mode: connectionId && connectionStatus !== 'disconnected' ? 'update' : 'create',
      connectionId: connectionId ?? null,
    };
  },
  async completeConnection(session, { userId, institutionName, institutionId, scenario = 'success', connectionId }) {
    await delay(650);
    const nextConnectionId = connectionId ?? buildId('connection');
    const nextInstitutionId = institutionId ?? buildId('institution');
    const syncStatus = scenario === 'error' ? 'error' : scenario === 'needs-reauth' ? 'needs-reauth' : 'success';
    const needsReauth = scenario === 'needs-reauth';
    const accounts = scenario === 'error' ? [] : buildMockAccounts(providerName, userId, nextConnectionId, institutionName, nextInstitutionId);

    return {
      connection: createBankConnection({
        id: nextConnectionId,
        userId,
        providerName: session.providerName,
        institutionName,
        institutionId: nextInstitutionId,
        connectionStatus: connectionStatusFromSync(syncStatus, needsReauth),
        syncStatus,
        needsReauth,
        errorMessage: scenario === 'error' ? 'Provider session failed during development simulation.' : null,
        linkedAccountIds: accounts.map((account) => account.id),
        lastSyncedAt: scenario === 'error' ? null : new Date().toISOString(),
      }),
      accounts,
    };
  },
  async fetchAccounts(connection) {
    await delay(320);
    return buildMockAccounts(providerName, connection.userId ?? 'local-user', connection.id, connection.institutionName, connection.institutionId);
  },
  async fetchBalances(accounts) {
    await delay(320);
    return accounts.map((account, index) =>
      normalizeCashAccount({
        ...account,
        currentBalance: Math.max((account.currentBalance ?? account.balance ?? 0) + (index === 0 ? 85 : -45), 0),
        availableBalance:
          account.availableBalance === null || account.availableBalance === undefined
            ? null
            : Math.max(account.availableBalance + (index === 0 ? 60 : -45), 0),
        syncStatus: 'success',
        lastSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
  },
  ...(providerName === 'mock-bank'
    ? {
        async fetchTransactions(connection: BankConnection, _accounts: CashAccount[], cursor?: string | null) {
          await delay(320);
          const lifecycle = cursor ? 'posted' : 'pending';
          return {
            transactions: buildMockTransactions(connection.institutionId, lifecycle),
            removedTransactions: lifecycle === 'posted'
              ? buildMockRemovedTransactions(connection.institutionId)
              : [],
            nextCursor: `${connection.id}:mock-v2`,
            hasMore: false,
          };
        },
      }
    : {}),
  async refreshConnection(connection, accounts) {
    await delay(480);
    const refreshedAccounts =
      connection.needsReauth || connection.syncStatus === 'needs-reauth'
        ? accounts.map((account) =>
            normalizeCashAccount({
              ...account,
              syncStatus: 'needs-reauth',
              updatedAt: new Date().toISOString(),
            })
          )
        : await createMockAdapter(providerName).fetchBalances(accounts);

    return {
      connection: normalizeBankConnection({
        ...connection,
        connectionStatus: connection.needsReauth ? 'needs-reauthentication' : 'connected',
        syncStatus: connection.needsReauth ? 'needs-reauth' : 'success',
        lastSyncedAt: connection.needsReauth ? connection.lastSyncedAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      accounts: refreshedAccounts,
    };
  },
  async disconnectConnection(connection) {
    await delay(260);
    return normalizeBankConnection({
      ...connection,
      connectionStatus: 'disconnected',
      syncStatus: 'idle',
      needsReauth: false,
      linkedAccountIds: [],
      updatedAt: new Date().toISOString(),
    });
  },
  async deleteConnection() {},
});

const plaidAdapter: ProviderAdapter = {
  providerName: 'plaid',
  async createConnectionSession({ connectionId }) {
    return jsonRequest<ProviderConnectionSession>('/api/open-banking/session/create', {
      providerName: 'plaid',
      connectionId: connectionId ?? null,
    });
  },
  async completeConnection(session, _input) {
    if (!session.linkToken) {
      throw new Error('Missing Plaid link token.');
    }

    const linkResult = await launchPlaidLink(session.linkToken);
    return jsonRequest<ProviderConnectionResult>('/api/open-banking/connection/complete', {
      sessionId: session.sessionId,
      publicToken: linkResult.publicToken,
    });
  },
  async fetchAccounts(connection) {
    const result = await jsonRequest<ProviderConnectionResult>('/api/open-banking/connection/refresh', {
      connectionId: connection.id,
    });
    return result.accounts;
  },
  async fetchBalances(accounts) {
    if (accounts.length === 0 || !accounts[0].connectionId) {
      return [];
    }
    const result = await jsonRequest<ProviderConnectionResult>('/api/open-banking/connection/refresh', {
      connectionId: accounts[0].connectionId,
    });
    return result.accounts;
  },
  async refreshConnection(connection, _accounts) {
    return jsonRequest<ProviderConnectionResult>('/api/open-banking/connection/refresh', {
      connectionId: connection.id,
    });
  },
  async disconnectConnection(connection) {
    await jsonRequest<{ ok: boolean; connectionId: string }>('/api/open-banking/connection/disconnect', {
      connectionId: connection.id,
    });
    return normalizeBankConnection({
      ...connection,
      connectionStatus: 'disconnected',
      syncStatus: 'idle',
      needsReauth: false,
      linkedAccountIds: [],
      updatedAt: new Date().toISOString(),
    });
  },
  async deleteConnection(connection) {
    await jsonRequest<{ ok: boolean; connectionId: string; deleted: boolean }>(
      '/api/open-banking/connection/delete',
      { connectionId: connection.id }
    );
  },
};

export const openBankingAdapters: Record<OpenBankingProviderName, ProviderAdapter> = {
  'mock-bank': createMockAdapter('mock-bank'),
  tink: createMockAdapter('tink'),
  truelayer: createMockAdapter('truelayer'),
  yapily: createMockAdapter('yapily'),
  plaid: plaidAdapter,
  other: createMockAdapter('other'),
};
