import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  AccountBackupNotFoundError,
  AccountBackupOwnershipError,
  createAccountBackupStore,
  type AccountBackupStore,
} from '../server/accountBackupStore';
import { brokerApiPlugin } from '../server/brokerApiPlugin';
import {
  AUTH_SESSION_COOKIE_NAME,
  type AuthenticatedServerUser,
  type ServerAuthService,
} from '../server/serverAuth';

const USER_A: AuthenticatedServerUser = {
  id: '14997084-94c4-42df-8fdd-e1a6f4f543e0',
  email: 'owner-a@example.com',
  name: 'Owner A',
  createdAt: '2026-09-17T12:00:00.000Z',
};
const USER_B: AuthenticatedServerUser = {
  id: 'a125381e-f780-4674-8a34-c13995fcbd1e',
  email: 'owner-b@example.com',
  name: 'Owner B',
  createdAt: '2026-09-17T12:00:00.000Z',
};

const backupFor = (user: AuthenticatedServerUser, marker: string) => ({
  version: 1,
  exportedAt: '2026-09-17T12:00:00.000Z',
  user: { name: user.name, email: user.email },
  portfolio: { marker },
  settings: {},
});

const createStoreFixture = async (context: TestContext) => {
  const directory = await mkdtemp(path.join(tmpdir(), 're-account-backup-'));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'account-backups.json');
  const store = createAccountBackupStore({
    filePath,
    now: () => new Date('2026-09-17T13:00:00.000Z'),
  });
  return { filePath, store };
};

interface TestResponse {
  statusCode: number;
  headers: Map<string, string>;
  body: string;
  setHeader(name: string, value: string): void;
  end(value?: string): void;
}

type Middleware = (request: IncomingMessage, response: TestResponse) => Promise<void>;

const createAuthService = (): ServerAuthService => ({
  register: async () => { throw new Error('not used'); },
  enroll: async () => { throw new Error('not used'); },
  login: async () => { throw new Error('not used'); },
  resolveToken: async (token) => token === 'token-a' ? USER_A : token === 'token-b' ? USER_B : null,
  logout: async () => undefined,
});

const createBackupHandlers = (store: AccountBackupStore) => {
  const handlers = new Map<string, Middleware>();
  const plugin = brokerApiPlugin({
    accountBackupStore: store,
    authService: createAuthService(),
    openBankingService: {} as never,
  });
  assert.equal(typeof plugin.configureServer, 'function');
  (plugin.configureServer as (server: unknown) => void)({
    middlewares: {
      use(pathname: string, handler: Middleware) {
        handlers.set(pathname, handler);
      },
    },
  });
  return handlers;
};

