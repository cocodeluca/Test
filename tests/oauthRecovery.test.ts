import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createFileOAuthRecoveryStore,
  type OAuthRecoveryRecord,
} from '../server/operationalStore';
import { createFileOpenBankingLinkSessionStore } from '../server/openBankingLinkSessions';
import { createOpenBankingConnectionStore } from '../server/openBankingStore';
import {
  createOpenBankingService,
  OpenBankingOAuthStateError,
  type PlaidPilotGateway,
} from '../server/openBankingService';

const OWNER = 'oauth-owner';
const NOW = '2026-09-21T12:00:00.000Z';
const EXPIRES = '2026-09-21T13:00:00.000Z';
const REDIRECT = 'http://localhost:5173/oauth/plaid';
const PROVIDER_STATE = '9d5feadd-a873-43eb-97ba-422f35ce849b';
const VAULT_KEY = Buffer.alloc(32, 7).toString('base64');

const withSandboxConfiguration = async (operation: () => Promise<void>) => {
  const keys = [
    'PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'PLAID_PRODUCTS',
    'PLAID_COUNTRY_CODES', 'PLAID_REDIRECT_URI', 'OPEN_BANKING_VAULT_KEY',
    'PUBLIC_ORIGIN',
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    PLAID_CLIENT_ID: 'configured',
    PLAID_SECRET: 'configured',
    PLAID_ENV: 'sandbox',
    PLAID_PRODUCTS: 'auth',
    PLAID_COUNTRY_CODES: 'ES,US',
    PLAID_REDIRECT_URI: REDIRECT,
    OPEN_BANKING_VAULT_KEY: VAULT_KEY,
  });
  delete process.env.PUBLIC_ORIGIN;
  try {
    await operation();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
};

const oauthRecord = (overrides: Partial<OAuthRecoveryRecord> = {}): OAuthRecoveryRecord => ({
  id: 'A'.repeat(43),
  ownerUserId: OWNER,
  providerName: 'plaid',
  environment: 'sandbox',
  intent: 'connect',
  connectionId: null,
  linkSessionId: 'link-session-1',
  linkToken: 'link-original-token',
  redirectUri: REDIRECT,
  providerOAuthStateId: null,
  receivedRedirectUri: null,
  callbackReceivedAt: null,
  completedConnectionId: null,
  createdAt: NOW,
  expiresAt: EXPIRES,
  consumedAt: null,
  ...overrides,
});

test('OAuth recovery state persists, binds callback once, and consumes once', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 're-oauth-state-'));
  const filePath = path.join(directory, 'oauth.json');
  createFileOAuthRecoveryStore(filePath).save(oauthRecord());

  const restarted = createFileOAuthRecoveryStore(filePath);
  assert.equal(restarted.listRecoverableOwned({
    ownerUserId: OWNER,
    environment: 'sandbox',
    now: new Date(NOW),
  })[0]?.linkToken, 'link-original-token');
  assert.equal(restarted.recordCallbackOwned({
    id: 'A'.repeat(43),
    ownerUserId: 'wrong-owner',
    environment: 'sandbox',
    providerOAuthStateId: PROVIDER_STATE,
    receivedRedirectUri: `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}`,
    now: new Date(NOW),
  }), null);

  const callback = restarted.recordCallbackOwned({
    id: 'A'.repeat(43),
    ownerUserId: OWNER,
    environment: 'sandbox',
    providerOAuthStateId: PROVIDER_STATE,
    receivedRedirectUri: `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}`,
    now: new Date(NOW),
  });
  assert.equal(callback?.providerOAuthStateId, PROVIDER_STATE);
  assert.equal(callback?.receivedRedirectUri, `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}`);

  const consumed = createFileOAuthRecoveryStore(filePath).consumeOwned({
    id: 'A'.repeat(43),
    ownerUserId: OWNER,
    environment: 'sandbox',
    completedConnectionId: 'connection-1',
    now: new Date(NOW),
  });
  assert.equal(consumed?.completedConnectionId, 'connection-1');
  assert.equal(createFileOAuthRecoveryStore(filePath).consumeOwned({
    id: 'A'.repeat(43),
    ownerUserId: OWNER,
    environment: 'sandbox',
    completedConnectionId: 'connection-2',
    now: new Date(NOW),
  }), null);
});

