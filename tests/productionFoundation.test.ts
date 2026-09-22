import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  brokerApiPlugin,
  createBrokerApiApplication,
} from '../server/brokerApiPlugin';
import type { OpenBankingRequestAuthenticator } from '../server/openBankingAuth';
import {
  createFileOpenBankingLinkSessionStore,
  createOpenBankingLinkSessionStore,
  OpenBankingLinkSessionError,
} from '../server/openBankingLinkSessions';
import type { OpenBankingService, PlaidPilotGateway } from '../server/openBankingService';
import { createOpenBankingService } from '../server/openBankingService';
import {
  createOpenBankingConnectionStore,
  type StoredOpenBankingConnection,
} from '../server/openBankingStore';
import {
  assertProductionOperationalStores,
  DEVELOPMENT_STORE_CAPABILITIES,
  OperationalStoreConfigurationError,
} from '../server/operationalStore';
import {
  assertSameOriginRequest,
  createFileServerSessionStore,
  createServerAuthService,
  createServerUserStore,
  ServerAuthStoreError,
  isSecureRequest,
  type ServerAuthService,
} from '../server/serverAuth';
import type { IncomingMessage } from 'node:http';
import {
  createStandaloneServer,
  validateProductionServerEnvironment,
} from '../server/standaloneServer';

const OWNER_ID = '14997084-94c4-42df-8fdd-e1a6f4f543e0';
const NOW = '2026-09-21T12:00:00.000Z';
const VAULT_KEY = Buffer.alloc(32, 7).toString('base64');

const fixtureDirectory = async (context: TestContext, prefix: string) => {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
};

const withSandboxConfiguration = async (operation: () => Promise<void>) => {
  const names = [
    'PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'PLAID_PRODUCTS',
    'PLAID_COUNTRY_CODES', 'PLAID_REDIRECT_URI', 'OPEN_BANKING_VAULT_KEY',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    PLAID_CLIENT_ID: 'test-client',
    PLAID_SECRET: 'test-secret',
    PLAID_ENV: 'sandbox',
    PLAID_PRODUCTS: 'auth',
    PLAID_COUNTRY_CODES: 'ES',
    PLAID_REDIRECT_URI: 'http://localhost:5173/oauth/plaid',
    OPEN_BANKING_VAULT_KEY: VAULT_KEY,
  });
  try {
    await operation();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
};

test('Vite and standalone transports use the same API route registry', () => {
  const options = {
    authService: {} as ServerAuthService,
    openBankingService: {} as OpenBankingService,
    openBankingAuthenticator: {} as OpenBankingRequestAuthenticator,
  };
  const application = createBrokerApiApplication(options);
  const registered: string[] = [];
  const plugin = brokerApiPlugin(options);
  (plugin.configureServer as (server: unknown) => void)({
    middlewares: { use(routePath: string) { registered.push(routePath); } },
  });
  assert.deepEqual(registered, application.routes.map((route) => route.path));
  assert.equal(new Set(registered).size, registered.length);
});

test('standalone health endpoint is minimal and contains no sensitive state', async (context) => {
  const application = createBrokerApiApplication({
    authService: {} as ServerAuthService,
    openBankingService: {} as OpenBankingService,
    openBankingAuthenticator: {} as OpenBankingRequestAuthenticator,
  });
  const server = createStandaloneServer({ application });
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(body), { status: 'ready' });
  assert.doesNotMatch(body, /token|secret|environment|database|plaid/i);
});

