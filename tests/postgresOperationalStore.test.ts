import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import {
  assertCurrentDatabaseMigrations,
  migrateDatabase,
  type DatabasePool,
} from '../server/databaseMigrations';
import { createPostgresOperationalStoresWithPool } from '../server/postgresOperationalStore';
import { hashServerPassword } from '../server/serverAuth';
import { OpenBankingCursorStateError, OpenBankingVaultError } from '../server/openBankingStore';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-09-21T12:00:00.000Z';
const environment = {
  PLAID_ENV: 'sandbox',
  PLAID_CLIENT_ID: 'fixture-client',
  PLAID_SECRET: 'fixture-credential',
  PLAID_PRODUCTS: 'auth',
  PLAID_COUNTRY_CODES: 'ES',
  PLAID_REDIRECT_URI: 'http://localhost:5173/oauth/plaid',
  OPEN_BANKING_VAULT_KEY: Buffer.alloc(32, 7).toString('base64'),
} as NodeJS.ProcessEnv;

const createDatabase = async () => {
  const database = newDb({ noAstCoverageCheck: true });
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool() as unknown as DatabasePool;
  await migrateDatabase(pool);
  return pool;
};

const seedUser = async (pool: DatabasePool) => {
  const stores = await createPostgresOperationalStoresWithPool({ pool, environment });
  await stores.users.create({
    id: OWNER_ID,
    email: 'owner@example.test',
    name: 'Owner',
    passwordHash: await hashServerPassword('fixture-password-123'),
    createdAt: NOW,
  });
  return stores;
};

test('PostgreSQL migration runner is idempotent and rejects unknown history', async () => {
  const pool = await createDatabase();
  await migrateDatabase(pool);
  await assertCurrentDatabaseMigrations(pool);
  await pool.query(
    "INSERT INTO schema_migrations(version,checksum_sha256) VALUES ('999',$1)",
    ['0'.repeat(64)]
  );
  await assert.rejects(() => assertCurrentDatabaseMigrations(pool), /unknown migration 999/);
  await pool.end();
});

test('PostgreSQL migration ledger rejects a changed checksum', async () => {
  const pool = await createDatabase();
  await pool.query(
    "UPDATE schema_migrations SET checksum_sha256=$1 WHERE version='001'",
    ['0'.repeat(64)]
  );
  await assert.rejects(() => assertCurrentDatabaseMigrations(pool), /checksum does not match/);
  await pool.end();
});

test('PostgreSQL sessions persist across adapter recreation and Link consumption is one-time', async () => {
  const pool = await createDatabase();
  const first = await seedUser(pool);
  await assert.rejects(() => first.users.create({
    id: '22222222-2222-4222-8222-222222222222',
    email: 'second@example.test',
    name: 'Second',
    passwordHash: {
      algorithm: 'scrypt', salt: 'fixture-salt', hash: 'fixture-hash',
      keyLength: 64, N: 16384, r: 8, p: 1,
    },
    createdAt: NOW,
  }));
  const session = await first.sessions.create(OWNER_ID);
  const link = await first.linkSessions.create({ ownerUserId: OWNER_ID, environment: 'sandbox' });

  const restarted = await createPostgresOperationalStoresWithPool({ pool, environment });
  assert.equal((await restarted.users.findByEmail('OWNER@example.test'))?.id, OWNER_ID);
  assert.equal((await restarted.sessions.resolve(session.token))?.userId, OWNER_ID);
  assert.equal((await restarted.linkSessions.loadOwned(link.id, OWNER_ID))?.id, link.id);
  assert.equal(await restarted.linkSessions.loadOwned(link.id, '22222222-2222-4222-8222-222222222222'), null);
  const results = await Promise.allSettled([
    restarted.linkSessions.consume(link.id, OWNER_ID),
    restarted.linkSessions.consume(link.id, OWNER_ID),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await restarted.linkSessions.loadOwned(link.id, OWNER_ID)), null);
  await restarted.sessions.revoke(session.token);
  assert.equal(await first.sessions.resolve(session.token), null);
  await pool.end();
});

