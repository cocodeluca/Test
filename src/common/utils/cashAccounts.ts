import type {
  BankConnection,
  BankConnectionStatus,
  CashAccount,
  CashAccountSourceType,
  CashAccountType,
  OpenBankingProviderName,
  PlaidEnvironment,
  SyncStatus,
} from '../types';
import type { DisplayCurrency } from '../types/settings';
import { translateCurrentLanguage } from '../../platforms/web/i18n/translations';

const buildId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeBalance = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const normalizeProviderEnvironment = (
  providerName: OpenBankingProviderName | null | undefined,
  environment: PlaidEnvironment | null | undefined
): PlaidEnvironment | null => {
  if (providerName !== 'plaid') return null;
  if (environment === 'sandbox' || environment === 'production') return environment;
  // All frontend Plaid records created before environment tagging were local Sandbox data.
  return 'sandbox';
};

const createTranslationRecord = <TKey extends string>(prefix: string) =>
  new Proxy({} as Record<TKey, string>, {
    get: (_target, property) => translateCurrentLanguage(`${prefix}.${String(property)}`),
  });

export const cashAccountTypeLabels = createTranslationRecord<CashAccountType>(
  'cashAccounts.accountTypeOptions'
);

export const syncStatusLabels = createTranslationRecord<SyncStatus>('cashAccounts.syncStatusOptions');

export const bankConnectionStatusLabels = createTranslationRecord<BankConnectionStatus>(
  'cashAccounts.connectionStatus'
);

export const normalizeCashAccount = (account: Partial<CashAccount> & { id: string }): CashAccount => {
  const now = new Date().toISOString();
  const sourceType: CashAccountSourceType =
    account.sourceType ?? (account.isManual === false ? 'linked' : 'manual');
  const currentBalance = normalizeBalance(account.currentBalance ?? account.balance);
  const availableBalance =
    account.availableBalance === null || account.availableBalance === undefined
      ? null
      : normalizeBalance(account.availableBalance);

  return {
    id: account.id,
    userId: account.userId,
    nickname:
      account.nickname ?? account.name ?? translateCurrentLanguage('cashAccounts.defaults.cashAccount'),
    institutionName:
      account.institutionName ??
      account.nickname ??
      account.name ??
      translateCurrentLanguage('cashAccounts.defaults.manualAccount'),
    accountType: account.accountType ?? 'cash',
    currency: account.currency ?? 'EUR',
    currentBalance,
    availableBalance,
    sourceType,
    providerName: account.providerName ?? null,
    providerEnvironment: normalizeProviderEnvironment(
      account.providerName,
      account.providerEnvironment
    ),
    externalAccountId: account.externalAccountId ?? null,
    institutionId: account.institutionId ?? null,
    maskedReference: account.maskedReference ?? null,
    connectionId: account.connectionId ?? null,
    isIncludedInPortfolio: account.isIncludedInPortfolio ?? true,
    status: account.status ?? 'active',
    syncStatus: account.syncStatus ?? (sourceType === 'manual' ? 'idle' : 'success'),
    lastSyncedAt: account.lastSyncedAt ?? null,
    notes: account.notes ?? '',
    createdAt: account.createdAt ?? now,
    updatedAt: account.updatedAt ?? now,
    name:
      account.nickname ?? account.name ?? translateCurrentLanguage('cashAccounts.defaults.cashAccount'),
    balance: currentBalance,
    isManual: sourceType === 'manual',
  };
};

export const normalizeBankConnection = (
  connection: Partial<BankConnection> & { id: string }
): BankConnection => {
  const now = new Date().toISOString();
  return {
    id: connection.id,
    userId: connection.userId,
    providerName: connection.providerName ?? 'mock-bank',
    providerEnvironment: normalizeProviderEnvironment(
      connection.providerName ?? 'mock-bank',
      connection.providerEnvironment
    ),
    institutionName:
      connection.institutionName ??
      translateCurrentLanguage('cashAccounts.defaults.connectedInstitution'),
    institutionId: connection.institutionId ?? `institution-${connection.id}`,
    connectionStatus: connection.connectionStatus ?? 'connected',
    syncStatus: connection.syncStatus ?? 'success',
    lastSyncedAt: connection.lastSyncedAt ?? now,
    needsReauth: connection.needsReauth ?? false,
    errorMessage: connection.errorMessage ?? null,
    linkedAccountIds: connection.linkedAccountIds ?? [],
    createdAt: connection.createdAt ?? now,
    updatedAt: connection.updatedAt ?? now,
  };
};

