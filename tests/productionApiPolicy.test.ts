import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createBrokerApiApplication } from '../server/apiApplication';
import type { ServerAuthService } from '../server/serverAuth';

const authService = (): ServerAuthService => ({
  register: async () => { throw new Error('registration must remain unreachable'); },
  enroll: async () => { throw new Error('enrollment must remain unreachable'); },
  login: async () => { throw new Error('not used'); },
  resolveToken: async () => null,
  logout: async () => undefined,
});

const invoke = async (
  pathname: string,
  method: 'GET' | 'POST',
  ready: () => Promise<void> = async () => undefined
) => {
  const request = Readable.from(method === 'POST' ? ['{}'] : []) as unknown as IncomingMessage;
  Object.assign(request, {
    method,
    url: pathname,
    headers: { host: 'portfolio.example.test', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let body = '';
  const response = {
    statusCode: 0,
    headersSent: false,
    setHeader() {},
    end(value?: string) { body = value ?? ''; },
  } as unknown as ServerResponse;
  const application = createBrokerApiApplication({
    environment: { NODE_ENV: 'production', ACCOUNT_BACKUP_MODE: 'disabled' },
    authService: authService(),
    openBankingService: {} as never,
    operationalStores: { assertReady: ready } as never,
  });
  assert.equal(await application.handle(request, response), true);
  return { statusCode: response.statusCode, body: JSON.parse(body) as Record<string, unknown> };
};

test('Production runtime configuration exposes disabled backup pilot mode', async () => {
  const result = await invoke('/api/config', 'GET');
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.accountBackupMode, 'disabled');
});

test('Production public registration and enrollment are disabled', async () => {
  for (const pathname of ['/api/auth/register', '/api/auth/enroll']) {
    const result = await invoke(pathname, 'POST');
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.code, 'AUTH_ACCOUNT_CREATION_DISABLED');
  }
});

test('Production auxiliary provider APIs require authentication', async () => {
  for (const pathname of ['/api/brokers/etoro/account', '/api/brokers/etoro/test', '/api/fx/rates']) {
    const result = await invoke(pathname, 'GET');
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.code, 'AUTH_REQUIRED');
  }
});

test('Production account backup endpoints fail closed without touching JSON storage', async () => {
  for (const pathname of ['/api/account-backup/save', '/api/account-backup/load']) {
    const result = await invoke(pathname, 'POST');
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, 'ACCOUNT_BACKUP_DISABLED');
  }
});

test('Readiness is minimal and reflects operational database availability', async () => {
  assert.deepEqual(await invoke('/api/health', 'GET'), {
    statusCode: 200,
    body: { status: 'ready' },
  });
  const unavailable = await invoke('/api/health', 'GET', async () => {
    throw new Error('database unavailable');
  });
  assert.deepEqual(unavailable, { statusCode: 503, body: { status: 'unavailable' } });
});