test('PostgreSQL OAuth callback replay is idempotent and completion consumes once', async () => {
  const pool = await createDatabase();
  const stores = await seedUser(pool);
  const link = await stores.linkSessions.create({ ownerUserId: OWNER_ID, environment: 'sandbox' });
  const recovery = {
    id: 'state-fixture-1234567890',
    ownerUserId: OWNER_ID,
    providerName: 'plaid' as const,
    environment: 'sandbox' as const,
    intent: 'connect' as const,
    connectionId: null,
    linkSessionId: link.id,
    linkToken: 'link-token-fixture',
    redirectUri: environment.PLAID_REDIRECT_URI!,
    providerOAuthStateId: null,
    receivedRedirectUri: null,
    callbackReceivedAt: null,
    completedConnectionId: null,
    createdAt: NOW,
    expiresAt: '2026-09-21T12:10:00.000Z',
    consumedAt: null,
  };
  await stores.oauthRecovery.save(recovery);
  const restarted = await createPostgresOperationalStoresWithPool({ pool, environment });
  assert.equal((await restarted.oauthRecovery.loadOwned({
    id: recovery.id, ownerUserId: OWNER_ID, environment: 'sandbox',
  }))?.linkToken, recovery.linkToken);
  assert.equal(await restarted.oauthRecovery.loadOwned({
    id: recovery.id,
    ownerUserId: '22222222-2222-4222-8222-222222222222',
    environment: 'sandbox',
  }), null);
  assert.equal(await restarted.oauthRecovery.loadOwned({
    id: recovery.id, ownerUserId: OWNER_ID, environment: 'production',
  }), null);
  const persistedSecret = await pool.query(
    'SELECT link_token_ciphertext FROM oauth_recovery_states WHERE id=$1',
    [recovery.id]
  );
  assert.equal(JSON.stringify(persistedSecret.rows).includes(recovery.linkToken), false);
  const callback = {
    id: recovery.id,
    ownerUserId: OWNER_ID,
    environment: 'sandbox' as const,
    providerOAuthStateId: 'oauth-state-fixture-1234',
    receivedRedirectUri: `${recovery.redirectUri}?oauth_state_id=oauth-state-fixture-1234`,
    now: new Date('2026-09-21T12:01:00.000Z'),
  };
  assert.ok(await stores.oauthRecovery.recordCallbackOwned(callback));
  assert.ok(await stores.oauthRecovery.recordCallbackOwned(callback));
  const consumption = {
    id: recovery.id,
    ownerUserId: OWNER_ID,
    environment: 'sandbox' as const,
    completedConnectionId: null,
    now: new Date('2026-09-21T12:02:00.000Z'),
  };
  const attempts = await Promise.all([
    stores.oauthRecovery.consumeOwned(consumption),
    restarted.oauthRecovery.consumeOwned(consumption),
  ]);
  assert.equal(attempts.filter(Boolean).length, 1);
  await pool.end();
});

test('PostgreSQL provider cursor CAS rejects stale writers and no transactions table exists', async () => {
  const pool = await createDatabase();
  const stores = await seedUser(pool);
  const connection = await stores.providerConnections.save({
    id: 'connection-1',
    userId: OWNER_ID,
    providerName: 'plaid',
    environment: 'sandbox',
    institutionName: 'Fixture Bank',
    institutionId: 'ins_65',
    accessToken: 'access-fixture',
    itemId: 'item-fixture',
    providerItemStatus: 'active',
    disconnectedAt: null,
    revokedItems: [],
    selectedAccountIds: ['account-fixture'],
    selectedAccountCurrencies: { 'account-fixture': 'EUR' },
    transactionSyncCursor: null,
    consentExpirationTime: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const scope = {
    id: connection.id,
    userId: OWNER_ID,
    providerName: 'plaid' as const,
    environment: 'sandbox' as const,
  };
  const restarted = await createPostgresOperationalStoresWithPool({ pool, environment });
  assert.equal((await restarted.providerConnections.loadOwned(scope))?.accessToken, 'access-fixture');
  assert.equal(await restarted.providerConnections.loadOwned({
    ...scope, userId: '22222222-2222-4222-8222-222222222222',
  }), null);
  await assert.rejects(() => restarted.providerConnections.loadOwned({
    ...scope, environment: 'production',
  }));
  await assert.rejects(() => stores.providerConnections.save({
    ...connection,
    id: 'connection-duplicate',
    itemId: 'item-duplicate',
    accessToken: 'access-duplicate-fixture',
  }));
  await stores.providerConnections.advanceTransactionCursorOwned(scope, {
    expectedItemId: 'item-fixture',
    expectedCursor: null,
    nextCursor: 'cursor-1',
    updatedAt: '2026-09-21T12:01:00.000Z',
  });
  await assert.rejects(() => stores.providerConnections.advanceTransactionCursorOwned(scope, {
    expectedItemId: 'item-fixture',
    expectedCursor: null,
    nextCursor: 'cursor-stale',
    updatedAt: '2026-09-21T12:02:00.000Z',
  }), OpenBankingCursorStateError);
  const persisted = await pool.query(
    'SELECT access_token_ciphertext,cursor_ciphertext FROM provider_connections WHERE id=$1',
    [connection.id]
  );
  const persistedJson = JSON.stringify(persisted.rows);
  assert.equal(persistedJson.includes('access-fixture'), false);
  assert.equal(persistedJson.includes('cursor-1'), false);
  await assert.rejects(() => stores.providerConnections.markProviderRevokedOwned(scope, {
    expectedItemId: 'item-fixture',
    revokedAt: '2026-09-21T12:03:00.000Z',
  }), OpenBankingVaultError);
  await stores.providerConnections.beginDisconnectOwned(scope, {
    expectedItemId: 'item-fixture',
    requestedAt: '2026-09-21T12:03:00.000Z',
  });
  await stores.providerConnections.markProviderRevokedOwned(scope, {
    expectedItemId: 'item-fixture',
    revokedAt: '2026-09-21T12:04:00.000Z',
  });
  const disconnected = await stores.providerConnections.finalizeDisconnectOwned(scope, {
    expectedItemId: 'item-fixture',
    revokedAt: '2026-09-21T12:04:00.000Z',
  });
  assert.equal(disconnected.providerItemStatus, 'disconnected');
  assert.equal(disconnected.accessToken, null);
  assert.equal(disconnected.transactionSyncCursor, null);
  assert.equal((await restarted.providerConnections.loadOwned(scope))?.providerItemStatus, 'disconnected');
  assert.deepEqual(disconnected.revokedItems, [{
    itemId: 'item-fixture',
    revokedAt: '2026-09-21T12:04:00.000Z',
  }]);
  const tables = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
  );
  assert.equal(tables.rows.some((row) => row.table_name === 'provider_transactions'), false);
  await pool.end();
});
