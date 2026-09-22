import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import {
  createOperationalStores,
  createPostgresOperationalStoresWithPool,
} from '../dist-server/postgresOperationalStore.mjs';

const scrypt = promisify(scryptCallback);
const databaseUrl = process.env.DATABASE_URL;
if (process.env.BATCH_B_LIVE_DB !== '1' || !databaseUrl) {
  console.error('FAIL live validation requires BATCH_B_LIVE_DB=1 and DATABASE_URL.');
  process.exit(2);
}

const environment = {
  DATABASE_URL: databaseUrl,
  OPEN_BANKING_VAULT_KEY: randomBytes(32).toString('base64'),
  PLAID_ENV: 'sandbox',
  PLAID_CLIENT_ID: 'synthetic-validation-client',
  PLAID_SECRET: 'synthetic-validation-secret',
  PLAID_PRODUCTS: 'auth',
  PLAID_COUNTRY_CODES: 'ES',
  PLAID_REDIRECT_URI: 'http://localhost:5173/oauth/plaid',
  OPEN_BANKING_MODE: 'enabled',
};
const pool = new Pool({ connectionString: databaseUrl, max: 10 });
const email = `batch-b-${randomUUID()}@example.invalid`;
const secondEmail = `other-${randomUUID()}@example.invalid`;
const passwords = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
const synthetic = {
  accessToken: `synthetic-access-${randomUUID()}`,
  linkToken: `synthetic-link-${randomUUID()}`,
  itemId: `synthetic-item-${randomUUID()}`,
  accountId: `synthetic-account-${randomUUID()}`,
};
let ownerId = null;
let pilotPassword = null;
let stores = null;
let restarted = null;

const check = async (label, operation) => {
  try {
    await operation();
    console.log(`PASS ${label}`);
  } catch (error) {
    const location = error?.stack?.match(/validate-managed-postgres\.mjs:\d+:\d+/)?.[0] ?? '';
    console.error(`FAIL ${label}: ${error?.code ?? error?.name ?? 'unknown error'} ${location}`);
    throw error;
  }
};

const bootstrap = (password, targetEmail = email) => new Promise((resolve) => {
  const child = spawn(process.execPath, [
    'dist-server/bootstrapProductionUser.mjs', '--email', targetEmail, '--name', 'Synthetic pilot',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment, NODE_ENV: 'production' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(0, 4096); });
  child.stdin.end(`${password}\n`);
  child.on('error', () => resolve({ ok: false, category: 'spawn' }));
  child.on('close', (code) => resolve({
    ok: code === 0,
    category: code === 0 ? 'success' :
      /23505|unique constraint|duplicate key/i.test(stderr) ? 'unique constraint' :
      /password/i.test(stderr) ? 'password' :
      /DATABASE_MIGRATION_INVALID/i.test(stderr) ? 'migration guard' :
      /connect|timeout|ECONN/i.test(stderr) ? 'connection' :
      stderr.match(/\b(?:ERR_[A-Z_]+|[A-Z]{2,}_[A-Z_]+|[A-Z][a-z]+Error)\b/g)?.slice(0, 3).join('/') ?? 'other',
  }));
});

const expectOneWinner = async (operations) => {
  const results = await Promise.allSettled(operations.map((operation) => operation()));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  return results.find((result) => result.status === 'fulfilled').value;
};

const expectMigrationGuard = async (change) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await change(client);
    await assert.rejects(
      () => createPostgresOperationalStoresWithPool({ pool: client, environment }),
      (error) => error?.code === 'DATABASE_MIGRATION_INVALID'
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
};

const unusedLocalPort = async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const exists = async (file) => stat(file).then(() => true, () => false);

