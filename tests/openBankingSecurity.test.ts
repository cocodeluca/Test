import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { CashAccount } from '../src/common/types';
import {
  applyBankConnectionAccountResult,
  applyBankConnectionTransactionResult,
  type BankingConnectionOperationState,
} from '../src/common/utils/bankingConnectionOperations';
import { normalizeProviderTransactions } from '../src/common/utils/bankTransactions';
import { createBankConnection, createLinkedCashAccount } from '../src/common/utils/cashAccounts';
import {
  buildPlaidConnectionCompletionPayload,
  getOpenBankingProviderErrorCode,
  OpenBankingRequestError,
  runTransactionsConsentUpdate,
  type ProviderAdapter,
} from '../src/platforms/web/services/openBanking';
import {
  OpenBankingAuthenticationError,
  unavailableOpenBankingAuthenticator,
} from '../server/openBankingAuth';
import {
  createOpenBankingLinkSessionStore,
  OpenBankingLinkSessionError,
} from '../server/openBankingLinkSessions';
import {
  OpenBankingConfigurationError,
  inspectPlaidPilotConfiguration,
  readPlaidPilotConfiguration,
} from '../server/openBankingPolicy';
import {
  createOpenBankingService,
  OpenBankingAccountScopeError,
  OpenBankingConnectionStateError,
  type OpenBankingService,
  type PlaidPilotGateway,
} from '../server/openBankingService';
import {
  createOpenBankingConnectionStore,
  OpenBankingConnectionOwnershipError,
  OpenBankingVaultError,
  type OpenBankingConnectionStore,
  type StoredOpenBankingConnection,
} from '../server/openBankingStore';
import { brokerApiPlugin } from '../server/brokerApiPlugin';
import {
  createPlaidLinkToken,
  mapPlaidAccountsToCashAccounts,
  mapPlaidTransactionsSyncPage,
  PlaidProviderError,
  type PlaidTransaction,
  type PlaidTransactionsSyncResponse,
} from '../server/plaid';

const TEST_MASTER_KEY = Buffer.alloc(32, 17).toString('base64');
const FIXED_NOW = '2026-09-17T15:00:00.000Z';

interface TestResponse {
  statusCode: number;
  body: string;
  setHeader(name: string, value: string): void;
  end(value?: string): void;
}

const priorPlaidEnvironment = {
  PLAID_ENV: process.env.PLAID_ENV,
  PLAID_PRODUCTS: process.env.PLAID_PRODUCTS,
  PLAID_COUNTRY_CODES: process.env.PLAID_COUNTRY_CODES,
  PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
  PLAID_SECRET: process.env.PLAID_SECRET,
  OPEN_BANKING_VAULT_KEY: process.env.OPEN_BANKING_VAULT_KEY,
  PLAID_REDIRECT_URI: process.env.PLAID_REDIRECT_URI,
};

test.before(() => {
  process.env.PLAID_ENV = 'sandbox';
  process.env.PLAID_PRODUCTS = 'auth';
  process.env.PLAID_COUNTRY_CODES = 'ES';
  process.env.PLAID_CLIENT_ID = 'test-client-id';
  process.env.PLAID_SECRET = 'test-secret';
  process.env.OPEN_BANKING_VAULT_KEY = TEST_MASTER_KEY;
  process.env.PLAID_REDIRECT_URI = 'http://localhost:8081/plaid-oauth';
});

