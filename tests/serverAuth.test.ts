import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { brokerApiPlugin } from '../server/brokerApiPlugin';
import {
  createServerSessionOpenBankingAuthenticator,
  OpenBankingAuthenticationError,
} from '../server/openBankingAuth';
import {
  assertSameOriginRequest,
  AUTH_SESSION_COOKIE_NAME,
  createLoginThrottle,
  createServerAuthService,
  createServerSessionStore,
  createServerUserStore,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
  type ServerAuthService,
  ServerAuthConflictError,
  ServerAuthInvalidCredentialsError,
  ServerAuthRateLimitError,
  ServerAuthStoreError,
} from '../server/serverAuth';

const USER_A_ID = '14997084-94c4-42df-8fdd-e1a6f4f543e0';
const USER_B_ID = 'a125381e-f780-4674-8a34-c13995fcbd1e';

const createFixture = async (
  context: TestContext,
  options: {
    now?: () => Date;
    ttlMs?: number;
    maximumFailures?: number;
  } = {}
) => {
  const directory = await mkdtemp(path.join(tmpdir(), 're-server-auth-'));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'auth-users.json');
  const users = createServerUserStore({ filePath });
  const sessions = createServerSessionStore({
    now: options.now,
    ttlMs: options.ttlMs,
  });
  const service = createServerAuthService({
    users,
    sessions,
    throttle: createLoginThrottle({
      now: options.now,
      maximumFailures: options.maximumFailures,
    }),
  });
  return { filePath, users, sessions, service };
};

const enrollUserA = (service: Awaited<ReturnType<typeof createFixture>>['service']) =>
  service.enroll({
    userId: USER_A_ID,
    email: 'owner@example.com',
    name: 'Owner',
    password: 'correct-password',
  });

