import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBrokerApiApplication } from '../server/apiApplication';
import { readOpenBankingMode } from '../server/openBankingMode';
import { createStandaloneServer, validateProductionServerEnvironment } from '../server/standaloneServer';
import type { ServerAuthService } from '../server/serverAuth';

const productionEnvironment = {
  NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '8080',
  PUBLIC_ORIGIN: 'https://portfolio.example.test',
  SESSION_COOKIE_SECURE: 'true', TRUST_PROXY: '1',
  OPERATIONAL_STORE_MODULE: './dist-server/postgresOperationalStore.mjs',
  DATABASE_URL: 'postgresql://synthetic.invalid/db',
  ACCOUNT_BACKUP_MODE: 'disabled', OPEN_BANKING_MODE: 'disabled',
} as NodeJS.ProcessEnv;

test('Production requires an explicit banking mode and disabled mode needs no Plaid configuration', () => {
  assert.equal(readOpenBankingMode({ NODE_ENV: 'development' }), 'enabled');
  assert.throws(() => readOpenBankingMode({ NODE_ENV: 'production' }));
  assert.throws(() => readOpenBankingMode({ NODE_ENV: 'development', OPEN_BANKING_MODE: 'invalid' }));
  assert.deepEqual(validateProductionServerEnvironment(productionEnvironment), {
    port: 8080, host: '127.0.0.1',
  });
  assert.throws(() => validateProductionServerEnvironment({
    ...productionEnvironment, OPEN_BANKING_MODE: undefined,
  }));
});

test('enabled Production preserves Plaid, environment, and Transactions gates', () => {
  const enabled = { ...productionEnvironment, OPEN_BANKING_MODE: 'enabled' };
  assert.throws(() => validateProductionServerEnvironment(enabled));
  const sandbox = {
    ...enabled, PLAID_ENV: 'sandbox', PLAID_CLIENT_ID: 'fixture', PLAID_SECRET: 'fixture',
    PLAID_PRODUCTS: 'auth', PLAID_COUNTRY_CODES: 'ES',
    PLAID_REDIRECT_URI: 'http://localhost:5173/oauth/plaid',
    OPEN_BANKING_VAULT_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  assert.throws(() => validateProductionServerEnvironment(sandbox));
  const production = {
    ...sandbox, PLAID_ENV: 'production',
    PLAID_REDIRECT_URI: 'https://portfolio.example.test/oauth/plaid',
  };
  assert.deepEqual(validateProductionServerEnvironment(production), {
    port: 8080, host: '127.0.0.1',
  });
  assert.throws(() => validateProductionServerEnvironment({
    ...production, PLAID_PRODUCTS: 'auth,transactions',
  }));
});

test('disabled server serves app/auth/health while every banking route rejects before provider access', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 're-banking-disabled-'));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const indexPath = path.join(directory, 'index.html');
  await writeFile(indexPath, '<!doctype html><div id="root">staging app</div>');
  const options = {
    environment: productionEnvironment,
    frontendIndexHtmlPath: indexPath,
    authService: { resolveToken: async () => null } as unknown as ServerAuthService,
    operationalStores: { assertReady: async () => undefined } as never,
    get openBankingService(): never { throw new Error('Provider service must not be accessed'); },
  };
  const application = createBrokerApiApplication(options);
  const server = createStandaloneServer({
    environment: productionEnvironment, frontendIndexHtmlPath: indexPath, application,
  });
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.match(await (await fetch(base)).text(), /staging app/);
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ready' });
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), {
    accountBackupMode: 'disabled', openBankingAvailable: false,
  });
  assert.equal((await fetch(`${base}/api/auth/session`)).status, 401);
  for (const [route, method] of [
    ['/session/create', 'POST'], ['/connection/complete', 'POST'], ['/oauth/resume', 'POST'],
    ['/connection/refresh', 'POST'], ['/connection/disconnect', 'POST'],
    ['/transactions/sync', 'POST'], ['/connection/delete', 'POST'],
    ['/preflight', 'POST'], ['/connections', 'GET'],
  ]) {
    const response = await fetch(`${base}/api/open-banking${route}`, { method });
    assert.equal(response.status, 503, route);
    assert.deepEqual(await response.json(), {
      error: 'Open Banking is unavailable.', code: 'OPEN_BANKING_DISABLED',
    });
  }
});