test.after(() => {
  for (const [name, value] of Object.entries(priorPlaidEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const createStoreFixture = async (context: TestContext) => {
  const directory = await mkdtemp(path.join(tmpdir(), 're-open-banking-'));
  context.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, 'vault.json');
  return {
    filePath,
    store: createOpenBankingConnectionStore({
      filePath,
      encodedMasterKey: TEST_MASTER_KEY,
    }),
  };
};

const storedConnection = (
  overrides: Partial<StoredOpenBankingConnection> = {}
): StoredOpenBankingConnection => ({
  id: 'connection-santander-1',
  userId: 'owner-a',
  providerName: 'plaid',
  institutionName: 'Banco Santander',
  institutionId: 'ins_65',
  accessToken: 'access-production-secret-value',
  itemId: 'item-santander-1',
  providerItemStatus: 'active',
  disconnectedAt: null,
  revokedItems: [],
  selectedAccountIds: ['plaid-account-1'],
  consentExpirationTime: null,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  ...overrides,
});

const plaidAccount = {
  account_id: 'plaid-account-1',
  balances: {
    current: 1250,
    available: 1200,
    iso_currency_code: 'EUR',
  },
  mask: '1234',
  name: 'Cuenta Santander',
  official_name: 'Cuenta Corriente',
  subtype: 'checking',
  type: 'depository',
};

const makeGateway = (
  overrides: Partial<PlaidPilotGateway> = {}
): PlaidPilotGateway => ({
  async createLinkToken({ accessToken }) {
    return {
      linkToken: accessToken ? 'link-update' : 'link-create',
      expiration: '2026-09-17T15:05:00.000Z',
      mode: accessToken ? 'update' : 'create',
    };
  },
  async exchangePublicToken() {
    return { access_token: 'access-from-exchange', item_id: 'item-from-exchange' };
  },
  async fetchItem() {
    return {
      item: {
        item_id: 'item-santander-1',
        institution_id: 'ins_65',
        consent_expiration_time: null,
      },
    };
  },
  async fetchInstitution() {
    return {
      institutionId: 'ins_65',
      name: 'Banco Santander',
      countryCodes: ['ES'],
      products: ['auth', 'balance'],
      oauth: true,
    };
  },
  async fetchBalances() {
    return {
      accounts: [plaidAccount],
      item: { institution_id: 'ins_65', consent_expiration_time: null },
    };
  },
  async fetchTransactions(_accessToken, cursor) {
    return {
      transactions: [],
      removedTransactions: [],
      nextCursor: cursor ?? 'test-cursor',
      hasMore: false,
    };
  },
  async removeItem() {
    return { removed: true };
  },
  isLoginRequiredError() {
    return false;
  },
  mapAccounts(input) {
    return input.accounts.map((account) => createLinkedCashAccount({
      id: `provider-${account.account_id}-fresh`,
      userId: input.userId,
      providerName: 'plaid',
      connectionId: input.connectionId,
      institutionName: input.institutionName,
      institutionId: input.institutionId,
      externalAccountId: account.account_id,
      nickname: account.name ?? 'Linked account',
      accountType: 'checking',
      currency: 'EUR',
      currentBalance: account.balances.current ?? 0,
      availableBalance: account.balances.available ?? null,
      status: 'active',
      syncStatus: 'success',
      lastSyncedAt: input.syncedAt,
      createdAt: input.syncedAt,
      updatedAt: input.syncedAt,
    }));
  },
  ...overrides,
});

const makeService = (
  store: OpenBankingConnectionStore,
  gateway: PlaidPilotGateway = makeGateway(),
  linkSessions = createOpenBankingLinkSessionStore({
    now: () => new Date(FIXED_NOW),
    createId: () => 'link-session-1',
  })
) => createOpenBankingService({
  store,
  plaid: gateway,
  linkSessions,
  now: () => new Date(FIXED_NOW),
  createConnectionId: () => 'connection-created-1',
});

const withSandboxTransactions = async (operation: () => Promise<void>) => {
  const previousProducts = process.env.PLAID_PRODUCTS;
  process.env.PLAID_PRODUCTS = 'auth,transactions';
  try {
    await operation();
  } finally {
    if (previousProducts === undefined) delete process.env.PLAID_PRODUCTS;
    else process.env.PLAID_PRODUCTS = previousProducts;
  }
};

const plaidTransaction = (
  overrides: Partial<PlaidTransaction> = {}
): PlaidTransaction => ({
  account_id: 'plaid-account-1',
  transaction_id: 'plaid-transaction-1',
  pending_transaction_id: null,
  pending: false,
  date: '2026-09-17',
  authorized_date: '2026-09-16',
  amount: 25,
  iso_currency_code: 'EUR',
  name: 'Plaid transaction',
  merchant_name: 'Plaid merchant',
  payment_channel: 'online',
  personal_finance_category: {
    primary: 'GENERAL_MERCHANDISE',
    detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
  },
  ...overrides,
});

const plaidSyncPage = (
  overrides: Partial<PlaidTransactionsSyncResponse> = {}
): PlaidTransactionsSyncResponse => ({
  added: [],
  modified: [],
  removed: [],
  next_cursor: 'cursor-final',
  has_more: false,
  request_id: 'provider-request-id',
  ...overrides,
});

test('encrypted vault round-trips tokens without storing plaintext', async (context) => {
  const { store, filePath } = await createStoreFixture(context);
  const connection = storedConnection();
  await store.save(connection);

  const fileContent = await readFile(filePath, 'utf8');
  assert.equal(fileContent.includes(connection.accessToken!), false);
  assert.equal(fileContent.includes('"accessToken"'), false);
  assert.match(fileContent, /"algorithm": "aes-256-gcm"/);
  assert.equal((await store.loadOwned(connection.userId, connection.id))?.accessToken, connection.accessToken);
});

test('missing or invalid vault encryption keys fail closed', () => {
  assert.throws(
    () => createOpenBankingConnectionStore({ filePath: 'unused', encodedMasterKey: undefined }),
    OpenBankingVaultError
  );
  assert.throws(
    () => createOpenBankingConnectionStore({ filePath: 'unused', encodedMasterKey: 'dG9vLXNob3J0' }),
    OpenBankingVaultError
  );
});

test('corrupted ciphertext and malformed stores fail closed', async (context) => {
  const { store, filePath } = await createStoreFixture(context);
  await store.save(storedConnection());
  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Array<{
    encryptedAccessToken: { authTag: string };
  }>;
  parsed[0].encryptedAccessToken.authTag = Buffer.alloc(16, 99).toString('base64');
  await writeFile(filePath, JSON.stringify(parsed), 'utf8');
  await assert.rejects(store.list(), OpenBankingVaultError);

  await writeFile(filePath, '{not-json', 'utf8');
  await assert.rejects(store.list(), OpenBankingVaultError);
});

test('server Link sessions reject wrong owners, expiry, and replay', () => {
  let currentTime = new Date(FIXED_NOW);
  let sequence = 0;
  const sessions = createOpenBankingLinkSessionStore({
    ttlMs: 1000,
    now: () => currentTime,
    createId: () => `session-${++sequence}`,
  });
  const first = sessions.create({ ownerUserId: 'owner-a' });
  assert.throws(() => sessions.consume(first.id, 'owner-b'), OpenBankingLinkSessionError);
  assert.equal(sessions.consume(first.id, 'owner-a').ownerUserId, 'owner-a');
  assert.throws(() => sessions.consume(first.id, 'owner-a'), OpenBankingLinkSessionError);

  const expired = sessions.create({ ownerUserId: 'owner-a' });
  currentTime = new Date('2026-09-17T15:00:02.000Z');
  assert.throws(() => sessions.consume(expired.id, 'owner-a'), OpenBankingLinkSessionError);
});

test('pilot configuration permits read-only Sandbox transactions while keeping Production unchanged', () => {
  const validEnvironment = {
    PLAID_ENV: 'sandbox',
    PLAID_PRODUCTS: 'auth',
    PLAID_COUNTRY_CODES: 'ES',
    PLAID_CLIENT_ID: 'client-id',
    PLAID_SECRET: 'secret',
    OPEN_BANKING_VAULT_KEY: TEST_MASTER_KEY,
    PLAID_REDIRECT_URI: 'http://localhost:8081/plaid-oauth',
  };
  assert.deepEqual(readPlaidPilotConfiguration(validEnvironment), {
    environment: 'sandbox',
    products: ['auth'],
    countryCodes: ['ES'],
    redirectUri: 'http://localhost:8081/plaid-oauth',
  });
  assert.throws(() => readPlaidPilotConfiguration({}), OpenBankingConfigurationError);
  assert.deepEqual(readPlaidPilotConfiguration({
    ...validEnvironment,
    PLAID_COUNTRY_CODES: 'US',
  }).countryCodes, ['US']);
  const sandboxTransactions = inspectPlaidPilotConfiguration({
    ...validEnvironment,
    PLAID_PRODUCTS: 'auth,transactions',
  });
  assert.equal(sandboxTransactions.ready, true);
  assert.deepEqual(sandboxTransactions.scope.linkProducts, ['auth', 'transactions']);
  assert.equal(sandboxTransactions.scope.transactionsEnabled, true);
  for (const products of [
    'transactions',
    'transfer',
    'payment_initiation',
    'auth,transfer',
  ]) {
    assert.throws(() => readPlaidPilotConfiguration({
      ...validEnvironment,
      PLAID_ENV: 'sandbox',
      PLAID_PRODUCTS: products,
      PLAID_COUNTRY_CODES: 'ES',
    }), OpenBankingConfigurationError);
  }

  assert.deepEqual(readPlaidPilotConfiguration({
    ...validEnvironment,
    PLAID_COUNTRY_CODES: 'US,ES',
  }).countryCodes, ['US', 'ES']);
  assert.throws(() => readPlaidPilotConfiguration({
    ...validEnvironment,
    PLAID_ENV: 'production',
    PLAID_PRODUCTS: 'auth,transactions',
    PLAID_REDIRECT_URI: 'https://portfolio.example.com/plaid-oauth',
    PLAID_COUNTRY_CODES: 'ES',
  }), OpenBankingConfigurationError);
  assert.throws(() => readPlaidPilotConfiguration({
    ...validEnvironment,
    PLAID_ENV: 'production',
    PLAID_REDIRECT_URI: 'https://portfolio.example.com/plaid-oauth',
    PLAID_COUNTRY_CODES: 'US,ES',
  }), OpenBankingConfigurationError);
});

test('preflight configuration reports missing secrets without returning secret values', () => {
  const status = inspectPlaidPilotConfiguration({
    PLAID_ENV: 'production',
    PLAID_PRODUCTS: 'auth',
    PLAID_COUNTRY_CODES: 'ES',
    PLAID_REDIRECT_URI: 'https://portfolio.example.com/plaid-oauth',
  });

  assert.equal(status.ready, false);
  assert.deepEqual(status.issues, [
    'PLAID_CLIENT_ID_MISSING',
    'PLAID_SECRET_MISSING',
    'OPEN_BANKING_VAULT_KEY_MISSING',
  ]);
  assert.equal(JSON.stringify(status).includes('portfolio.example.com'), false);
});

test('OAuth redirect validation fails closed for unsafe production URLs', () => {
  const base = {
    PLAID_ENV: 'production',
    PLAID_PRODUCTS: 'auth',
    PLAID_COUNTRY_CODES: 'ES',
    PLAID_CLIENT_ID: 'client-id',
    PLAID_SECRET: 'secret',
    OPEN_BANKING_VAULT_KEY: TEST_MASTER_KEY,
  };
  for (const redirectUri of [
    undefined,
    'http://portfolio.example.com/plaid-oauth',
    'https://user:password@portfolio.example.com/plaid-oauth',
    'https://portfolio.example.com/plaid-oauth?token=secret',
    'https://portfolio.example.com/plaid-oauth#token',
  ]) {
    const status = inspectPlaidPilotConfiguration({
      ...base,
      PLAID_REDIRECT_URI: redirectUri,
    });
    assert.equal(status.ready, false);
    assert.equal(status.oauth.redirectUriSafe, false);
  }
});

test('Santander preflight confirms only sanitized Accounts and Balance readiness', async (context) => {
  const { store } = await createStoreFixture(context);
  const service = makeService(store);
  const result = await service.getSantanderPreflight({ userId: 'owner-a' });

  assert.equal(result.ready, true);
  assert.equal(result.institution.institutionId, 'ins_65');
  assert.equal(result.institution.countryCode, 'ES');
  assert.equal(result.institution.clientAccessConfirmed, true);
  assert.equal(result.institution.accountsSupported, true);
  assert.equal(result.institution.balancesSupported, true);
  assert.equal(result.institution.oauthSupported, true);
  assert.equal(result.configuration.scope.transactionsEnabled, false);
  assert.equal(result.configuration.scope.transferEnabled, false);
  assert.equal(result.configuration.scope.paymentInitiationEnabled, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(process.env.PLAID_CLIENT_ID!), false);
  assert.equal(serialized.includes(process.env.PLAID_SECRET!), false);
  assert.equal(serialized.includes(process.env.OPEN_BANKING_VAULT_KEY!), false);
  assert.equal(serialized.includes(process.env.PLAID_REDIRECT_URI!), false);
});

test('Santander preflight rejects missing capabilities and provider lookup failures', async (context) => {
  const { store } = await createStoreFixture(context);
  const missingCapability = await makeService(store, makeGateway({
    async fetchInstitution() {
      return {
        institutionId: 'ins_65',
        name: 'Banco Santander',
        countryCodes: ['ES'],
        products: ['auth'],
        oauth: true,
      };
    },
  })).getSantanderPreflight({ userId: 'owner-a' });
  assert.equal(missingCapability.ready, false);
  assert.deepEqual(missingCapability.issues, ['SANTANDER_CAPABILITIES_INVALID']);

  const lookupFailure = await makeService(store, makeGateway({
    async fetchInstitution() {
      throw new Error('credential details must stay server-side');
    },
  })).getSantanderPreflight({ userId: 'owner-a' });
  assert.equal(lookupFailure.ready, false);
  assert.deepEqual(lookupFailure.issues, ['PLAID_INSTITUTION_LOOKUP_FAILED']);
  assert.equal(JSON.stringify(lookupFailure).includes('credential details'), false);
});

test('Plaid Sandbox sync paginates and reuses the canonical transaction lifecycle idempotently', async (context) => {
  await withSandboxTransactions(async () => {
    const { store } = await createStoreFixture(context);
    const stored = storedConnection({
      selectedAccountIds: ['plaid-account-1', 'plaid-account-2'],
    });
    await store.save(stored);
    const requestedCursors: Array<string | null> = [];
    const gateway = makeGateway({
      async fetchTransactions(accessToken, cursor) {
        assert.equal(accessToken, stored.accessToken);
        requestedCursors.push(cursor ?? null);
        if (!cursor) {
          return mapPlaidTransactionsSyncPage(plaidSyncPage({
            added: [
              plaidTransaction({
                transaction_id: 'pending-card-1',
                pending: true,
                merchant_name: 'Card purchase',
              }),
              plaidTransaction({
                transaction_id: 'same-looking-account-1',
                merchant_name: 'Same merchant',
                amount: 45,
              }),
              plaidTransaction({
                account_id: 'plaid-account-2',
                transaction_id: 'same-looking-account-2',
                merchant_name: 'Same merchant',
                amount: 45,
              }),
            ],
            modified: [
              plaidTransaction({
                transaction_id: 'same-looking-account-1',
                merchant_name: 'Corrected merchant',
                amount: 47,
              }),
            ],
            next_cursor: 'cursor-page-1',
            has_more: true,
          }));
        }
        if (cursor === 'cursor-page-1') {
          return mapPlaidTransactionsSyncPage(plaidSyncPage({
            added: [
              plaidTransaction({
                transaction_id: 'posted-card-1',
                pending_transaction_id: 'pending-card-1',
                pending: false,
                merchant_name: 'Card purchase posted',
              }),
            ],
            removed: [{ transaction_id: 'removed-transaction-1' }],
            next_cursor: 'cursor-page-2',
          }));
        }
        assert.equal(cursor, 'cursor-page-2');
        return mapPlaidTransactionsSyncPage(plaidSyncPage({
          next_cursor: 'cursor-page-2',
        }));
      },
    });
    const service = makeService(store, gateway);
    const firstPage = await service.syncTransactions(
      { userId: stored.userId },
      stored.id,
      null
    );

    assert.deepEqual(requestedCursors, [null, 'cursor-page-1']);
    assert.equal(firstPage.hasMore, false);
    assert.equal(firstPage.nextCursor, 'cursor-page-2');
    assert.equal(firstPage.transactions.length, 5);
    assert.deepEqual(firstPage.removedTransactions, [{
      externalTransactionId: 'removed-transaction-1',
      externalAccountId: null,
      reason: 'provider-removed',
    }]);
    assert.equal(firstPage.transactions[0].direction, 'debit');
    assert.equal(firstPage.transactions[0].amount, 25);
    assert.equal(firstPage.transactions[0].pending, true);
    assert.equal(firstPage.transactions[4].pendingExternalTransactionId, 'pending-card-1');
    assert.equal(JSON.stringify(firstPage).includes(stored.accessToken!), false);
    assert.equal(JSON.stringify(firstPage).includes(process.env.PLAID_SECRET!), false);

    const accounts = [
      createLinkedCashAccount({
        id: 'cash-plaid-1',
        userId: stored.userId,
        providerName: 'plaid',
        connectionId: stored.id,
        institutionName: stored.institutionName,
        institutionId: stored.institutionId,
        externalAccountId: 'plaid-account-1',
        currency: 'EUR',
        status: 'active',
      }),
      createLinkedCashAccount({
        id: 'cash-plaid-2',
        userId: stored.userId,
        providerName: 'plaid',
        connectionId: stored.id,
        institutionName: stored.institutionName,
        institutionId: stored.institutionId,
        externalAccountId: 'plaid-account-2',
        currency: 'EUR',
        status: 'active',
      }),
    ];
    const connection = createBankConnection({
      id: stored.id,
      userId: stored.userId,
      providerName: 'plaid',
      institutionName: stored.institutionName,
      institutionId: stored.institutionId,
      connectionStatus: 'connected',
      syncStatus: 'success',
      linkedAccountIds: accounts.map((account) => account.id),
    });
    const existingRemovedCandidate = normalizeProviderTransactions([{
      externalTransactionId: 'removed-transaction-1',
      externalAccountId: 'plaid-account-1',
      bookingDate: '2026-09-15',
      amount: 10,
      direction: 'debit',
      currency: 'EUR',
      description: 'Removed later',
      pending: false,
    }], {
      providerName: 'plaid',
      connectionId: stored.id,
      accounts,
      reportingCurrency: 'EUR',
      fxRates: {},
      syncedAt: '2026-09-16T15:00:00.000Z',
    });
    const normalized = normalizeProviderTransactions(firstPage.transactions, {
      providerName: 'plaid',
      connectionId: stored.id,
      accounts,
      reportingCurrency: 'EUR',
      fxRates: {},
      syncedAt: FIXED_NOW,
    });
    const initialState: BankingConnectionOperationState = {
      cashAccounts: accounts,
      bankConnections: [connection],
      bankTransactions: existingRemovedCandidate,
      bankTransactionReconciliations: [],
      bankTransactionSyncStates: [],
      rentPayments: [],
      expensePayments: [],
    };
    const synced = applyBankConnectionTransactionResult(initialState, {
      connection,
      incomingTransactions: normalized,
      removedTransactions: firstPage.removedTransactions,
      cursor: firstPage.nextCursor,
      syncedAt: FIXED_NOW,
    });

    assert.equal(synced.bankTransactions.length, 4);
    assert.equal(synced.bankTransactionSyncStates[0].cursor, 'cursor-page-2');
    assert.equal(synced.rentPayments.length, 0);
    assert.equal(synced.expensePayments.length, 0);
    assert.equal(
      synced.bankTransactions.find((transaction) =>
        transaction.externalTransactionId === 'removed-transaction-1'
      )?.lifecycleStatus,
      'removed'
    );
    const posted = synced.bankTransactions.find((transaction) =>
      transaction.externalTransactionId === 'posted-card-1'
    );
    assert.ok(posted);
    assert.equal(posted.pending, false);
    assert.equal(posted.pendingExternalTransactionId, 'pending-card-1');
    assert.equal(
      synced.bankTransactions.find((transaction) =>
        transaction.externalTransactionId === 'same-looking-account-1'
      )?.description,
      'Corrected merchant'
    );
    assert.equal(
      synced.bankTransactions.filter((transaction) =>
        transaction.description.includes('merchant')
      ).length,
      2
    );
    assert.notEqual(
      synced.bankTransactions.find((transaction) =>
        transaction.externalTransactionId === 'same-looking-account-1'
      )?.cashAccountId,
      synced.bankTransactions.find((transaction) =>
        transaction.externalTransactionId === 'same-looking-account-2'
      )?.cashAccountId
    );

    const repeatedPage = await service.syncTransactions(
      { userId: stored.userId },
      stored.id,
      firstPage.nextCursor
    );
    const repeated = applyBankConnectionTransactionResult(synced, {
      connection,
      incomingTransactions: normalizeProviderTransactions(repeatedPage.transactions, {
        providerName: 'plaid',
        connectionId: stored.id,
        accounts,
        reportingCurrency: 'EUR',
        fxRates: {},
        syncedAt: FIXED_NOW,
      }),
      removedTransactions: repeatedPage.removedTransactions,
      cursor: repeatedPage.nextCursor,
      syncedAt: FIXED_NOW,
    });
    assert.deepEqual(
      repeated.bankTransactions.map((transaction) => transaction.id).sort(),
      synced.bankTransactions.map((transaction) => transaction.id).sort()
    );
    assert.equal(repeated.bankTransactions.length, synced.bankTransactions.length);
  });
});

test('Plaid transaction sync skips out-of-scope accounts while preserving owner and Item checks', async (context) => {
  await withSandboxTransactions(async () => {
    const activeFixture = await createStoreFixture(context);
    const active = storedConnection();
    await activeFixture.store.save(active);
    const unmappedService = makeService(activeFixture.store, makeGateway({
      async fetchTransactions() {
        return mapPlaidTransactionsSyncPage(plaidSyncPage({
          added: [plaidTransaction({ account_id: 'unselected-account' })],
        }));
      },
    }));

    const filtered = await unmappedService.syncTransactions(
      { userId: active.userId },
      active.id,
      null
    );
    assert.deepEqual(filtered.transactions, []);
    assert.equal(filtered.nextCursor, 'cursor-final');
    assert.equal(filtered.hasMore, false);
    await assert.rejects(
      unmappedService.syncTransactions({ userId: 'owner-b' }, active.id, null),
      OpenBankingConnectionOwnershipError
    );
    assert.equal((await activeFixture.store.loadOwned(active.userId, active.id))?.accessToken, active.accessToken);

    const disconnectedFixture = await createStoreFixture(context);
    const disconnected = storedConnection({
      id: 'connection-disconnected',
      accessToken: null,
      itemId: null,
      providerItemStatus: 'disconnected',
      disconnectedAt: FIXED_NOW,
      revokedItems: [{ itemId: 'item-revoked', revokedAt: FIXED_NOW }],
    });
    await disconnectedFixture.store.save(disconnected);
    await assert.rejects(
      makeService(disconnectedFixture.store).syncTransactions(
        { userId: disconnected.userId },
        disconnected.id,
        null
      ),
      OpenBankingConnectionStateError
    );
  });
});

test('Plaid transaction sync stays disabled until the read-only Sandbox product is configured', async (context) => {
  const { store } = await createStoreFixture(context);
  const active = storedConnection();
  await store.save(active);
  let providerCalls = 0;
  const service = makeService(store, makeGateway({
    async fetchTransactions() {
      providerCalls += 1;
      return mapPlaidTransactionsSyncPage(plaidSyncPage());
    },
  }));

  await assert.rejects(
    service.syncTransactions({ userId: active.userId }, active.id, null),
    OpenBankingConfigurationError
  );
  assert.equal(providerCalls, 0);
});

test('Plaid Transactions consent Link token uses update mode and additional consent only', async (context) => {
  await withSandboxTransactions(async () => {
    const originalFetch = globalThis.fetch;
    context.after(() => {
      globalThis.fetch = originalFetch;
    });
    const requestBodies: Record<string, unknown>[] = [];
    globalThis.fetch = async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({
        link_token: 'safe-link-token',
        expiration: '2026-09-17T15:05:00.000Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await createPlaidLinkToken({
      userId: 'owner-a',
      accessToken: 'existing-access-token',
      intent: 'transactions-consent',
    });

    assert.equal(result.mode, 'update');
    const requestBody = requestBodies[0];
    assert.equal(requestBody.access_token, 'existing-access-token');
    assert.deepEqual(requestBody.additional_consented_products, ['transactions']);
    assert.equal('products' in requestBody, false);
    assert.equal('update' in requestBody, false);
  });
});

test('Plaid completion forwards account metadata only for Transactions consent', () => {
  const linkResult = {
    publicToken: 'browser-public-token',
    selectedAccountIds: ['plaid-account-1', 'plaid-account-2'],
  };
  const baseSession = {
    sessionId: 'session-1',
    providerName: 'plaid' as const,
    status: 'redirect-required' as const,
    createdAt: FIXED_NOW,
  };

  assert.deepEqual(buildPlaidConnectionCompletionPayload({
    ...baseSession,
    mode: 'update',
    intent: 'transactions-consent',
  }, linkResult), {
    sessionId: 'session-1',
    selectedAccountIds: linkResult.selectedAccountIds,
  });
  assert.deepEqual(buildPlaidConnectionCompletionPayload({
    ...baseSession,
    mode: 'update',
    intent: 'reauthentication',
  }, linkResult), {
    sessionId: 'session-1',
  });
  assert.deepEqual(buildPlaidConnectionCompletionPayload({
    ...baseSession,
    mode: 'create',
    intent: 'connect',
  }, linkResult), {
    sessionId: 'session-1',
    publicToken: 'browser-public-token',
  });
});

test('Transactions consent accepts the canonical scope plus extras without expanding local accounts', async (context) => {
  await withSandboxTransactions(async () => {
    const { store } = await createStoreFixture(context);
    const providerAccounts = Array.from({ length: 5 }, (_, index) => ({
      ...plaidAccount,
      account_id: `plaid-account-${index + 1}`,
      name: `Plaid account ${index + 1}`,
      mask: `${1000 + index}`,
    }));
    const stored = storedConnection({
      selectedAccountIds: providerAccounts.map((account) => account.account_id),
    });
    const extraProviderAccount = {
      ...plaidAccount,
      account_id: 'plaid-account-extra',
      name: 'Out of scope provider account',
      mask: '9999',
      balances: { ...plaidAccount.balances, current: 999999, available: 999999 },
    };
    await store.save(stored);
    let exchangeCalls = 0;
    const linkInputs: Parameters<PlaidPilotGateway['createLinkToken']>[0][] = [];
    const gateway = makeGateway({
      async createLinkToken(input) {
        linkInputs.push(input);
        return { linkToken: 'link-consent', mode: 'update' };
      },
      async exchangePublicToken() {
        exchangeCalls += 1;
        return { access_token: 'must-not-be-used', item_id: 'must-not-be-used' };
      },
      async fetchItem() {
        return { item: { item_id: stored.itemId!, institution_id: stored.institutionId } };
      },
      async fetchInstitution() {
        return {
          institutionId: stored.institutionId,
          name: stored.institutionName,
          countryCodes: ['ES'],
          products: ['auth', 'balance', 'transactions'],
          oauth: true,
        };
      },
      async fetchBalances() {
        return {
          accounts: [...providerAccounts, extraProviderAccount],
          item: { institution_id: stored.institutionId, consent_expiration_time: null },
        };
      },
      mapAccounts(input) {
        return mapPlaidAccountsToCashAccounts({
          ...input,
          providerName: 'plaid',
        });
      },
    });
    const service = makeService(store, gateway);
    const exactSession = await service.createConnectionSession(
      { userId: stored.userId },
      {
        providerName: 'plaid',
        connectionId: stored.id,
        intent: 'transactions-consent',
      }
    );
    const exactResult = await service.completeConnection(
      { userId: stored.userId },
      {
        sessionId: exactSession.sessionId,
        publicToken: 'must-not-be-exchanged',
        selectedAccountIds: stored.selectedAccountIds,
      }
    );
    const extraSession = await service.createConnectionSession(
      { userId: stored.userId },
      {
        providerName: 'plaid',
        connectionId: stored.id,
        intent: 'transactions-consent',
      }
    );
    const result = await service.completeConnection(
      { userId: stored.userId },
      {
        sessionId: extraSession.sessionId,
        publicToken: 'must-not-be-exchanged',
        selectedAccountIds: [...stored.selectedAccountIds, extraProviderAccount.account_id],
      }
    );
    const retained = await store.loadOwned(stored.userId, stored.id);

    assert.equal(exactSession.intent, 'transactions-consent');
    assert.equal(exactSession.mode, 'update');
    assert.equal(extraSession.mode, 'update');
    assert.equal(linkInputs.length, 2);
    assert.deepEqual(linkInputs[0], {
      userId: stored.userId,
      accessToken: stored.accessToken,
      intent: 'transactions-consent',
    });
    assert.equal(exchangeCalls, 0);
    assert.equal((await store.list()).length, 1);
    assert.equal(retained?.id, stored.id);
    assert.equal(retained?.accessToken, stored.accessToken);
    assert.equal(retained?.itemId, stored.itemId);
    assert.deepEqual(retained?.selectedAccountIds, stored.selectedAccountIds);
    assert.equal(result.connection.id, stored.id);
    assert.equal(exactResult.accounts.length, 5);
    assert.equal(result.accounts.length, 5);
    assert.equal(
      result.accounts.some((account) => account.externalAccountId === extraProviderAccount.account_id),
      false
    );

    const canonicalAccounts = providerAccounts.map((account, index) => createLinkedCashAccount({
      id: `canonical-cash-${index + 1}`,
      userId: stored.userId,
      providerName: 'plaid',
      connectionId: stored.id,
      institutionName: stored.institutionName,
      institutionId: stored.institutionId,
      externalAccountId: account.account_id,
      maskedReference: `****${account.mask}`,
      isIncludedInPortfolio: index < 3,
      status: 'active',
    }));
    const connection = createBankConnection({
      id: stored.id,
      userId: stored.userId,
      providerName: 'plaid',
      institutionName: stored.institutionName,
      institutionId: stored.institutionId,
      linkedAccountIds: canonicalAccounts.map((account) => account.id),
    });
    const merged = applyBankConnectionAccountResult({
      cashAccounts: canonicalAccounts,
      bankConnections: [connection],
      bankTransactions: [],
      bankTransactionReconciliations: [],
      bankTransactionSyncStates: [],
      rentPayments: [],
      expensePayments: [],
    }, result.connection, result.accounts);

    assert.deepEqual(
      merged.cashAccounts.map((account) => account.id).sort(),
      canonicalAccounts.map((account) => account.id).sort()
    );
    assert.deepEqual(
      merged.cashAccounts.map((account) => account.isIncludedInPortfolio),
      [true, true, true, false, false]
    );
  });
});

test('Transactions consent fails closed when an existing provider account is missing', async (context) => {
  await withSandboxTransactions(async () => {
    const { store } = await createStoreFixture(context);
    const stored = storedConnection({
      selectedAccountIds: ['plaid-account-1', 'plaid-account-2'],
    });
    await store.save(stored);
    let providerReads = 0;
    const service = makeService(store, makeGateway({
      async fetchItem() {
        providerReads += 1;
        return { item: { item_id: stored.itemId!, institution_id: stored.institutionId } };
      },
      async fetchBalances() {
        providerReads += 1;
        return { accounts: [plaidAccount] };
      },
    }));
    const session = await service.createConnectionSession(
      { userId: stored.userId },
      {
        providerName: 'plaid',
        connectionId: stored.id,
        intent: 'transactions-consent',
      }
    );

    await assert.rejects(
      service.completeConnection(
        { userId: stored.userId },
        {
          sessionId: session.sessionId,
          selectedAccountIds: ['plaid-account-1'],
        }
      ),
      OpenBankingAccountScopeError
    );

    const retained = await store.loadOwned(stored.userId, stored.id);
    assert.equal(providerReads, 0);
    assert.deepEqual(retained, stored);
  });
});

test('Transactions consent verifies the canonical scope against provider balances', async (context) => {
  await withSandboxTransactions(async () => {
    const { store } = await createStoreFixture(context);
    const stored = storedConnection({
      selectedAccountIds: ['plaid-account-1', 'plaid-account-2'],
    });
    await store.save(stored);
    const service = makeService(store, makeGateway({
      async fetchBalances() {
        return {
          accounts: [plaidAccount],
          item: { institution_id: stored.institutionId, consent_expiration_time: null },
        };
      },
    }));
    const session = await service.createConnectionSession(
      { userId: stored.userId },
      {
        providerName: 'plaid',
        connectionId: stored.id,
        intent: 'transactions-consent',
      }
    );

    await assert.rejects(
      service.completeConnection(
        { userId: stored.userId },
        {
          sessionId: session.sessionId,
          selectedAccountIds: stored.selectedAccountIds,
        }
      ),
      OpenBankingAccountScopeError
    );
    assert.deepEqual(await store.loadOwned(stored.userId, stored.id), stored);
  });
});

test('Transactions consent rejects wrong owners, disconnected Items, and Production', async (context) => {
  await withSandboxTransactions(async () => {
    const { store } = await createStoreFixture(context);
    const active = storedConnection();
    await store.save(active);
    let linkCalls = 0;
    const service = makeService(store, makeGateway({
      async createLinkToken({ accessToken }) {
        linkCalls += 1;
        return { linkToken: 'link-consent', mode: accessToken ? 'update' : 'create' };
      },
    }));

    await assert.rejects(
      service.createConnectionSession(
        { userId: 'owner-b' },
        { providerName: 'plaid', connectionId: active.id, intent: 'transactions-consent' }
      ),
      OpenBankingConnectionOwnershipError
    );
    assert.equal(linkCalls, 0);

    const disconnected = storedConnection({
      id: 'connection-disconnected-consent',
      accessToken: null,
      itemId: null,
      providerItemStatus: 'disconnected',
      disconnectedAt: FIXED_NOW,
      revokedItems: [{ itemId: 'revoked-item', revokedAt: FIXED_NOW }],
    });
    await store.save(disconnected);
    await assert.rejects(
      service.createConnectionSession(
        { userId: disconnected.userId },
        {
          providerName: 'plaid',
          connectionId: disconnected.id,
          intent: 'transactions-consent',
        }
      ),
      OpenBankingConnectionStateError
    );
    assert.equal(linkCalls, 0);

    process.env.PLAID_ENV = 'production';
    process.env.PLAID_PRODUCTS = 'auth';
    process.env.PLAID_COUNTRY_CODES = 'ES';
    process.env.PLAID_REDIRECT_URI = 'https://portfolio.example.com/plaid-oauth';
    try {
      await assert.rejects(
        service.createConnectionSession(
          { userId: active.userId },
          { providerName: 'plaid', connectionId: active.id, intent: 'transactions-consent' }
        ),
        OpenBankingConfigurationError
      );
    } finally {
      process.env.PLAID_ENV = 'sandbox';
      process.env.PLAID_PRODUCTS = 'auth,transactions';
      process.env.PLAID_COUNTRY_CODES = 'ES';
      process.env.PLAID_REDIRECT_URI = 'http://localhost:8081/plaid-oauth';
    }
    assert.equal(linkCalls, 0);
  });
});

test('sanitized additional-consent errors remain actionable without provider identifiers', async () => {
  const handlers = new Map<string, (request: IncomingMessage, response: TestResponse) => Promise<void>>();
  const plugin = brokerApiPlugin({
    openBankingAuthenticator: {
      async authenticate() {
        return { userId: 'owner-a' };
      },
    },
    openBankingService: {
      async syncTransactions() {
        throw new PlaidProviderError(
          'raw provider message must not escape',
          'ADDITIONAL_CONSENT_REQUIRED',
          'provider-request-id-must-not-escape',
          'INVALID_INPUT',
          400
        );
      },
    } as unknown as OpenBankingService,
  });
  (plugin.configureServer as (server: unknown) => void)({
    middlewares: {
      use(pathname: string, handler: (request: IncomingMessage, response: TestResponse) => Promise<void>) {
        handlers.set(pathname, handler);
      },
    },
  });
  const request = Readable.from([JSON.stringify({ connectionId: 'connection-safe' })]) as unknown as IncomingMessage;
  Object.assign(request, {
    method: 'POST',
    headers: {
      origin: 'http://localhost:5173',
      host: 'localhost:5173',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const response: TestResponse = {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(value) { this.body = value ?? ''; },
  };
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await handlers.get('/api/open-banking/transactions/sync')!(request, response);
  } finally {
    console.error = originalConsoleError;
  }

  const payload = JSON.parse(response.body) as Record<string, unknown>;
  assert.equal(response.statusCode, 502);
  assert.equal(payload.error, 'Transaction access requires additional bank consent.');
  assert.deepEqual(payload.providerError, {
    errorType: 'INVALID_INPUT',
    errorCode: 'ADDITIONAL_CONSENT_REQUIRED',
    httpStatus: 400,
  });
  assert.equal(response.body.includes('provider-request-id-must-not-escape'), false);
  assert.equal(response.body.includes('raw provider message must not escape'), false);

  const frontendError = new OpenBankingRequestError(
    String(payload.error),
    String(payload.code),
    payload.providerError as {
      errorType: string | null;
      errorCode: string | null;
      httpStatus: number | null;
    }
  );
  assert.equal(getOpenBankingProviderErrorCode(frontendError), 'ADDITIONAL_CONSENT_REQUIRED');
});

test('Transactions consent orchestration retries sync once and never loops on repeated consent errors', async () => {
  const connection = createBankConnection({
    id: 'connection-consent-flow',
    userId: 'owner-a',
    providerName: 'plaid',
    institutionName: 'First Platypus Bank',
    institutionId: 'sandbox-institution',
  });
  const result = { connection, accounts: [] };
  let sessionCalls = 0;
  let completionCalls = 0;
  let appliedResults = 0;
  let syncCalls = 0;
  const adapter = {
    providerName: 'plaid',
    async createConnectionSession(
      input: Parameters<ProviderAdapter['createConnectionSession']>[0]
    ) {
      sessionCalls += 1;
      assert.equal(input.intent, 'transactions-consent');
      return {
        sessionId: 'session-consent',
        providerName: 'plaid',
        status: 'redirect-required',
        createdAt: FIXED_NOW,
        mode: 'update',
        connectionId: connection.id,
        intent: 'transactions-consent',
      } as const;
    },
    async completeConnection() {
      completionCalls += 1;
      return result;
    },
  } as unknown as ProviderAdapter;

  await assert.rejects(
    runTransactionsConsentUpdate({
      adapter,
      userId: 'owner-a',
      connection,
      onConnectionResult(value) {
        appliedResults += 1;
        return value.connection;
      },
      async syncTransactions() {
        syncCalls += 1;
        throw new OpenBankingRequestError(
          'Transaction access requires additional bank consent.',
          'OPEN_BANKING_PROVIDER_ERROR',
          {
            errorType: 'INVALID_INPUT',
            errorCode: 'ADDITIONAL_CONSENT_REQUIRED',
            httpStatus: 400,
          }
        );
      },
    }),
    OpenBankingRequestError
  );
  assert.deepEqual(
    { sessionCalls, completionCalls, appliedResults, syncCalls },
    { sessionCalls: 1, completionCalls: 1, appliedResults: 1, syncCalls: 1 }
  );

  let successfulSyncCalls = 0;
  await runTransactionsConsentUpdate({
    adapter,
    userId: 'owner-a',
    connection,
    onConnectionResult: (value) => value.connection,
    async syncTransactions() {
      successfulSyncCalls += 1;
    },
  });
  assert.equal(successfulSyncCalls, 1);

  let canceledStateWrites = 0;
  const canceledAdapter = {
    ...adapter,
    async completeConnection() {
      throw new Error('The bank connection flow was canceled.');
    },
  } as unknown as ProviderAdapter;
  await assert.rejects(
    runTransactionsConsentUpdate({
      adapter: canceledAdapter,
      userId: 'owner-a',
      connection,
      onConnectionResult(value) {
        canceledStateWrites += 1;
        return value.connection;
      },
      async syncTransactions() {
        canceledStateWrites += 1;
      },
    }),
    /canceled/
  );
  assert.equal(canceledStateWrites, 0);

  let accountScopeStateWrites = 0;
  const accountScopeAdapter = {
    ...adapter,
    async completeConnection() {
      throw new OpenBankingRequestError(
        'Plaid account access changed. Review the connection before syncing transactions.',
        'OPEN_BANKING_ACCOUNT_SCOPE_CHANGED'
      );
    },
  } as unknown as ProviderAdapter;
  await assert.rejects(
    runTransactionsConsentUpdate({
      adapter: accountScopeAdapter,
      userId: 'owner-a',
      connection,
      onConnectionResult(value) {
        accountScopeStateWrites += 1;
        return value.connection;
      },
      async syncTransactions() {
        accountScopeStateWrites += 1;
      },
    }),
    (error: unknown) =>
      error instanceof OpenBankingRequestError &&
      error.code === 'OPEN_BANKING_ACCOUNT_SCOPE_CHANGED'
  );
  assert.equal(accountScopeStateWrites, 0);
});

test('Transactions consent UI exposes a dedicated localized action', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/platforms/web/pages/CashAccountsPage.tsx'),
    'utf8'
  );
  assert.match(source, /ADDITIONAL_CONSENT_REQUIRED/);
  assert.match(source, /handleEnableTransactions/);
  assert.match(source, /cashAccounts\.enableTransactions/);
  assert.match(source, /runTransactionsConsentUpdate/);
  assert.match(source, /OPEN_BANKING_ACCOUNT_SCOPE_CHANGED/);
  assert.match(source, /transactionsAccountAccessChanged/);
  assert.match(source, /onClick=\{\(\) => void handleEnableTransactions\(connection\)\}/);
  assert.match(source, /onClick=\{\(\) => void handleReconnectConnection\(connection\)\}/);
  for (const locale of ['en-extra.ts', 'es-extra.ts', 'pt-extra.ts']) {
    const translations = await readFile(
      path.join(process.cwd(), 'src/platforms/web/i18n/locales', locale),
      'utf8'
    );
    assert.match(translations, /enableTransactions/);
    assert.match(translations, /transactionsConsentRequired/);
    assert.match(translations, /transactionsAccountAccessChanged/);
  }
});

test('Santander preflight route requires a backend-authenticated owner', async () => {
  let preflightCalls = 0;
  const handlers = new Map<string, (request: IncomingMessage, response: TestResponse) => Promise<void>>();
  const plugin = brokerApiPlugin({
    openBankingAuthenticator: unavailableOpenBankingAuthenticator,
    openBankingService: {
      async getSantanderPreflight() {
        preflightCalls += 1;
        throw new Error('must not be reached');
      },
    } as unknown as OpenBankingService,
  });
  (plugin.configureServer as (server: unknown) => void)({
    middlewares: {
      use(pathname: string, handler: (request: IncomingMessage, response: TestResponse) => Promise<void>) {
        handlers.set(pathname, handler);
      },
    },
  });
  const request = Readable.from(['{}']) as unknown as IncomingMessage;
  Object.assign(request, {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:8081',
      host: '127.0.0.1:8081',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const response: TestResponse = {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(value) { this.body = value ?? ''; },
  };
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await handlers.get('/api/open-banking/preflight')!(request, response);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.statusCode, 401);
  assert.equal(preflightCalls, 0);
  assert.equal(JSON.parse(response.body).code, 'OPEN_BANKING_AUTHENTICATION_REQUIRED');
});

test('browser-local identity cannot authenticate open banking requests', async () => {
  await assert.rejects(
    unavailableOpenBankingAuthenticator.authenticate({} as never),
    OpenBankingAuthenticationError
  );
});

test('another user cannot refresh or disconnect a connection by ID', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  let balanceCalls = 0;
  let removeCalls = 0;
  const gateway = makeGateway({
    async fetchBalances() {
      balanceCalls += 1;
      return { accounts: [plaidAccount], item: { institution_id: 'ins_65' } };
    },
    async removeItem() {
      removeCalls += 1;
      return { removed: true };
    },
  });
  const service = makeService(store, gateway);

  await assert.rejects(
    service.refreshConnection({ userId: 'owner-b' }, 'connection-santander-1'),
    OpenBankingConnectionOwnershipError
  );
  await assert.rejects(
    service.disconnectConnection({ userId: 'owner-b' }, 'connection-santander-1'),
    OpenBankingConnectionOwnershipError
  );
  assert.equal(balanceCalls, 0);
  assert.equal(removeCalls, 0);
  assert.ok(await store.loadOwned('owner-a', 'connection-santander-1'));
});

test('Link completion uses provider institution metadata and returns no access token', async (context) => {
  const { store } = await createStoreFixture(context);
  const service = makeService(store);
  const session = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid' }
  );
  const result = await service.completeConnection(
    { userId: 'owner-a' },
    {
      sessionId: session.sessionId,
      publicToken: 'public-token',
      institutionId: 'attacker-bank',
      institutionName: 'Spoofed Bank',
    } as { sessionId: string; publicToken: string }
  );

  assert.equal(result.connection.institutionId, 'ins_65');
  assert.equal(result.connection.institutionName, 'Banco Santander');
  assert.equal(result.accounts[0].institutionId, 'ins_65');
  assert.equal(JSON.stringify(result).includes('access-from-exchange'), false);
  assert.equal('accessToken' in result.connection, false);
});

test('Sandbox accepts a provider-returned test institution for Accounts and Balance', async (context) => {
  const { store } = await createStoreFixture(context);
  process.env.PLAID_COUNTRY_CODES = 'US';
  try {
    const service = makeService(store, makeGateway({
      async fetchItem() {
        return {
          item: {
            item_id: 'sandbox-item',
            institution_id: 'ins_109508',
            consent_expiration_time: null,
          },
        };
      },
      async fetchInstitution() {
        return {
          institutionId: 'ins_109508',
          name: 'First Platypus Bank',
          countryCodes: ['US'],
          products: ['auth', 'balance'],
          oauth: false,
        };
      },
      async fetchBalances() {
        return {
          accounts: [{
            ...plaidAccount,
            account_id: 'sandbox-checking',
            name: 'Plaid Checking',
            balances: {
              current: 100,
              available: 95,
              iso_currency_code: 'USD',
            },
          }],
          item: { institution_id: 'ins_109508', consent_expiration_time: null },
        };
      },
      mapAccounts(input) {
        return mapPlaidAccountsToCashAccounts({
          ...input,
          providerName: 'plaid',
        });
      },
    }));
    const session = await service.createConnectionSession(
      { userId: 'owner-a' },
      { providerName: 'plaid' }
    );
    const result = await service.completeConnection(
      { userId: 'owner-a' },
      { sessionId: session.sessionId, publicToken: 'sandbox-public-token' }
    );

    assert.equal(result.connection.institutionId, 'ins_109508');
    assert.equal(result.connection.institutionName, 'First Platypus Bank');
    assert.equal(result.accounts[0].institutionId, 'ins_109508');
    assert.equal(result.accounts[0].externalAccountId, 'sandbox-checking');
    assert.equal(result.accounts[0].currency, 'USD');
    assert.equal(JSON.stringify(result).includes('access-from-exchange'), false);
  } finally {
    process.env.PLAID_COUNTRY_CODES = 'ES';
  }
});

test('Production rejects non-Santander Link completion and removes its Item', async (context) => {
  const { store } = await createStoreFixture(context);
  let removeCalls = 0;
  const service = makeService(store, makeGateway({
    async fetchItem() {
      return { item: { item_id: 'wrong-item', institution_id: 'ins_wrong' } };
    },
    async removeItem() {
      removeCalls += 1;
      return { removed: true };
    },
  }));
  process.env.PLAID_ENV = 'production';
  process.env.PLAID_REDIRECT_URI = 'https://portfolio.example.com/plaid-oauth';
  try {
    const session = await service.createConnectionSession(
      { userId: 'owner-a' },
      { providerName: 'plaid' }
    );

    await assert.rejects(
      service.completeConnection(
        { userId: 'owner-a' },
        { sessionId: session.sessionId, publicToken: 'public-token' }
      ),
      OpenBankingConfigurationError
    );
    assert.equal(removeCalls, 1);
    assert.deepEqual(await store.list(), []);
  } finally {
    process.env.PLAID_ENV = 'sandbox';
    process.env.PLAID_REDIRECT_URI = 'http://localhost:8081/plaid-oauth';
  }
});

test('wrong-owner and replayed Link completion are rejected before token exchange', async (context) => {
  const { store } = await createStoreFixture(context);
  let exchangeCalls = 0;
  const service = makeService(store, makeGateway({
    async exchangePublicToken() {
      exchangeCalls += 1;
      return { access_token: 'access-from-exchange', item_id: 'item-from-exchange' };
    },
  }));
  const wrongOwnerSession = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid' }
  );
  await assert.rejects(
    service.completeConnection(
      { userId: 'owner-b' },
      { sessionId: wrongOwnerSession.sessionId, publicToken: 'public-token' }
    ),
    OpenBankingLinkSessionError
  );
  assert.equal(exchangeCalls, 0);

  await service.completeConnection(
    { userId: 'owner-a' },
    { sessionId: wrongOwnerSession.sessionId, publicToken: 'public-token' }
  );
  assert.equal(exchangeCalls, 1);
  await assert.rejects(
    service.completeConnection(
      { userId: 'owner-a' },
      { sessionId: wrongOwnerSession.sessionId, publicToken: 'public-token' }
    ),
    OpenBankingLinkSessionError
  );
  assert.equal(exchangeCalls, 1);
});

test('connect then disconnect revokes the Plaid Item and retains owner-scoped audit metadata', async (context) => {
  const { store, filePath } = await createStoreFixture(context);
  const removedTokens: string[] = [];
  const service = makeService(store, makeGateway({
    async removeItem(accessToken) {
      removedTokens.push(accessToken);
      return { removed: true };
    },
  }));
  const session = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid' }
  );
  const connected = await service.completeConnection(
    { userId: 'owner-a' },
    { sessionId: session.sessionId, publicToken: 'public-token' }
  );

  await service.disconnectConnection({ userId: 'owner-a' }, connected.connection.id);

  const retained = await store.loadOwned('owner-a', connected.connection.id);
  assert.deepEqual(removedTokens, ['access-from-exchange']);
  assert.equal(retained?.providerItemStatus, 'disconnected');
  assert.equal(retained?.accessToken, null);
  assert.equal(retained?.itemId, null);
  assert.equal(retained?.disconnectedAt, FIXED_NOW);
  assert.deepEqual(retained?.revokedItems, [
    { itemId: 'item-from-exchange', revokedAt: FIXED_NOW },
  ]);
  assert.equal(retained?.createdAt, connected.connection.createdAt);
  const persisted = await readFile(filePath, 'utf8');
  assert.equal(persisted.includes('access-from-exchange'), false);
  assert.match(persisted, /"encryptedAccessToken": null/);
});