const requestWithCookie = (token?: string) => ({
  headers: {
    ...(token ? { cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` } : {}),
  },
} as unknown as IncomingMessage);

test('server user store persists scrypt metadata without plaintext password', async (context) => {
  const { filePath, service } = await createFixture(context);
  await enrollUserA(service);
  const stored = await readFile(filePath, 'utf8');
  assert.equal(stored.includes('correct-password'), false);
  assert.match(stored, /"algorithm": "scrypt"/);
  assert.match(stored, /"salt":/);
  assert.match(stored, /"hash":/);
});

test('correct password login succeeds and returns the enrolled UUID', async (context) => {
  const { service } = await createFixture(context);
  await enrollUserA(service);
  const result = await service.login({
    email: 'OWNER@example.com',
    password: 'correct-password',
    throttleKey: 'client-a',
  });
  assert.equal(result.user.id, USER_A_ID);
  assert.ok(Buffer.from(result.token, 'base64url').length >= 32);
});

test('wrong password fails with a generic credential error', async (context) => {
  const { service } = await createFixture(context);
  await enrollUserA(service);
  await assert.rejects(service.login({
    email: 'owner@example.com',
    password: 'wrong-password',
    throttleKey: 'client-a',
  }), ServerAuthInvalidCredentialsError);
});

test('unknown email uses the same generic credential error', async (context) => {
  const { service } = await createFixture(context);
  await assert.rejects(service.login({
    email: 'missing@example.com',
    password: 'wrong-password',
    throttleKey: 'client-a',
  }), ServerAuthInvalidCredentialsError);
});

test('forged session cookie fails closed', async (context) => {
  const { service } = await createFixture(context);
  await enrollUserA(service);
  const authenticator = createServerSessionOpenBankingAuthenticator(service);
  await assert.rejects(
    authenticator.authenticate(requestWithCookie('forged-session-token')),
    OpenBankingAuthenticationError
  );
});

test('expired server session fails closed', async (context) => {
  let currentTime = new Date('2026-09-17T12:00:00.000Z');
  const { service } = await createFixture(context, {
    now: () => currentTime,
    ttlMs: 1000,
  });
  const enrolled = await enrollUserA(service);
  currentTime = new Date('2026-09-17T12:00:02.000Z');
  assert.equal(await service.resolveToken(enrolled.token), null);
});

test('logout invalidates the opaque server session', async (context) => {
  const { service } = await createFixture(context);
  const enrolled = await enrollUserA(service);
  assert.equal((await service.resolveToken(enrolled.token))?.id, USER_A_ID);
  service.logout(enrolled.token);
  assert.equal(await service.resolveToken(enrolled.token), null);
});

test('session cookie is HttpOnly, SameSite Lax, host-only, and conditionally Secure', () => {
  const local = serializeSessionCookie('token', { secure: false, maxAgeSeconds: 3600 });
  const production = serializeSessionCookie('token', { secure: true, maxAgeSeconds: 3600 });
  assert.match(local, /HttpOnly/);
  assert.match(local, /SameSite=Lax/);
  assert.match(local, /Path=\//);
  assert.doesNotMatch(local, /Domain=/);
  assert.doesNotMatch(local, /Secure/);
  assert.match(production, /Secure/);
  assert.match(serializeExpiredSessionCookie(true), /Max-Age=0/);
});

test('same-origin validation accepts matching Origin and Host', () => {
  const request = {
    headers: { origin: 'http://127.0.0.1:8081', host: '127.0.0.1:8081' },
  } as unknown as IncomingMessage;
  assert.doesNotThrow(() => assertSameOriginRequest(request));
});

test('same-origin validation rejects missing or cross-origin requests', () => {
  const missing = { headers: { host: '127.0.0.1:8081' } } as unknown as IncomingMessage;
  const crossOrigin = {
    headers: { origin: 'https://attacker.example', host: '127.0.0.1:8081' },
  } as unknown as IncomingMessage;
  assert.throws(() => assertSameOriginRequest(missing), /origin/i);
  assert.throws(() => assertSameOriginRequest(crossOrigin), /origin/i);
});

test('login throttling blocks repeated failures', async (context) => {
  const { service } = await createFixture(context, { maximumFailures: 2 });
  await enrollUserA(service);
  const attempt = () => service.login({
    email: 'owner@example.com',
    password: 'wrong-password',
    throttleKey: 'client-a',
  });
  await assert.rejects(attempt(), ServerAuthInvalidCredentialsError);
  await assert.rejects(attempt(), ServerAuthInvalidCredentialsError);
  await assert.rejects(attempt(), ServerAuthRateLimitError);
});

test('duplicate normalized email enrollment is rejected', async (context) => {
  const { service } = await createFixture(context);
  await enrollUserA(service);
  await assert.rejects(service.enroll({
    userId: USER_B_ID,
    email: 'OWNER@EXAMPLE.COM',
    name: 'Other',
    password: 'another-password',
  }), ServerAuthConflictError);
});

test('duplicate UUID enrollment is rejected', async (context) => {
  const { service } = await createFixture(context);
  await enrollUserA(service);
  await assert.rejects(service.enroll({
    userId: USER_A_ID,
    email: 'other@example.com',
    name: 'Other',
    password: 'another-password',
  }), ServerAuthConflictError);
});

test('existing-user enrollment preserves the requested UUID exactly', async (context) => {
  const { service } = await createFixture(context);
  const enrolled = await enrollUserA(service);
  assert.equal(enrolled.user.id, USER_A_ID);
  assert.equal((await service.resolveToken(enrolled.token))?.id, USER_A_ID);
});

test('malformed authentication store fails closed instead of becoming empty', async (context) => {
  const { filePath, users } = await createFixture(context);
  await writeFile(filePath, '{not-json', 'utf8');
  await assert.rejects(users.findByEmail('owner@example.com'), ServerAuthStoreError);
});

test('raw session token is not persisted in the backend user file', async (context) => {
  const { filePath, service } = await createFixture(context);
  const enrolled = await enrollUserA(service);
  const stored = await readFile(filePath, 'utf8');
  assert.equal(stored.includes(enrolled.token), false);
  assert.equal(stored.includes('tokenDigest'), false);
});

test('authenticated Banking request resolves its owner only from the server cookie', async (context) => {
  const { service } = await createFixture(context);
  const enrolled = await enrollUserA(service);
  const authenticator = createServerSessionOpenBankingAuthenticator(service);
  const principal = await authenticator.authenticate(requestWithCookie(enrolled.token));
  assert.deepEqual(principal, { userId: USER_A_ID });
});

test('unauthenticated Banking request remains denied', async (context) => {
  const { service } = await createFixture(context);
  const authenticator = createServerSessionOpenBankingAuthenticator(service);
  await assert.rejects(
    authenticator.authenticate(requestWithCookie()),
    OpenBankingAuthenticationError
  );
});

test('auth endpoint returns the raw session token only in the HttpOnly cookie', async () => {
  const rawToken = Buffer.alloc(32, 7).toString('base64url');
  const user = {
    id: USER_A_ID,
    email: 'owner@example.com',
    name: 'Owner',
    createdAt: '2026-09-17T12:00:00.000Z',
  };
  const authService: ServerAuthService = {
    register: async () => ({
      user,
      token: rawToken,
      expiresAt: '2026-09-18T12:00:00.000Z',
    }),
    enroll: async () => { throw new Error('not used'); },
    login: async () => { throw new Error('not used'); },
    resolveToken: async () => null,
    logout: () => undefined,
  };
  const handlers = new Map<string, (request: IncomingMessage, response: unknown) => Promise<void>>();
  const plugin = brokerApiPlugin({
    authService,
    openBankingService: {} as never,
  });
  const configureServer = plugin.configureServer;
  assert.equal(typeof configureServer, 'function');
  (configureServer as (server: unknown) => void)({
    middlewares: {
      use(pathname: string, handler: (request: IncomingMessage, response: unknown) => Promise<void>) {
        handlers.set(pathname, handler);
      },
    },
  });

  const request = Readable.from([JSON.stringify({
    email: user.email,
    name: user.name,
    password: 'correct-password',
  })]) as unknown as IncomingMessage;
  Object.assign(request, {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:8081',
      host: '127.0.0.1:8081',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const headers = new Map<string, string>();
  let responseBody = '';
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(value?: string) {
      responseBody = value ?? '';
    },
  };

  await handlers.get('/api/auth/register')?.(request, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(JSON.parse(responseBody), { user });
  assert.equal(responseBody.includes(rawToken), false);
  assert.match(headers.get('set-cookie') ?? '', new RegExp(rawToken));
  assert.match(headers.get('set-cookie') ?? '', /HttpOnly/);
});