test('standalone server serves the frontend shell for the Plaid OAuth callback', async (context) => {
  const directory = await fixtureDirectory(context, 're-oauth-shell-');
  const indexPath = path.join(directory, 'index.html');
  await writeFile(indexPath, '<!doctype html><div id="root"></div>', 'utf8');
  const application = createBrokerApiApplication({
    authService: {} as ServerAuthService,
    openBankingService: {} as OpenBankingService,
    openBankingAuthenticator: {} as OpenBankingRequestAuthenticator,
  });
  const server = createStandaloneServer({ application, frontendIndexHtmlPath: indexPath });
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const response = await fetch(
    `http://127.0.0.1:${port}/oauth/plaid?oauth_state_id=provider-state`
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('trusted HTTPS proxy headers drive secure cookies without weakening canonical origin', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    TRUST_PROXY: process.env.TRUST_PROXY,
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
  };
  Object.assign(process.env, {
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    PUBLIC_ORIGIN: 'https://portfolio.example.com',
  });
  try {
    const request = {
      headers: {
        origin: 'https://portfolio.example.com',
        host: 'internal-api:8080',
        'x-forwarded-host': 'portfolio.example.com',
        'x-forwarded-proto': 'https',
      },
      socket: {},
    } as unknown as IncomingMessage;
    assert.equal(isSecureRequest(request), true);
    assert.doesNotThrow(() => assertSameOriginRequest(request));
    assert.throws(() => assertSameOriginRequest({
      ...request,
      headers: { ...request.headers, origin: 'https://attacker.example.com' },
    } as IncomingMessage));
    assert.throws(() => assertSameOriginRequest({
      ...request,
      headers: { ...request.headers, 'x-forwarded-proto': 'http' },
    } as unknown as IncomingMessage));
    assert.throws(() => assertSameOriginRequest({
      ...request,
      headers: { ...request.headers, 'x-forwarded-proto': undefined },
    } as unknown as IncomingMessage));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('hashed auth session survives restart and expiry is enforced after restart', async (context) => {
  const directory = await fixtureDirectory(context, 're-auth-restart-');
  const usersPath = path.join(directory, 'users.json');
  const sessionsPath = path.join(directory, 'sessions.json');
  let clock = new Date(NOW);
  const makeService = () => createServerAuthService({
    users: createServerUserStore({ filePath: usersPath }),
    sessions: createFileServerSessionStore({
      filePath: sessionsPath,
      now: () => clock,
      ttlMs: 1000,
    }),
  });
  const login = await makeService().enroll({
    userId: OWNER_ID,
    email: 'owner@example.com',
    name: 'Owner',
    password: 'correct-password',
  });
  assert.equal((await makeService().resolveToken(login.token))?.id, OWNER_ID);
  const persisted = await readFile(sessionsPath, 'utf8');
  assert.equal(persisted.includes(login.token), false);
  clock = new Date('2026-09-21T12:00:02.000Z');
  assert.equal(await makeService().resolveToken(login.token), null);
});

test('Link session survives restart and one-time consumption survives another restart', async (context) => {
  const directory = await fixtureDirectory(context, 're-link-restart-');
  const filePath = path.join(directory, 'links.json');
  const makeStore = () => createFileOpenBankingLinkSessionStore({
    filePath,
    now: () => new Date(NOW),
    createId: () => 'restart-link-session',
  });
  const created = await makeStore().create({ ownerUserId: OWNER_ID, environment: 'sandbox' });
  assert.equal((await makeStore().consume(created.id, OWNER_ID)).environment, 'sandbox');
  await assert.rejects(() => makeStore().consume(created.id, OWNER_ID), OpenBankingLinkSessionError);
});

test('provider record and authoritative cursor survive adapter restart', async (context) => {
  const directory = await fixtureDirectory(context, 're-provider-restart-');
  const filePath = path.join(directory, 'provider.json');
  const makeStore = () => createOpenBankingConnectionStore({
    filePath,
    encodedMasterKey: VAULT_KEY,
    expectedEnvironment: 'sandbox',
  });
  const connection: StoredOpenBankingConnection = {
    id: 'connection-1', userId: OWNER_ID, providerName: 'plaid', environment: 'sandbox',
    institutionName: 'Sandbox Bank', institutionId: 'ins_test',
    accessToken: 'server-only-access-token', itemId: 'item-1', providerItemStatus: 'active',
    disconnectedAt: null, revokedItems: [], selectedAccountIds: ['account-1'],
    transactionSyncCursor: null, createdAt: NOW, updatedAt: NOW,
  };
  await makeStore().save(connection);
  await makeStore().advanceTransactionCursorOwned({
    userId: OWNER_ID, id: connection.id, providerName: 'plaid', environment: 'sandbox',
  }, { expectedItemId: 'item-1', expectedCursor: null, nextCursor: 'cursor-1', updatedAt: NOW });
  const restarted = await makeStore().loadOwned({
    userId: OWNER_ID, id: connection.id, providerName: 'plaid', environment: 'sandbox',
  });
  assert.equal(restarted?.accessToken, 'server-only-access-token');
  assert.equal(restarted?.transactionSyncCursor, 'cursor-1');
  assert.equal((await makeStore().listOwned({
    userId: 'other-owner', providerName: 'plaid', environment: 'sandbox',
  })).length, 0);
});

test('corrupted persisted auth and Link operational state fail closed', async (context) => {
  const directory = await fixtureDirectory(context, 're-corrupt-ops-');
  const sessionsPath = path.join(directory, 'sessions.json');
  const linksPath = path.join(directory, 'links.json');
  await writeFile(sessionsPath, '{bad json', 'utf8');
  await writeFile(linksPath, '{bad json', 'utf8');
  await assert.rejects(
    () => createFileServerSessionStore({ filePath: sessionsPath }).resolve('token'),
    ServerAuthStoreError
  );
  await assert.rejects(
    () => createFileOpenBankingLinkSessionStore({ filePath: linksPath }).consume('id', OWNER_ID),
    OpenBankingLinkSessionError
  );
});

test('disconnect recovery resumes after provider success and local transition failure', async (context) => {
  await withSandboxConfiguration(async () => {
    const directory = await fixtureDirectory(context, 're-disconnect-recovery-');
    const baseStore = createOpenBankingConnectionStore({
      filePath: path.join(directory, 'provider.json'),
      encodedMasterKey: VAULT_KEY,
      expectedEnvironment: 'sandbox',
    });
    await baseStore.save({
      id: 'connection-1', userId: OWNER_ID, providerName: 'plaid', environment: 'sandbox',
      institutionName: 'Sandbox Bank', institutionId: 'ins_test',
      accessToken: 'server-only-access-token', itemId: 'item-1', providerItemStatus: 'active',
      disconnectedAt: null, revokedItems: [], selectedAccountIds: ['account-1'],
      transactionSyncCursor: 'cursor-1', createdAt: NOW, updatedAt: NOW,
    });
    let removeCalls = 0;
    const gateway = {
      async removeItem() { removeCalls += 1; return { removed: true }; },
      isLoginRequiredError() { return false; },
    } as unknown as PlaidPilotGateway;
    let failTransition = true;
    const failingStore = {
      ...baseStore,
      async markProviderRevokedOwned(...args: Parameters<typeof baseStore.markProviderRevokedOwned>) {
        if (failTransition) {
          failTransition = false;
          throw new Error('simulated local write failure');
        }
        return baseStore.markProviderRevokedOwned(...args);
      },
    };
    const makeService = (store: typeof baseStore) => createOpenBankingService({
      store,
      linkSessions: createOpenBankingLinkSessionStore(),
      plaid: gateway,
      now: () => new Date(NOW),
    });
    await assert.rejects(
      makeService(failingStore).disconnectConnection({ userId: OWNER_ID }, 'connection-1', 'sandbox'),
      /simulated local write failure/
    );
    assert.equal((await baseStore.loadOwned({
      userId: OWNER_ID, id: 'connection-1', providerName: 'plaid', environment: 'sandbox',
    }))?.providerItemStatus, 'disconnect_requested');
    await makeService(baseStore).disconnectConnection({ userId: OWNER_ID }, 'connection-1', 'sandbox');
    assert.equal((await baseStore.loadOwned({
      userId: OWNER_ID, id: 'connection-1', providerName: 'plaid', environment: 'sandbox',
    }))?.providerItemStatus, 'disconnected');
    assert.equal(removeCalls, 2);
  });
});

test('owned connection recovery listing is sanitized and owner-scoped', async (context) => {
  await withSandboxConfiguration(async () => {
    const directory = await fixtureDirectory(context, 're-owned-list-');
    const store = createOpenBankingConnectionStore({
      filePath: path.join(directory, 'provider.json'), encodedMasterKey: VAULT_KEY,
      expectedEnvironment: 'sandbox',
    });
    await store.save({
      id: 'connection-1', userId: OWNER_ID, providerName: 'plaid', environment: 'sandbox',
      institutionName: 'Sandbox Bank', institutionId: 'ins_test', accessToken: 'never-browser',
      itemId: 'never-browser-item', providerItemStatus: 'active', disconnectedAt: null,
      revokedItems: [], selectedAccountIds: [], transactionSyncCursor: null,
      createdAt: NOW, updatedAt: NOW,
    });
    const service = createOpenBankingService({
      store, linkSessions: createOpenBankingLinkSessionStore(), plaid: {} as PlaidPilotGateway,
    });
    const listed = await service.listOwnedConnections({ userId: OWNER_ID });
    const serialized = JSON.stringify(listed);
    assert.equal(listed.connections.length, 1);
    assert.equal(serialized.includes('never-browser'), false);
    assert.doesNotMatch(serialized, /accessToken|itemId|transactionSyncCursor/);
    assert.deepEqual(await service.listOwnedConnections({ userId: 'other-owner' }), { connections: [] });
  });
});

test('Production startup rejects unsafe storage and keeps Transactions disabled', () => {
  const productionEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: 'production', PORT: '8080', HOST: '127.0.0.1',
    SESSION_COOKIE_SECURE: 'true', TRUST_PROXY: '1', PUBLIC_ORIGIN: 'https://portfolio.example.com',
    OPERATIONAL_STORE_MODULE: './production-store.mjs',
    DATABASE_URL: 'postgresql://database.invalid/portfolio',
    ACCOUNT_BACKUP_MODE: 'disabled',
    OPEN_BANKING_MODE: 'enabled',
    PLAID_CLIENT_ID: 'configured', PLAID_SECRET: 'configured', PLAID_ENV: 'production',
    PLAID_PRODUCTS: 'auth', PLAID_COUNTRY_CODES: 'ES',
    PLAID_REDIRECT_URI: 'https://portfolio.example.com/oauth/plaid',
    OPEN_BANKING_VAULT_KEY: VAULT_KEY,
  };
  assert.deepEqual(validateProductionServerEnvironment(productionEnvironment), {
    port: 8080, host: '127.0.0.1',
  });
  assert.throws(
    () => validateProductionServerEnvironment({ ...productionEnvironment, OPERATIONAL_STORE_MODULE: '' }),
    OperationalStoreConfigurationError
  );
  assert.throws(
    () => validateProductionServerEnvironment({
      ...productionEnvironment,
      PLAID_REDIRECT_URI: 'https://other.example.com/oauth/plaid',
    }),
    OperationalStoreConfigurationError
  );
  assert.throws(
    () => assertProductionOperationalStores({
      capabilities: DEVELOPMENT_STORE_CAPABILITIES,
    } as never),
    OperationalStoreConfigurationError
  );
  assert.throws(
    () => validateProductionServerEnvironment({
      ...productionEnvironment, PLAID_PRODUCTS: 'auth,transactions',
    }),
    OperationalStoreConfigurationError
  );
});