test('a revoked provider Item cannot create an update-mode Link session', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  const linkAccessTokens: Array<string | null | undefined> = [];
  const service = makeService(store, makeGateway({
    async createLinkToken({ accessToken }) {
      linkAccessTokens.push(accessToken);
      return { linkToken: accessToken ? 'link-update' : 'link-create', mode: accessToken ? 'update' : 'create' };
    },
  }));
  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');

  const session = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid', connectionId: 'connection-santander-1' }
  );

  assert.equal(session.mode, 'create');
  assert.equal(session.connectionId, 'connection-santander-1');
  assert.deepEqual(linkAccessTokens, [null]);
});

test('connect again uses standard Link and rebinds the new Item to the logical connection', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  const exchangedPublicTokens: string[] = [];
  const service = makeService(store, makeGateway({
    async exchangePublicToken(publicToken) {
      exchangedPublicTokens.push(publicToken);
      return { access_token: 'access-reconnected', item_id: 'item-reconnected' };
    },
  }));
  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');
  const session = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid', connectionId: 'connection-santander-1' }
  );

  const result = await service.completeConnection(
    { userId: 'owner-a' },
    { sessionId: session.sessionId, publicToken: 'public-reconnected' }
  );
  const rebound = await store.loadOwned('owner-a', 'connection-santander-1');

  assert.equal(session.mode, 'create');
  assert.deepEqual(exchangedPublicTokens, ['public-reconnected']);
  assert.equal(result.connection.id, 'connection-santander-1');
  assert.equal(rebound?.id, 'connection-santander-1');
  assert.equal(rebound?.providerItemStatus, 'active');
  assert.equal(rebound?.accessToken, 'access-reconnected');
  assert.equal(rebound?.itemId, 'item-reconnected');
  assert.equal(rebound?.disconnectedAt, null);
  assert.deepEqual(rebound?.revokedItems, [
    { itemId: 'item-santander-1', revokedAt: FIXED_NOW },
  ]);
});

