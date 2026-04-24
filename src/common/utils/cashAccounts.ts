import type {
  BankConnection,
  BankConnectionStatus,
  CashAccount,
  CashAccountSourceType,
  CashAccountType,
  OpenBankingProviderName,
  SyncStatus,
} from '../types';
import type { DisplayCurrency } from '../types/settings';
import { translateCurrentLanguage } from '../../platforms/web/i18n/translations';

const buildId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeBalance = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

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
    externalAccountId: account.externalAccountId ?? null,
    institutionId: account.institutionId ?? null,
    maskedReference: account.maskedReference ?? null,
    connectionId: account.connectionId ?? null,
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
    status: overrides.status ?? 'active',
    syncStatus: overrides.syncStatus ?? 'success',
    providerName: overrides.providerName ?? 'mock-bank',
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

export const groupCashAccountsByCurrency = (accounts: CashAccount[]) =>
  accounts.reduce<Record<DisplayCurrency, number>>((totals, account) => {
    const currency = account.currency;
    totals[currency] = (totals[currency] ?? 0) + getCashAccountBalance(account);
    return totals;
  }, {} as Record<DisplayCurrency, number>);

export const calculateCashAccountSummary = (accounts: CashAccount[]) => {
  const manualAccounts = accounts.filter((account) => account.sourceType === 'manual');
  const linkedAccounts = accounts.filter((account) => account.sourceType === 'linked');

  return {
    totalAccounts: accounts.length,
    manualCount: manualAccounts.length,
    linkedCount: linkedAccounts.length,
    totalsByCurrency: groupCashAccountsByCurrency(accounts),
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