export const createManualCashAccount = (overrides: Partial<CashAccount> = {}): CashAccount =>
  normalizeCashAccount({
    id: overrides.id ?? buildId('cash'),
    sourceType: 'manual',
    nickname:
      overrides.nickname ?? translateCurrentLanguage('cashAccounts.defaults.manualCashAccount'),
    institutionName:
      overrides.institutionName ?? translateCurrentLanguage('cashAccounts.defaults.manualAccount'),
    accountType: overrides.accountType ?? 'checking',
    currency: overrides.currency ?? 'EUR',
    currentBalance: overrides.currentBalance ?? overrides.balance ?? 0,
    availableBalance: overrides.availableBalance ?? null,
    isIncludedInPortfolio: overrides.isIncludedInPortfolio,
    status: overrides.status ?? 'active',
    syncStatus: overrides.syncStatus ?? 'idle',
    notes: overrides.notes ?? '',
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
    userId: overrides.userId,
  });

export const createLinkedCashAccount = (overrides: Partial<CashAccount> = {}): CashAccount =>
  normalizeCashAccount({
    id: overrides.id ?? buildId('linked-cash'),
    sourceType: 'linked',
    nickname: overrides.nickname ?? translateCurrentLanguage('cashAccounts.defaults.linkedAccount'),
    institutionName:
      overrides.institutionName ??
      translateCurrentLanguage('cashAccounts.defaults.connectedInstitution'),
    accountType: overrides.accountType ?? 'checking',
    currency: overrides.currency ?? 'EUR',
    currentBalance: overrides.currentBalance ?? overrides.balance ?? 0,
    availableBalance: overrides.availableBalance ?? null,
    isIncludedInPortfolio: overrides.isIncludedInPortfolio,
    status: overrides.status ?? 'active',
    syncStatus: overrides.syncStatus ?? 'success',
    providerName: overrides.providerName ?? 'mock-bank',
    providerEnvironment: overrides.providerEnvironment,
    externalAccountId: overrides.externalAccountId ?? buildId('external'),
    institutionId: overrides.institutionId ?? null,
    maskedReference: overrides.maskedReference ?? null,
    connectionId: overrides.connectionId ?? null,
    notes: overrides.notes ?? '',
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
    userId: overrides.userId,
  });

export const createBankConnection = (
  overrides: Partial<BankConnection> = {}
): BankConnection =>
  normalizeBankConnection({
    id: overrides.id ?? buildId('connection'),
    providerName: overrides.providerName ?? 'mock-bank',
    providerEnvironment: overrides.providerEnvironment,
    institutionName:
      overrides.institutionName ??
      translateCurrentLanguage('cashAccounts.defaults.connectedInstitution'),
    institutionId: overrides.institutionId ?? buildId('institution'),
    connectionStatus: overrides.connectionStatus ?? 'connected',
    syncStatus: overrides.syncStatus ?? 'success',
    needsReauth: overrides.needsReauth ?? false,
    linkedAccountIds: overrides.linkedAccountIds ?? [],
    errorMessage: overrides.errorMessage ?? null,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
    lastSyncedAt: overrides.lastSyncedAt,
    userId: overrides.userId,
  });

export const getCashAccountDisplayName = (account: CashAccount) =>
  account.nickname || account.name || translateCurrentLanguage('cashAccounts.defaults.cashAccount');

export const getCashAccountBalance = (account: CashAccount) =>
  normalizeBalance(account.currentBalance ?? account.balance);

export const isCashAccountIncludedInPortfolio = (
  account: Pick<CashAccount, 'sourceType' | 'isIncludedInPortfolio'>
) => account.sourceType === 'manual' || account.isIncludedInPortfolio !== false;

export const isActiveCashAccountIncludedInPortfolio = (
  account: Pick<CashAccount, 'sourceType' | 'isIncludedInPortfolio' | 'status'>
) => account.status === 'active' && isCashAccountIncludedInPortfolio(account);