const validateProductionRuntime = async () => {
  const port = await unusedLocalPort();
  const origin = 'https://batch-b-validation.invalid';
  const runtime = {
    ...process.env, ...environment,
    NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
    PUBLIC_ORIGIN: origin, SESSION_COOKIE_SECURE: 'true', TRUST_PROXY: '1',
    OPERATIONAL_STORE_MODULE: path.resolve('dist-server/postgresOperationalStore.mjs'),
    ACCOUNT_BACKUP_MODE: 'disabled', OPEN_BANKING_MODE: 'disabled',
  };
  for (const name of [
    'PLAID_ENV', 'PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_PRODUCTS',
    'PLAID_COUNTRY_CODES', 'PLAID_REDIRECT_URI',
  ]) delete runtime[name];
  const backupPath = path.resolve('.data/account-backups.json');
  const backupExisted = await exists(backupPath);
  const child = spawn(process.execPath, ['dist-server/server.mjs'], {
    cwd: process.cwd(), env: runtime, stdio: 'ignore',
  });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        const body = await response.json();
        if (response.status === 200 && JSON.stringify(body) === '{"status":"ready"}') {
          healthy = true;
          break;
        }
      } catch { /* Startup may still be connecting. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(healthy, 'production runtime did not become ready');
    const base = `http://127.0.0.1:${port}`;
    const root = await fetch(base);
    assert.equal(root.status, 200);
    assert.equal(root.headers.get('cache-control'), 'no-cache');
    const html = await root.text();
    assert.match(html, /<div id="root"><\/div>/);
    const javascript = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
    const stylesheet = html.match(/href="(\/assets\/[^" ]+\.css)"/)?.[1];
    assert.ok(javascript && stylesheet);
    for (const [asset, type] of [[javascript, 'text/javascript'], [stylesheet, 'text/css']]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type')?.startsWith(type));
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    }
    for (const route of ['/properties', '/oauth/plaid', '/oauth/plaid?oauth_state_id=synthetic']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), html);
      if (route.startsWith('/oauth/plaid')) assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const unknown = await fetch(`${base}/api/unknown`);
    assert.equal(unknown.status, 404);
    assert.ok(unknown.headers.get('content-type')?.startsWith('application/json'));
    assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    for (const target of ['/assets/../../server/serverAuth.ts', '/%2e%2e/server/serverAuth.ts']) {
      const status = await new Promise((resolve, reject) => {
        const request = httpRequest({ host: '127.0.0.1', port, path: target }, (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        });
        request.once('error', reject);
        request.end();
      });
      assert.equal(status, 404);
    }
    assert.equal((await fetch(`${base}/api/auth/session`)).status, 401);
    const loginHeaders = {
      'content-type': 'application/json', origin,
      'x-forwarded-host': new URL(origin).host,
      'x-forwarded-proto': 'https',
    };
    const loginBody = JSON.stringify({ email, password: pilotPassword });
    const insecure = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { ...loginHeaders, 'x-forwarded-proto': 'http' }, body: loginBody,
    });
    assert.equal(insecure.status, 403);
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: loginHeaders, body: loginBody,
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.equal((await fetch(`${base}/api/auth/session`, { headers: { cookie } })).status, 200);
    for (const [route, method] of [
      ['/api/open-banking/session/create', 'POST'],
      ['/api/open-banking/connection/complete', 'POST'],
      ['/api/open-banking/oauth/resume', 'POST'],
      ['/api/open-banking/connection/refresh', 'POST'],
      ['/api/open-banking/connection/disconnect', 'POST'],
      ['/api/open-banking/transactions/sync', 'POST'],
      ['/api/open-banking/connection/delete', 'POST'],
      ['/api/open-banking/preflight', 'POST'],
      ['/api/open-banking/connections', 'GET'],
    ]) {
      const response = await fetch(`${base}${route}`, { method });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'OPEN_BANKING_DISABLED');
    }
    const config = await fetch(`http://127.0.0.1:${port}/api/config`);
    assert.deepEqual(await config.json(), {
      accountBackupMode: 'disabled', openBankingAvailable: false,
    });
    for (const route of ['/api/account-backup/save', '/api/account-backup/load']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST' });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'ACCOUNT_BACKUP_DISABLED');
    }
    assert.equal(await exists(backupPath), backupExisted);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('close', resolve));
  }
};

try {
  await check('connectivity and TLS', async () => {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT 1 AS ready');
      assert.equal(result.rows[0].ready, 1);
      assert.equal(client.connection.stream.encrypted, true);
      assert.equal(client.connection.stream.authorized, true);
    } finally {
      client.release();
    }
  });

  await check('migration history and database schema', async () => {
    const migration = await pool.query('SELECT version, checksum_sha256 FROM schema_migrations');
    const sql = await readFile(path.resolve('dist-server/migrations/001_operational_store.sql'));
    const checksum = createHash('sha256').update(sql).digest('hex');
    assert.deepEqual(migration.rows.map((row) => row.version), ['001']);
    assert.equal(migration.rows[0].checksum_sha256.trim(), checksum);
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    for (const name of [
      'schema_migrations', 'users', 'auth_sessions', 'provider_connections',
      'provider_connection_accounts', 'provider_revoked_items', 'link_sessions',
      'oauth_recovery_states',
    ]) assert.ok(tables.rows.some((row) => row.table_name === name), name);
    assert.ok(!tables.rows.some((row) => row.table_name === 'provider_transactions'));
    const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'");
    for (const name of [
      'users_email_normalized_unique', 'users_single_pilot_unique',
      'oauth_recovery_provider_state_unique',
    ]) assert.ok(indexes.rows.some((row) => row.indexname === name), name);
    const checks = await pool.query("SELECT count(*)::integer AS n FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c'");
    assert.ok(checks.rows[0].n >= 10);
  });

  await check('changed, unknown, and stale migration fail closed', async () => {
    await expectMigrationGuard((client) => client.query(
      "UPDATE schema_migrations SET checksum_sha256=$1 WHERE version='001'", ['0'.repeat(64)]
    ));
    await expectMigrationGuard((client) => client.query(
      "INSERT INTO schema_migrations(version,checksum_sha256) VALUES ('999',$1)", ['0'.repeat(64)]
    ));
    await expectMigrationGuard((client) => client.query("DELETE FROM schema_migrations WHERE version='001'"));
  });

  await check('synthetic bootstrap, scrypt, and one-user constraint', async () => {
    const before = await pool.query('SELECT count(*)::integer AS n FROM users');
    assert.equal(before.rows[0].n, 0, 'validation requires an empty pilot database');
    const outcomes = await Promise.all(passwords.map((password) => bootstrap(password)));
    if (outcomes.filter((result) => result.ok).length !== 1) {
      console.error(`Bootstrap result categories: ${outcomes.map((result) => result.category).join(', ')}`);
    }
    assert.equal(outcomes.filter((result) => result.ok).length, 1,
      `bootstrap outcomes: ${outcomes.map((result) => result.category).join(', ')}`);
    assert.equal((await bootstrap(randomBytes(32).toString('base64url'))).ok, false);
    assert.equal((await bootstrap(randomBytes(32).toString('base64url'), secondEmail)).ok, false);
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    assert.equal(result.rowCount, 1);
    const row = result.rows[0];
    ownerId = row.id;
    assert.equal(row.password_algorithm, 'scrypt');
    assert.equal(row.password_key_length, 64);
    assert.equal(row.password_scrypt_n, 16384);
    assert.equal(row.password_scrypt_r, 8);
    assert.equal(row.password_scrypt_p, 1);
    assert.ok(!passwords.some((password) => JSON.stringify(row).includes(password)));
    const verified = await Promise.all(passwords.map(async (password) => {
      const hash = await scrypt(password, Buffer.from(row.password_salt, 'base64'), 64, {
        N: row.password_scrypt_n, r: row.password_scrypt_r, p: row.password_scrypt_p,
      });
      return hash.toString('base64') === row.password_hash;
    }));
    assert.equal(verified.filter(Boolean).length, 1);
    pilotPassword = passwords[verified.findIndex(Boolean)];
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM users')).rows[0].n, 1);
  });

  stores = await createOperationalStores({ environment });
  await check('adapter readiness', () => stores.assertReady());

  let session;
  let link;
  let oauthLink;
  await check('user, auth session, and Link persistence', async () => {
    assert.equal((await stores.users.findByEmail(email.toUpperCase()))?.id, ownerId);
    session = await stores.sessions.create(ownerId);
    link = await stores.linkSessions.create({ ownerUserId: ownerId, environment: 'sandbox' });
    oauthLink = await stores.linkSessions.create({ ownerUserId: ownerId, environment: 'sandbox' });
    await stores.close();
    stores = null;
    restarted = await createOperationalStores({ environment });
    assert.equal((await restarted.users.findById(ownerId))?.id, ownerId);
    assert.equal((await restarted.sessions.resolve(session.token))?.userId, ownerId);
    assert.equal((await restarted.linkSessions.loadOwned(link.id, ownerId))?.id, link.id);
    assert.equal(await restarted.linkSessions.loadOwned(link.id, randomUUID()), null);
    const raw = await pool.query('SELECT token_digest FROM auth_sessions WHERE user_id=$1', [ownerId]);
    assert.equal(raw.rows[0].token_digest.trim(), createHash('sha256').update(session.token).digest('hex'));
    assert.ok(!JSON.stringify(raw.rows).includes(session.token));
  });

  await check('expired session rejection', async () => {
    const expiredToken = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(expiredToken).digest('hex');
    await pool.query(`
      INSERT INTO auth_sessions(token_digest,user_id,created_at,expires_at)
      VALUES ($1,$2,now()-interval '2 days',now()-interval '1 day')
    `, [digest, ownerId]);
    assert.equal(await restarted.sessions.resolve(expiredToken), null);
    assert.equal((await pool.query('SELECT 1 FROM auth_sessions WHERE token_digest=$1', [digest])).rowCount, 0);
  });

  await check('concurrent one-time Link consumption', async () => {
    await expectOneWinner([
      () => restarted.linkSessions.consume(link.id, ownerId),
      () => restarted.linkSessions.consume(link.id, ownerId),
    ]);
    assert.equal(await restarted.linkSessions.loadOwned(link.id, ownerId), null);
  });

  const now = new Date();
  const oauthId = `synthetic-oauth-${randomUUID()}`;
  await check('OAuth restart recovery, encryption, and replay', async () => {
    const recovery = {
      id: oauthId, ownerUserId: ownerId, providerName: 'plaid', environment: 'sandbox',
      intent: 'connect', connectionId: null, linkSessionId: oauthLink.id,
      linkToken: synthetic.linkToken, redirectUri: environment.PLAID_REDIRECT_URI,
      providerOAuthStateId: null, receivedRedirectUri: null, callbackReceivedAt: null,
      completedConnectionId: null, createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), consumedAt: null,
    };
    await restarted.oauthRecovery.save(recovery);
    const raw = await pool.query('SELECT * FROM oauth_recovery_states WHERE id=$1', [oauthId]);
    assert.equal(raw.rowCount, 1);
    assert.ok(!JSON.stringify(raw.rows).includes(synthetic.linkToken));
    await restarted.close();
    restarted = await createOperationalStores({ environment });
    assert.equal((await restarted.oauthRecovery.loadOwned({
      id: oauthId, ownerUserId: ownerId, environment: 'sandbox',
    }))?.linkToken, synthetic.linkToken);
    assert.equal(await restarted.oauthRecovery.loadOwned({
      id: oauthId, ownerUserId: randomUUID(), environment: 'sandbox',
    }), null);
    const callback = {
      id: oauthId, ownerUserId: ownerId, environment: 'sandbox',
      providerOAuthStateId: `synthetic-state-${randomUUID()}`,
      receivedRedirectUri: `${environment.PLAID_REDIRECT_URI}?oauth_state_id=synthetic`,
      now: new Date(),
    };
    assert.ok(await restarted.oauthRecovery.recordCallbackOwned(callback));
    assert.ok(await restarted.oauthRecovery.recordCallbackOwned(callback));
    assert.equal(await restarted.oauthRecovery.recordCallbackOwned({
      ...callback, providerOAuthStateId: `different-${randomUUID()}`,
    }), null);
    const consume = {
      id: oauthId, ownerUserId: ownerId, environment: 'sandbox',
      completedConnectionId: null, now: new Date(),
    };
    const second = await createOperationalStores({ environment });
    try {
      const results = await Promise.all([
        restarted.oauthRecovery.consumeOwned(consume),
        second.oauthRecovery.consumeOwned(consume),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(await second.oauthRecovery.consumeOwned(consume), null);
    } finally {
      await second.close();
    }
  });

  let connection;
  let scope;
  await check('concurrent connection uniqueness and one account', async () => {
    const createConnection = (suffix) => ({
      id: `synthetic-connection-${randomUUID()}`, userId: ownerId, providerName: 'plaid',
      environment: 'sandbox', institutionName: 'Synthetic institution',
      institutionId: 'ins_65', accessToken: `${synthetic.accessToken}-${suffix}`,
      itemId: synthetic.itemId, providerItemStatus: 'active', disconnectedAt: null,
      revokedItems: [], selectedAccountIds: [synthetic.accountId],
      selectedAccountCurrencies: { [synthetic.accountId]: 'EUR' },
      transactionSyncCursor: null, consentExpirationTime: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    connection = await expectOneWinner([
      () => restarted.providerConnections.save(createConnection('one')),
      () => restarted.providerConnections.save(createConnection('two')),
    ]);
    scope = { id: connection.id, userId: ownerId, providerName: 'plaid', environment: 'sandbox' };
    const accounts = await pool.query(
      'SELECT count(*)::integer AS n FROM provider_connection_accounts WHERE connection_id=$1',
      [connection.id]
    );
    assert.equal(accounts.rows[0].n, 1);
    await assert.rejects(() => pool.query(`
      INSERT INTO provider_connection_accounts(connection_id,currency,provider_account_id,created_at)
      VALUES ($1,'EUR',$2,now())
    `, [connection.id, `second-${randomUUID()}`]), (error) => error?.code === '23505');
  });

  await check('provider token encryption, ownership, and AAD', async () => {
    const raw = await pool.query('SELECT * FROM provider_connections WHERE id=$1', [connection.id]);
    assert.ok(!JSON.stringify(raw.rows).includes(synthetic.accessToken));
    assert.equal((await restarted.providerConnections.loadOwned(scope))?.accessToken, connection.accessToken);
    assert.equal(await restarted.providerConnections.loadOwned({ ...scope, userId: randomUUID() }), null);
    await assert.rejects(() => restarted.providerConnections.loadOwned({
      ...scope, environment: 'production',
    }));
    const wrongKey = await createOperationalStores({
      environment: { ...environment, OPEN_BANKING_VAULT_KEY: randomBytes(32).toString('base64') },
    });
    try {
      await assert.rejects(() => wrongKey.providerConnections.loadOwned(scope));
      await assert.rejects(() => wrongKey.oauthRecovery.loadOwned({
        id: oauthId, ownerUserId: ownerId, environment: 'sandbox',
      }));
    } finally {
      await wrongKey.close();
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE provider_connections SET institution_id=$2 WHERE id=$1', [
        connection.id, `tampered-${randomUUID()}`,
      ]);
      const tampered = await createPostgresOperationalStoresWithPool({ pool: client, environment });
      await assert.rejects(() => tampered.providerConnections.loadOwned(scope));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  await check('concurrent cursor CAS and encrypted cursor persistence', async () => {
    const second = await createOperationalStores({ environment });
    try {
      await expectOneWinner([
        () => restarted.providerConnections.advanceTransactionCursorOwned(scope, {
          expectedItemId: synthetic.itemId, expectedCursor: null,
          nextCursor: 'synthetic-cursor-one', updatedAt: new Date().toISOString(),
        }),
        () => second.providerConnections.advanceTransactionCursorOwned(scope, {
          expectedItemId: synthetic.itemId, expectedCursor: null,
          nextCursor: 'synthetic-cursor-two', updatedAt: new Date().toISOString(),
        }),
      ]);
      const loaded = await second.providerConnections.loadOwned(scope);
      assert.ok(loaded.transactionSyncCursor?.startsWith('synthetic-cursor-'));
      const raw = await pool.query('SELECT * FROM provider_connections WHERE id=$1', [connection.id]);
      assert.ok(!JSON.stringify(raw.rows).includes(loaded.transactionSyncCursor));
    } finally {
      await second.close();
    }
  });

  await check('disconnect transition conflict and restart persistence', async () => {
    await assert.rejects(() => restarted.providerConnections.beginDisconnectOwned(scope, {
      expectedItemId: `wrong-${randomUUID()}`, requestedAt: new Date().toISOString(),
    }));
    await restarted.providerConnections.beginDisconnectOwned(scope, {
      expectedItemId: synthetic.itemId, requestedAt: new Date().toISOString(),
    });
    await assert.rejects(() => restarted.providerConnections.advanceTransactionCursorOwned(scope, {
      expectedItemId: synthetic.itemId, expectedCursor: null,
      nextCursor: 'stale', updatedAt: new Date().toISOString(),
    }));
    await assert.rejects(() => restarted.providerConnections.markProviderRevokedOwned(scope, {
      expectedItemId: `wrong-${randomUUID()}`, revokedAt: new Date().toISOString(),
    }));
    await restarted.providerConnections.markProviderRevokedOwned(scope, {
      expectedItemId: synthetic.itemId, revokedAt: new Date().toISOString(),
    });
    await restarted.providerConnections.finalizeDisconnectOwned(scope, {
      expectedItemId: synthetic.itemId, revokedAt: new Date().toISOString(),
    });
    await restarted.close();
    restarted = await createOperationalStores({ environment });
    const loaded = await restarted.providerConnections.loadOwned(scope);
    assert.equal(loaded.providerItemStatus, 'disconnected');
    assert.equal(loaded.accessToken, null);
    assert.equal(loaded.transactionSyncCursor, null);
    assert.equal(loaded.revokedItems.length, 1);
  });

  await check('missing and unavailable database fail closed', async () => {
    await assert.rejects(() => createOperationalStores({
      environment: { ...environment, DATABASE_URL: '' },
    }));
    await assert.rejects(() => createOperationalStores({
      environment: {
        ...environment,
        DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/unavailable?sslmode=disable',
      },
    }));
  });
  await check('production runtime readiness and disabled account backup', validateProductionRuntime);
} catch (error) {
  console.error(`FAIL live validation: ${error?.code ?? error?.name ?? 'unknown error'}`);
  process.exitCode = 1;
} finally {
  if (stores) await stores.close().catch(() => {});
  if (restarted) await restarted.close().catch(() => {});
  await pool.query("DELETE FROM users WHERE name='Synthetic pilot' AND email=ANY($1::text[])", [[email, secondEmail]])
    .then(async () => {
      const remaining = await pool.query('SELECT count(*)::integer AS n FROM users WHERE email=ANY($1::text[])', [[email, secondEmail]]);
      assert.equal(remaining.rows[0].n, 0);
      console.log('PASS synthetic rows removed');
    })
    .catch(() => { console.error('FAIL synthetic row cleanup'); process.exitCode = 1; });
  await pool.end();
}
