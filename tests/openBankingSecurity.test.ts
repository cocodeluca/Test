import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CashAccount } from '../src/common/types';
import {
  applyBankConnectionAccountResult,
  type BankingConnectionOperationState,
} from '../src/common/utils/bankingConnectionOperations';
import { createLinkedCashAccount } from '../src/common/utils/cashAccounts';
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
  readPlaidPilotConfiguration,
} from '../server/openBankingPolicy';
import {
  createOpenBankingService,
  type PlaidPilotGateway,
} from '../server/openBankingService';
import {
  createOpenBankingConnectionStore,
  OpenBankingConnectionOwnershipError,
  OpenBankingVaultError,
  type OpenBankingConnectionStore,
  type StoredOpenBankingConnection,
} from '../server/openBankingStore';

const TEST_MASTER_KEY = Buffer.alloc(32, 17).toString('base64');
const FIXED_NOW = '2026-09-17T15:00:00.000Z';

const priorPlaidEnvironment = {
  PLAID_ENV: process.env.PLAID_ENV,
  PLAID_PRODUCTS: process.env.PLAID_PRODUCTS,
  PLAID_COUNTRY_CODES: process.env.PLAID_COUNTRY_CODES,
};

test.before(() => {
  process.env.PLAID_ENV = 'sandbox';
  process.env.PLAID_PRODUCTS = 'auth';
  process.env.PLAID_COUNTRY_CODES = 'ES';
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
        item_id: 'item-from-provider',
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
    };
  },
  async fetchBalances() {
    return {
      accounts: [plaidAccount],
      item: { institution_id: 'ins_65', consent_expiration_time: null },
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

test('encrypted vault round-trips tokens without storing plaintext', async (context) => {
  const { store, filePath } = await createStoreFixture(context);
  const connection = storedConnection();
  await store.save(connection);

  const fileContent = await readFile(filePath, 'utf8');
  assert.equal(fileContent.includes(connection.accessToken), false);
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

test('pilot configuration rejects missing, non-ES, and write-capable products', () => {
  assert.deepEqual(readPlaidPilotConfiguration({
    PLAID_ENV: 'sandbox',
    PLAID_PRODUCTS: 'auth',
    PLAID_COUNTRY_CODES: 'ES',
  }), {
    environment: 'sandbox',
    products: ['auth'],
    countryCodes: ['ES'],
  });
  assert.throws(() => readPlaidPilotConfiguration({}), OpenBankingConfigurationError);
  assert.throws(() => readPlaidPilotConfiguration({
    PLAID_ENV: 'sandbox',
    PLAID_PRODUCTS: 'auth',
    PLAID_COUNTRY_CODES: 'US',
  }), OpenBankingConfigurationError);
  for (const products of [
    'transactions',
    'transfer',
    'payment_initiation',
    'auth,transactions',
    'auth,transfer',
  ]) {
    assert.throws(() => readPlaidPilotConfiguration({
      PLAID_ENV: 'sandbox',
      PLAID_PRODUCTS: products,
      PLAID_COUNTRY_CODES: 'ES',
    }), OpenBankingConfigurationError);
  }
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

test('non-Santander Link completion is rejected and its Item is removed', async (context) => {
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

test('reconnect uses update mode, preserves connection ID, and keeps canonical account identity', async (context) => {
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