test('connect again refuses a different institution before changing logical identity', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  const removedTokens: string[] = [];
  const service = makeService(store, makeGateway({
    async fetchItem() {
      return { item: { item_id: 'item-other', institution_id: 'ins_other' } };
    },
    async removeItem(accessToken) {
      removedTokens.push(accessToken);
      return { removed: true };
    },
  }));
  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');
  const session = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid', connectionId: 'connection-santander-1' }
  );

  await assert.rejects(
    service.completeConnection(
      { userId: 'owner-a' },
      { sessionId: session.sessionId, publicToken: 'public-other-institution' }
    ),
    OpenBankingConnectionStateError
  );

  const retained = await store.loadOwned('owner-a', 'connection-santander-1');
  assert.deepEqual(removedTokens, [
    'access-production-secret-value',
    'access-from-exchange',
  ]);
  assert.equal(retained?.providerItemStatus, 'disconnected');
  assert.equal(retained?.accessToken, null);
  assert.equal(retained?.id, 'connection-santander-1');
});

test('connect again never reuses the revoked access token', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  const removedTokens: string[] = [];
  const linkAccessTokens: Array<string | null | undefined> = [];
  const fetchedTokens: string[] = [];
  const service = makeService(store, makeGateway({
    async removeItem(accessToken) {
      removedTokens.push(accessToken);
      return { removed: true };
    },
    async createLinkToken({ accessToken }) {
      linkAccessTokens.push(accessToken);
      return { linkToken: 'link-create', mode: 'create' };
    },
    async exchangePublicToken() {
      return { access_token: 'access-new-item', item_id: 'item-new-item' };
    },
    async fetchItem(accessToken) {
      fetchedTokens.push(accessToken);
      return { item: { item_id: 'item-new-item', institution_id: 'ins_65' } };
    },
    async fetchBalances(accessToken) {
      fetchedTokens.push(accessToken);
      return { accounts: [plaidAccount], item: { institution_id: 'ins_65' } };
    },
  }));

  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');
  const session = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid', connectionId: 'connection-santander-1' }
  );
  await service.completeConnection(
    { userId: 'owner-a' },
    { sessionId: session.sessionId, publicToken: 'public-new-item' }
  );

  assert.deepEqual(removedTokens, ['access-production-secret-value']);
  assert.deepEqual(linkAccessTokens, [null]);
  assert.deepEqual(fetchedTokens, ['access-new-item', 'access-new-item']);
  assert.equal(fetchedTokens.includes('access-production-secret-value'), false);
});