const callBackupEndpoint = async (
  handler: Middleware,
  options: {
    token?: string;
    body?: unknown;
    origin?: string | null;
    contentType?: string;
  } = {}
) => {
  const request = Readable.from([JSON.stringify(options.body ?? {})]) as unknown as IncomingMessage;
  Object.assign(request, {
    method: 'POST',
    headers: {
      ...(options.origin === null ? {} : { origin: options.origin ?? 'http://127.0.0.1:8081' }),
      host: '127.0.0.1:8081',
      'content-type': options.contentType ?? 'application/json',
      ...(options.token ? {
        cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(options.token)}`,
      } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const response: TestResponse = {
    statusCode: 0,
    headers: new Map(),
    body: '',
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    end(value) {
      this.body = value ?? '';
    },
  };
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await handler(request, response);
  } finally {
    console.error = originalConsoleError;
  }
  return { response, payload: JSON.parse(response.body) as Record<string, unknown> };
};

test('authenticated user can save their own backup', async (context) => {
  const { store } = await createStoreFixture(context);
  const handlers = createBackupHandlers(store);
  const result = await callBackupEndpoint(handlers.get('/api/account-backup/save')!, {
    token: 'token-a',
    body: { backup: backupFor(USER_A, 'a') },
  });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.payload.email, USER_A.email);
});

test('authenticated user can load their own backup', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save({ userId: USER_A.id, email: USER_A.email }, backupFor(USER_A, 'a'));
  const handlers = createBackupHandlers(store);
  const result = await callBackupEndpoint(handlers.get('/api/account-backup/load')!, {
    token: 'token-a',
  });
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(result.payload.payload, backupFor(USER_A, 'a'));
});

test('unauthenticated backup load and save are rejected', async (context) => {
  const { store } = await createStoreFixture(context);
  const handlers = createBackupHandlers(store);
  const save = await callBackupEndpoint(handlers.get('/api/account-backup/save')!, {
    body: { backup: backupFor(USER_A, 'forged') },
  });
  const load = await callBackupEndpoint(handlers.get('/api/account-backup/load')!);
  assert.equal(save.response.statusCode, 401);
  assert.equal(load.response.statusCode, 401);
});

test('user A cannot load user B backup and receives the same not-found response', async (context) => {
  const { store } = await createStoreFixture(context);
  await store.save({ userId: USER_B.id, email: USER_B.email }, backupFor(USER_B, 'b'));
  const handlers = createBackupHandlers(store);
  const result = await callBackupEndpoint(handlers.get('/api/account-backup/load')!, {
    token: 'token-a',
  });
  assert.equal(result.response.statusCode, 404);
  assert.equal(result.payload.code, 'ACCOUNT_BACKUP_NOT_FOUND');
});

test('forged email or userId selectors are rejected without overwriting another owner', async (context) => {
  const { store } = await createStoreFixture(context);
  const originalB = backupFor(USER_B, 'b-original');
  await store.save({ userId: USER_B.id, email: USER_B.email }, originalB);
  const handlers = createBackupHandlers(store);
  const forgedSave = await callBackupEndpoint(handlers.get('/api/account-backup/save')!, {
    token: 'token-a',
    body: {
      userId: USER_B.id,
      email: USER_B.email,
      backup: backupFor(USER_A, 'a-owned'),
    },
  });
  const forgedLoad = await callBackupEndpoint(handlers.get('/api/account-backup/load')!, {
    token: 'token-a',
    body: { userId: USER_B.id, email: USER_B.email },
  });
  assert.equal(forgedSave.response.statusCode, 400);
  assert.equal(forgedLoad.response.statusCode, 400);
  assert.equal(forgedSave.payload.code, 'ACCOUNT_BACKUP_OWNER_FORBIDDEN');
  assert.equal(forgedLoad.payload.code, 'ACCOUNT_BACKUP_OWNER_FORBIDDEN');
  assert.deepEqual((await store.load({ userId: USER_B.id, email: USER_B.email })).payload, originalB);
  await assert.rejects(
    store.load({ userId: USER_A.id, email: USER_A.email }),
    AccountBackupNotFoundError
  );
});

test('one internally consistent legacy backup is claimed by authenticated UUID', async (context) => {
  const { filePath, store } = await createStoreFixture(context);
  const payload = backupFor(USER_A, 'legacy');
  await writeFile(filePath, JSON.stringify([{
    email: USER_A.email.toUpperCase(),
    payload,
    updatedAt: '2026-09-16T12:00:00.000Z',
  }]), 'utf8');

  assert.deepEqual((await store.load({ userId: USER_A.id, email: USER_A.email })).payload, payload);
  const records = JSON.parse(await readFile(filePath, 'utf8')) as Array<Record<string, unknown>>;
  assert.equal(records[0].userId, USER_A.id);
  assert.equal(records[0].email, USER_A.email);
});

test('ambiguous or internally inconsistent legacy backup fails without being claimed', async (context) => {
  const { filePath, store } = await createStoreFixture(context);
  const original = JSON.stringify([
    {
      email: USER_A.email,
      payload: backupFor(USER_A, 'legacy-1'),
      updatedAt: '2026-09-16T12:00:00.000Z',
    },
    {
      email: USER_A.email.toUpperCase(),
      payload: backupFor(USER_A, 'legacy-2'),
      updatedAt: '2026-09-16T13:00:00.000Z',
    },
  ]);
  await writeFile(filePath, original, 'utf8');
  await assert.rejects(
    store.load({ userId: USER_A.id, email: USER_A.email }),
    AccountBackupOwnershipError
  );
  assert.equal(await readFile(filePath, 'utf8'), original);

  await writeFile(filePath, JSON.stringify([{
    email: USER_A.email,
    payload: backupFor(USER_B, 'mismatch'),
    updatedAt: '2026-09-16T12:00:00.000Z',
  }]), 'utf8');
  await assert.rejects(
    store.load({ userId: USER_A.id, email: USER_A.email }),
    AccountBackupOwnershipError
  );
});

test('backup save requires same origin and JSON content type', async (context) => {
  const { store } = await createStoreFixture(context);
  const handlers = createBackupHandlers(store);
  const handler = handlers.get('/api/account-backup/save')!;
  const missingOrigin = await callBackupEndpoint(handler, {
    token: 'token-a',
    origin: null,
    body: { backup: backupFor(USER_A, 'a') },
  });
  const wrongContentType = await callBackupEndpoint(handler, {
    token: 'token-a',
    contentType: 'text/plain',
    body: { backup: backupFor(USER_A, 'a') },
  });
  assert.equal(missingOrigin.response.statusCode, 403);
  assert.equal(wrongContentType.response.statusCode, 415);
  await assert.rejects(
    store.load({ userId: USER_A.id, email: USER_A.email }),
    AccountBackupNotFoundError
  );
});