test('OAuth recovery state rejects expiry, environment mismatch, and altered callback replay', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 're-oauth-expiry-'));
  const store = createFileOAuthRecoveryStore(path.join(directory, 'oauth.json'));
  store.save(oauthRecord({ expiresAt: NOW }));
  assert.deepEqual(store.listRecoverableOwned({
    ownerUserId: OWNER,
    environment: 'sandbox',
    now: new Date(NOW),
  }), []);
  assert.equal(store.recordCallbackOwned({
    id: 'A'.repeat(43), ownerUserId: OWNER, environment: 'production',
    providerOAuthStateId: PROVIDER_STATE,
    receivedRedirectUri: `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}`,
    now: new Date(NOW),
  }), null);
  assert.equal(store.recordCallbackOwned({
    id: 'A'.repeat(43), ownerUserId: OWNER, environment: 'sandbox',
    providerOAuthStateId: PROVIDER_STATE,
    receivedRedirectUri: `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}`,
    now: new Date('2026-09-21T12:00:01.000Z'),
  }), null);
});

test('OAuth callback survives backend restart and reuses the original Link session and token', async () => {
  await withSandboxConfiguration(async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 're-oauth-restart-'));
    const connectionPath = path.join(directory, 'connections.json');
    const linkPath = path.join(directory, 'links.json');
    const oauthPath = path.join(directory, 'oauth.json');
    let exchanges = 0;
    const gateway: PlaidPilotGateway = {
      async createLinkToken() {
        return { linkToken: 'link-original-token', expiration: EXPIRES, mode: 'create' };
      },
      async exchangePublicToken() {
        exchanges += 1;
        return { access_token: 'server-access-token', item_id: 'provider-item-1' };
      },
      async fetchItem() {
        return { item: { item_id: 'provider-item-1', institution_id: 'ins_test' } } as never;
      },
      async fetchInstitution() {
        return {
          institutionId: 'ins_test', name: 'Sandbox Bank', countryCodes: ['US'],
          products: ['auth', 'balance'], oauth: true,
        };
      },
      async fetchBalances() {
        return {
          accounts: [{
            account_id: 'account-1', name: 'Checking', mask: '1234', type: 'depository',
            subtype: 'checking', balances: { current: 1200, available: 1100, iso_currency_code: 'EUR' },
          }],
          item: { item_id: 'provider-item-1', institution_id: 'ins_test' },
        } as never;
      },
      async fetchTransactions() { return { transactions: [], hasMore: false }; },
      async removeItem() { return {}; },
      isLoginRequiredError() { return false; },
      mapAccounts(input) {
        return input.accounts.map((account) => ({
          id: `cash-${account.account_id}`,
          userId: input.userId,
          name: account.name ?? 'Account',
          nickname: account.name ?? 'Account',
          institutionName: input.institutionName,
          institutionId: input.institutionId,
          accountType: 'checking',
          currency: 'EUR',
          balance: account.balances.current ?? 0,
          currentBalance: account.balances.current ?? 0,
          availableBalance: account.balances.available ?? null,
          maskedReference: account.mask ?? null,
          source: 'linked',
          sourceType: 'linked',
          isManual: false,
          isIncludedInPortfolio: true,
          status: 'active',
          syncStatus: 'success',
          lastSyncedAt: input.syncedAt,
          providerName: 'plaid',
          providerEnvironment: input.providerEnvironment,
          connectionId: input.connectionId,
          externalAccountId: account.account_id,
          notes: '',
          createdAt: input.syncedAt,
          updatedAt: input.syncedAt,
        }));
      },
    };
    const buildService = () => createOpenBankingService({
      store: createOpenBankingConnectionStore({
        filePath: connectionPath,
        encodedMasterKey: VAULT_KEY,
        expectedEnvironment: 'sandbox',
      }),
      linkSessions: createFileOpenBankingLinkSessionStore({
        filePath: linkPath,
        now: () => new Date(NOW),
        createId: () => 'link-session-1',
      }),
      oauthRecovery: createFileOAuthRecoveryStore(oauthPath),
      plaid: gateway,
      now: () => new Date(NOW),
      createOAuthStateId: () => 'A'.repeat(43),
      createConnectionId: () => 'connection-1',
    });

    const created = await buildService().createConnectionSession(
      { userId: OWNER },
      { providerName: 'plaid' }
    );
    const receivedRedirectUri =
      `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}&provider_return=complete`;
    const resumed = await buildService().resumeOAuth(
      { userId: OWNER },
      { receivedRedirectUri }
    );
    assert.equal(resumed.sessionId, created.sessionId);
    assert.equal(resumed.linkToken, created.linkToken);
    assert.equal(resumed.receivedRedirectUri, receivedRedirectUri);
    assert.equal((await buildService().resumeOAuth(
      { userId: OWNER },
      { receivedRedirectUri }
    )).sessionId, created.sessionId);
    await assert.rejects(
      buildService().resumeOAuth({ userId: 'other-owner' }, { receivedRedirectUri }),
      OpenBankingOAuthStateError
    );

    const completed = await buildService().completeConnection(
      { userId: OWNER },
      { sessionId: created.sessionId, publicToken: 'public-once' }
    );
    assert.equal(completed.connection.id, 'connection-1');
    assert.equal(exchanges, 1);
    await assert.rejects(
      buildService().completeConnection(
        { userId: OWNER },
        { sessionId: created.sessionId, publicToken: 'public-replay' }
      )
    );
    assert.equal(exchanges, 1);

    const owned = await buildService().listOwnedConnections({ userId: OWNER });
    assert.equal(owned.connections[0]?.id, 'connection-1');
    assert.equal(owned.connections[0]?.recoverySafe, true);
    assert.equal(JSON.stringify(owned).includes('server-access-token'), false);
    assert.equal(JSON.stringify(owned).includes('provider-item-1'), false);
    const recoveredAfterFrontendLoss = await buildService().refreshConnection(
      { userId: OWNER },
      'connection-1',
      'sandbox'
    );
    assert.equal(recoveredAfterFrontendLoss.connection.id, 'connection-1');
    assert.equal(recoveredAfterFrontendLoss.accounts[0]?.connectionId, 'connection-1');
    assert.equal(exchanges, 1);
  });
});