test('repeated disconnect is idempotent and does not revoke the same Item twice', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  let removeCalls = 0;
  const service = makeService(store, makeGateway({
    async removeItem() {
      removeCalls += 1;
      return { removed: true };
    },
  }));

  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');
  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');

  const retained = await store.loadOwned('owner-a', 'connection-santander-1');
  assert.equal(removeCalls, 1);
  assert.equal(retained?.providerItemStatus, 'disconnected');
  assert.equal(retained?.revokedItems.length, 1);
});

test('only a disconnected owner-scoped provider record can be deleted', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  const service = makeService(store);

  await assert.rejects(
    service.deleteDisconnectedConnection({ userId: 'owner-a' }, 'connection-santander-1'),
    OpenBankingConnectionStateError
  );
  assert.ok(await store.loadOwned('owner-a', 'connection-santander-1'));

  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');
  assert.deepEqual(
    await service.deleteDisconnectedConnection({ userId: 'owner-b' }, 'connection-santander-1'),
    { ok: true, connectionId: 'connection-santander-1', deleted: false }
  );
  assert.ok(await store.loadOwned('owner-a', 'connection-santander-1'));
  const result = await service.deleteDisconnectedConnection(
    { userId: 'owner-a' },
    'connection-santander-1'
  );

  assert.deepEqual(result, {
    ok: true,
    connectionId: 'connection-santander-1',
    deleted: true,
  });
  assert.equal(await store.loadOwned('owner-a', 'connection-santander-1'), null);
});

