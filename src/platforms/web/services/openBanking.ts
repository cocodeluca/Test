import type { BankConnection, CashAccount, OpenBankingProviderName } from '../../../common/types';
import {
  connectionStatusFromSync,
  createBankConnection,
  createLinkedCashAccount,
  normalizeBankConnection,
  normalizeCashAccount,
} from '../../../common/utils/cashAccounts';

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
  refreshConnection: (connection: BankConnection, accounts: CashAccount[]) => Promise<ProviderConnectionResult>;
  disconnectConnection: (connection: BankConnection) => Promise<BankConnection>;
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
    accountType: 'savings',
    currency: 'USD',
    currentBalance: 11890,
    availableBalance: 11890,
    maskedReference: '****5580',
  }),
];

const createMockAdapter = (providerName: OpenBankingProviderName): ProviderAdapter => ({
  providerName,
  async createConnectionSession({ userId, institutionId, scenario = 'success', connectionId }) {
    await delay(450);
    return {
      sessionId: buildId(`session-${userId}`),
      providerName,
      status: scenario === 'success' ? 'redirect-required' : 'created',
      redirectUrl: `https://provider.mock/${institutionId ?? buildId('institution')}`,
      createdAt: new Date().toISOString(),
      mode: connectionId ? 'update' : 'create',
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
});

const plaidAdapter: ProviderAdapter = {
  providerName: 'plaid',
  async createConnectionSession({ userId, connectionId }) {
    return jsonRequest<ProviderConnectionSession>('/api/open-banking/session/create', {
      providerName: 'plaid',
      userId,
      connectionId: connectionId ?? null,
    });
  },
  async completeConnection(session, input) {
    if (!session.linkToken) {
      throw new Error('Missing Plaid link token.');
    }

    const linkResult = await launchPlaidLink(session.linkToken);
    return jsonRequest<ProviderConnectionResult>('/api/open-banking/connection/complete', {
      providerName: 'plaid',
      userId: input.userId,
      connectionId: input.connectionId ?? session.connectionId ?? null,
      publicToken: linkResult.publicToken,
      institutionName: linkResult.institutionName,
      institutionId: linkResult.institutionId,
      selectedAccountIds: linkResult.selectedAccountIds,
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
};

export const openBankingAdapters: Record<OpenBankingProviderName, ProviderAdapter> = {
  'mock-bank': createMockAdapter('mock-bank'),
  tink: createMockAdapter('tink'),
  truelayer: createMockAdapter('truelayer'),
  yapily: createMockAdapter('yapily'),
  plaid: plaidAdapter,
  other: createMockAdapter('other'),
};