export const setLinkedCashAccountPortfolioInclusion = (
  accounts: CashAccount[],
  accountId: string,
  isIncludedInPortfolio: boolean,
  timestamp = new Date().toISOString()
): CashAccount[] =>
  accounts.map((account) =>
    account.id === accountId && account.sourceType === 'linked' && account.status === 'active'
      ? normalizeCashAccount({
          ...account,
          isIncludedInPortfolio,
          updatedAt: timestamp,
        })
      : account
  );

export const groupCashAccountsByCurrency = (accounts: CashAccount[]) =>
  accounts.reduce<Record<DisplayCurrency, number>>((totals, account) => {
    const currency = account.currency;
    totals[currency] = (totals[currency] ?? 0) + getCashAccountBalance(account);
    return totals;
  }, {} as Record<DisplayCurrency, number>);

export const getLinkedCashAccountIdentity = (
  account: Pick<CashAccount, 'sourceType' | 'providerName' | 'providerEnvironment' | 'externalAccountId' | 'connectionId'>
): string | null =>
  account.sourceType === 'linked' && account.providerName && account.externalAccountId
    ? `${normalizeProviderEnvironment(account.providerName, account.providerEnvironment) ?? 'local'}:${account.connectionId ? `connection:${account.connectionId}` : 'legacy-connection'}:${account.providerName}:${account.externalAccountId}`
    : null;

const getLegacyLinkedCashAccountIdentity = (
  account: Pick<CashAccount, 'sourceType' | 'providerName' | 'providerEnvironment' | 'externalAccountId'>
): string | null =>
  account.sourceType === 'linked' && account.providerName && account.externalAccountId
    ? `${normalizeProviderEnvironment(account.providerName, account.providerEnvironment) ?? 'local'}:${account.providerName}:${account.externalAccountId}`
    : null;

export const upsertLinkedCashAccounts = (
  existingAccounts: CashAccount[],
  incomingAccounts: CashAccount[]
): CashAccount[] => {
  const lastIncomingIndexByIdentity = new Map<string, number>();
  incomingAccounts.forEach((account, index) => {
    const identity = getLinkedCashAccountIdentity(account);
    if (identity) lastIncomingIndexByIdentity.set(identity, index);
  });
  const deduplicatedIncomingAccounts = incomingAccounts.filter((account, index) => {
    const identity = getLinkedCashAccountIdentity(account);
    return identity === null || lastIncomingIndexByIdentity.get(identity) === index;
  });
  const incomingIdentities = new Set(
    deduplicatedIncomingAccounts
      .map(getLinkedCashAccountIdentity)
      .filter((identity): identity is string => Boolean(identity))
  );
  const existingByIdentity = new Map(
    existingAccounts
      .map((account) => [getLinkedCashAccountIdentity(account), account] as const)
      .filter((entry): entry is readonly [string, CashAccount] => Boolean(entry[0]))
  );
  const legacyExistingByIdentity = new Map(
    existingAccounts
      .filter((account) => !account.connectionId)
      .map((account) => [getLegacyLinkedCashAccountIdentity(account), account] as const)
      .filter((entry): entry is readonly [string, CashAccount] => Boolean(entry[0]))
  );
  const claimedExistingAccountIds = new Set<string>();
  const matchedExistingAccounts = deduplicatedIncomingAccounts.map((account) => {
    const identity = getLinkedCashAccountIdentity(account);
    const exact = identity ? existingByIdentity.get(identity) : undefined;
    if (exact && !claimedExistingAccountIds.has(exact.id)) {
      claimedExistingAccountIds.add(exact.id);
      return exact;
    }
    const legacyIdentity = getLegacyLinkedCashAccountIdentity(account);
    const legacy = legacyIdentity ? legacyExistingByIdentity.get(legacyIdentity) : undefined;
    if (legacy && !claimedExistingAccountIds.has(legacy.id)) {
      claimedExistingAccountIds.add(legacy.id);
      return legacy;
    }
    if (!account.connectionId || !account.maskedReference) return undefined;
    const reconnectCandidates = existingAccounts.filter((candidate) =>
      !claimedExistingAccountIds.has(candidate.id) &&
      candidate.sourceType === 'linked' &&
      candidate.status === 'inactive' &&
      candidate.connectionId === account.connectionId &&
      candidate.providerName === account.providerName &&
      normalizeProviderEnvironment(candidate.providerName, candidate.providerEnvironment) ===
        normalizeProviderEnvironment(account.providerName, account.providerEnvironment) &&
      candidate.institutionId === account.institutionId &&
      candidate.accountType === account.accountType &&
      candidate.currency === account.currency &&
      candidate.maskedReference === account.maskedReference
    );
    if (reconnectCandidates.length !== 1) return undefined;
    claimedExistingAccountIds.add(reconnectCandidates[0].id);
    return reconnectCandidates[0];
  });
  const matchedExistingIds = claimedExistingAccountIds;
  const retained = existingAccounts.filter((account) => {
    const identity = getLinkedCashAccountIdentity(account);
    return (identity === null || !incomingIdentities.has(identity)) && !matchedExistingIds.has(account.id);
  });
  const upserted = deduplicatedIncomingAccounts.map((account, index) => {
    const existing = matchedExistingAccounts[index];
    return normalizeCashAccount({
      ...existing,
      ...account,
      id: existing?.id ?? account.id,
      createdAt: existing?.createdAt ?? account.createdAt,
      isIncludedInPortfolio:
        existing?.isIncludedInPortfolio ?? account.isIncludedInPortfolio ?? true,
    });
  });

  return [...retained, ...upserted];
};