test('OAuth resume rejects malformed redirect and Link intent or connection mismatch', async () => {
  await withSandboxConfiguration(async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 're-oauth-mismatch-'));
    const oauthStore = createFileOAuthRecoveryStore(path.join(directory, 'oauth.json'));
    const linkStore = createFileOpenBankingLinkSessionStore({
      filePath: path.join(directory, 'links.json'),
      now: () => new Date(NOW),
      createId: () => 'link-session-1',
    });
    const session = linkStore.create({ ownerUserId: OWNER, environment: 'sandbox' });
    oauthStore.save(oauthRecord({
      linkSessionId: session.id,
      intent: 'reauthentication',
      connectionId: 'wrong-connection',
    }));
    const service = createOpenBankingService({
      store: {} as never,
      linkSessions: linkStore,
      oauthRecovery: oauthStore,
      plaid: {} as never,
      now: () => new Date(NOW),
    });
    await assert.rejects(
      service.resumeOAuth({ userId: OWNER }, { receivedRedirectUri: 'not-a-url' }),
      (error: unknown) => error instanceof OpenBankingOAuthStateError &&
        error.code === 'OPEN_BANKING_OAUTH_CALLBACK_INVALID'
    );
    await assert.rejects(
      service.resumeOAuth(
        { userId: OWNER },
        { receivedRedirectUri: `https://attacker.example/oauth/plaid?oauth_state_id=${PROVIDER_STATE}` }
      ),
      (error: unknown) => error instanceof OpenBankingOAuthStateError &&
        error.code === 'OPEN_BANKING_OAUTH_CALLBACK_INVALID'
    );
    await assert.rejects(
      service.resumeOAuth(
        { userId: OWNER },
        { receivedRedirectUri: `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}&oauth_state_id=duplicate` }
      ),
      (error: unknown) => error instanceof OpenBankingOAuthStateError &&
        error.code === 'OPEN_BANKING_OAUTH_CALLBACK_INVALID'
    );
    await assert.rejects(
      service.resumeOAuth(
        { userId: OWNER },
        { receivedRedirectUri: `${REDIRECT}?oauth_state_id=${PROVIDER_STATE}` }
      ),
      (error: unknown) => error instanceof OpenBankingOAuthStateError &&
        error.code === 'OPEN_BANKING_OAUTH_STATE_MISMATCH'
    );
  });
});