test('deleting a missing disconnected provider record is idempotent for pre-fix connections', async (context) => {
  const { store } = await createStoreFixture(context);
  const service = makeService(store);

  const result = await service.deleteDisconnectedConnection(
    { userId: 'owner-a' },
    'connection-pre-fix'
  );

  assert.deepEqual(result, {
    ok: true,
    connectionId: 'connection-pre-fix',
    deleted: false,
  });
});

test('refresh is blocked while disconnected without calling Plaid', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  let balanceCalls = 0;
  const service = makeService(store, makeGateway({
    async fetchBalances() {
      balanceCalls += 1;
      return { accounts: [plaidAccount], item: { institution_id: 'ins_65' } };
    },
  }));
  await service.disconnectConnection({ userId: 'owner-a' }, 'connection-santander-1');

  await assert.rejects(
    service.refreshConnection({ userId: 'owner-a' }, 'connection-santander-1'),
    OpenBankingConnectionStateError
  );
  assert.equal(balanceCalls, 0);
});

test('live Item reauthentication uses update mode, preserves connection ID, and keeps canonical account identity', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save(storedConnection());
  let exchangeCalls = 0;
  let updateAccessToken: string | null | undefined;
  const service = makeService(store, makeGateway({
    async createLinkToken({ accessToken }) {
      updateAccessToken = accessToken;
      return { linkToken: 'link-update', mode: 'update' };
    },
    async exchangePublicToken() {
      exchangeCalls += 1;
      return { access_token: 'unexpected', item_id: 'unexpected' };
    },
  }));
  const session = await service.createConnectionSession(
    { userId: 'owner-a' },
    { providerName: 'plaid', connectionId: 'connection-santander-1' }
  );
  const result = await service.completeConnection(
    { userId: 'owner-a' },
    { sessionId: session.sessionId }
  );

  assert.equal(session.mode, 'update');
  assert.equal(updateAccessToken, 'access-production-secret-value');
  assert.equal(exchangeCalls, 0);
  assert.equal(result.connection.id, 'connection-santander-1');
  assert.equal((await store.list()).length, 1);

  const existingAccount = createLinkedCashAccount({
    id: 'canonical-cash-account',
    userId: 'owner-a',
    providerName: 'plaid',
    connectionId: 'connection-santander-1',
    institutionId: 'ins_65',
    institutionName: 'Banco Santander',
    externalAccountId: 'plaid-account-1',
    currency: 'EUR',
  });
  const state: BankingConnectionOperationState = {
    cashAccounts: [existingAccount],
    bankConnections: [],
    bankTransactions: [],
    bankTransactionReconciliations: [],
    bankTransactionSyncStates: [],
    rentPayments: [],
    expensePayments: [],
  };
  const merged = applyBankConnectionAccountResult(state, result.connection, result.accounts);
  assert.equal(merged.cashAccounts.length, 1);
  assert.equal(merged.cashAccounts[0].id, 'canonical-cash-account');
});

test('frontend-persisted banking models contain no provider token field', () => {
  const account: CashAccount = createLinkedCashAccount({
    providerName: 'plaid',
    connectionId: 'connection-santander-1',
    institutionId: 'ins_65',
    externalAccountId: 'plaid-account-1',
  });
  const serialized = JSON.stringify({
    connection: {
      id: 'connection-santander-1',
      userId: 'owner-a',
      providerName: 'plaid',
      institutionName: 'Banco Santander',
      institutionId: 'ins_65',
      connectionStatus: 'connected',
      syncStatus: 'success',
      needsReauth: false,
      linkedAccountIds: [account.id],
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
    account,
  });
  assert.equal(serialized.includes('accessToken'), false);
  assert.equal(serialized.includes('access-production-secret-value'), false);
});