export const canRefreshBankConnection = (
  connection: Pick<BankConnection, 'connectionStatus'>
) => connection.connectionStatus !== 'disconnected';

export const getBankConnectionReconnectMode = (
  connection: Pick<BankConnection, 'connectionStatus'>
): 'connect-again' | 'update' =>
  connection.connectionStatus === 'disconnected' ? 'connect-again' : 'update';

export const deactivateLinkedCashAccountsForConnection = (
  accounts: CashAccount[],
  connectionId: string,
  timestamp = new Date().toISOString()
): CashAccount[] =>
  accounts.map((account) =>
    account.sourceType === 'linked' && account.connectionId === connectionId
      ? normalizeCashAccount({
          ...account,
          status: 'inactive',
          syncStatus: 'idle',
          updatedAt: timestamp,
        })
      : account
  );

export const calculateCashAccountSummary = (accounts: CashAccount[]) => {
  const activeAccounts = accounts.filter(isActiveCashAccountIncludedInPortfolio);
  const manualAccounts = activeAccounts.filter((account) => account.sourceType === 'manual');
  const linkedAccounts = activeAccounts.filter((account) => account.sourceType === 'linked');

  return {
    totalAccounts: activeAccounts.length,
    manualCount: manualAccounts.length,
    linkedCount: linkedAccounts.length,
    totalsByCurrency: groupCashAccountsByCurrency(activeAccounts),
    manualTotalsByCurrency: groupCashAccountsByCurrency(manualAccounts),
    linkedTotalsByCurrency: groupCashAccountsByCurrency(linkedAccounts),
  };
};

export const updateCashAccountSync = (
  account: CashAccount,
  syncStatus: SyncStatus,
  currentBalance = getCashAccountBalance(account)
): CashAccount =>
  normalizeCashAccount({
    ...account,
    currentBalance,
    syncStatus,
    lastSyncedAt: syncStatus === 'success' ? new Date().toISOString() : account.lastSyncedAt,
    updatedAt: new Date().toISOString(),
  });

export const connectionStatusFromSync = (
  syncStatus: SyncStatus,
  needsReauth: boolean
): BankConnectionStatus => {
  if (needsReauth || syncStatus === 'needs-reauth') {
    return 'needs-reauthentication';
  }
  if (syncStatus === 'syncing') {
    return 'syncing';
  }
  if (syncStatus === 'error') {
    return 'error';
  }
  if (syncStatus === 'success') {
    return 'connected';
  }
  return 'not-connected';
};

export const providerLabels = createTranslationRecord<OpenBankingProviderName>(
  'cashAccounts.providerOptions'
);
