import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';

export const AUTH_SESSION_COOKIE_NAME = 're_portfolio_session';
const AUTH_STORE_VERSION = 1;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SCRYPT_N = 16_384;
const PASSWORD_SCRYPT_R = 8;
const PASSWORD_SCRYPT_P = 1;
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface AuthenticatedServerUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface StoredPasswordHash {
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  keyLength: 64;
  N: 16384;
  r: 8;
  p: 1;
}

export interface StoredServerUser extends AuthenticatedServerUser {
  passwordHash: StoredPasswordHash;
}

interface StoredServerUserFile {
  version: 1;
  users: StoredServerUser[];
}

export class ServerAuthError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ServerAuthError';
  }
}

export class ServerAuthStoreError extends ServerAuthError {
  constructor(message = 'Authentication store is unavailable.') {
    super('AUTH_STORE_ERROR', 503, message);
    this.name = 'ServerAuthStoreError';
  }
}

export class ServerAuthInvalidCredentialsError extends ServerAuthError {
  constructor() {
    super('AUTH_INVALID_CREDENTIALS', 401, 'Invalid email or password.');
    this.name = 'ServerAuthInvalidCredentialsError';
  }
}

export class ServerAuthConflictError extends ServerAuthError {
  constructor() {
    super('AUTH_ENROLLMENT_CONFLICT', 409, 'Account enrollment conflicts with an existing account.');
    this.name = 'ServerAuthConflictError';
  }
}

export class ServerAuthRateLimitError extends ServerAuthError {
  constructor() {
    super('AUTH_RATE_LIMITED', 429, 'Too many login attempts. Try again later.');
    this.name = 'ServerAuthRateLimitError';
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const derivePasswordHash = (
  password: string,
  salt: Buffer,
  metadata: Pick<StoredPasswordHash, 'keyLength' | 'N' | 'r' | 'p'>
) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, metadata.keyLength, {
    N: metadata.N,
    r: metadata.r,
    p: metadata.p,
    maxmem: 64 * 1024 * 1024,
  }, (error, derivedKey) => {
    if (error) reject(error);
    else resolve(derivedKey);
  });
});

export const hashServerPassword = async (password: string): Promise<StoredPasswordHash> => {
  if (password.length < 8 || password.length > 256) {
    throw new ServerAuthError('AUTH_PASSWORD_INVALID', 400, 'Password must contain 8 to 256 characters.');
  }
  const salt = randomBytes(16);
  const metadata = {
    keyLength: PASSWORD_KEY_LENGTH,
    N: PASSWORD_SCRYPT_N,
    r: PASSWORD_SCRYPT_R,
    p: PASSWORD_SCRYPT_P,
  } as const;
  const hash = await derivePasswordHash(password, salt, metadata);
  return {
    algorithm: 'scrypt',
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    ...metadata,
  };
};

const isPasswordHash = (value: unknown): value is StoredPasswordHash => {
  if (!value || typeof value !== 'object') return false;
  const hash = value as Record<string, unknown>;
  return hash.algorithm === 'scrypt' &&
    typeof hash.salt === 'string' &&
    typeof hash.hash === 'string' &&
    hash.keyLength === PASSWORD_KEY_LENGTH &&
    hash.N === PASSWORD_SCRYPT_N &&
    hash.r === PASSWORD_SCRYPT_R &&
    hash.p === PASSWORD_SCRYPT_P;
};

export const verifyServerPassword = async (
  password: string,
  passwordHash: StoredPasswordHash
): Promise<boolean> => {
  try {
    const expected = Buffer.from(passwordHash.hash, 'base64');
    const actual = await derivePasswordHash(
      password,
      Buffer.from(passwordHash.salt, 'base64'),
      passwordHash
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};

const isStoredUser = (value: unknown): value is StoredServerUser => {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'string' && isUuid(user.id) &&
    typeof user.email === 'string' && user.email === normalizeEmail(user.email) &&
    typeof user.name === 'string' && user.name.length > 0 &&
    typeof user.createdAt === 'string' &&
    isPasswordHash(user.passwordHash);
};

const toPublicUser = ({ passwordHash: _passwordHash, ...user }: StoredServerUser) => user;

export interface ServerUserStore {
  findById(id: string): Promise<StoredServerUser | null>;
  findByEmail(email: string): Promise<StoredServerUser | null>;
  create(input: {
    id: string;
    email: string;
    name: string;
    passwordHash: StoredPasswordHash;
    createdAt: string;
  }): Promise<StoredServerUser>;
}

export const createServerUserStore = (options: { filePath: string }): ServerUserStore => {
  const filePath = path.resolve(options.filePath);
  let writeQueue: Promise<void> = Promise.resolve();

  const readStore = async (): Promise<StoredServerUserFile> => {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: AUTH_STORE_VERSION, users: [] };
      }
      throw new ServerAuthStoreError();
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
      const record = parsed as Record<string, unknown>;
      if (record.version !== AUTH_STORE_VERSION || !Array.isArray(record.users) || !record.users.every(isStoredUser)) {
        throw new Error('invalid');
      }
      const users = record.users as StoredServerUser[];
      if (new Set(users.map((user) => user.id)).size !== users.length ||
          new Set(users.map((user) => user.email)).size !== users.length) {
        throw new Error('duplicate');
      }
      return { version: AUTH_STORE_VERSION, users };
    } catch {
      throw new ServerAuthStoreError('Authentication store is malformed or corrupted.');
    }
  };

  const writeStore = async (store: StoredServerUserFile) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  };

  const withWriteLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    const run = writeQueue.then(operation, operation);
    writeQueue = run.then(() => undefined, () => undefined);
    return run;
  };

  return {
    async findById(id) {
      return (await readStore()).users.find((user) => user.id === id) ?? null;
    },
    async findByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      return (await readStore()).users.find((user) => user.email === normalizedEmail) ?? null;
    },
    async create(input) {
      return withWriteLock(async () => {
        const store = await readStore();
        const email = normalizeEmail(input.email);
        if (store.users.some((user) => user.id === input.id || user.email === email)) {
          throw new ServerAuthConflictError();
        }
        const user: StoredServerUser = { ...input, email };
        if (!isStoredUser(user)) {
          throw new ServerAuthError('AUTH_REGISTRATION_INVALID', 400, 'Invalid account registration.');
        }
        await writeStore({ version: AUTH_STORE_VERSION, users: [...store.users, user] });
        return user;
      });
    },
  };
};

export interface StoredServerSession {
  tokenDigest: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ServerSessionStore {
  create(userId: string): Promise<{ token: string; expiresAt: string }>;
  resolve(token: string): Promise<StoredServerSession | null>;
  revoke(token: string): Promise<void>;
  revokeUser(userId: string): Promise<void>;
}

interface StoredServerSessionFile {
  version: 1;
  sessions: StoredServerSession[];
}

const digestSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const createServerSessionStore = (options: {
  now?: () => Date;
  ttlMs?: number;
  createToken?: () => string;
} = {}): ServerSessionStore => {
  const now = options.now ?? (() => new Date());
  const ttlMs = Math.min(options.ttlMs ?? DEFAULT_SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS);
  const createToken = options.createToken ?? (() => randomBytes(32).toString('base64url'));
  const sessions = new Map<string, StoredServerSession>();

  return {
    async create(userId) {
      const token = createToken();
      if (Buffer.from(token, 'base64url').length < 32) {
        throw new ServerAuthStoreError('Session token generator returned insufficient entropy.');
      }
      const createdAt = now();
      const session: StoredServerSession = {
        tokenDigest: digestSessionToken(token),
        userId,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
      };
      sessions.set(session.tokenDigest, session);
      return { token, expiresAt: session.expiresAt };
    },
    async resolve(token) {
      if (!token) return null;
      const digest = digestSessionToken(token);
      const session = sessions.get(digest);
      if (!session) return null;
      if (new Date(session.expiresAt).getTime() <= now().getTime()) {
        sessions.delete(digest);
        return null;
      }
      return session;
    },
    async revoke(token) {
      if (token) sessions.delete(digestSessionToken(token));
    },
    async revokeUser(userId) {
      for (const [digest, session] of sessions) {
        if (session.userId === userId) sessions.delete(digest);
      }
    },
  };
};

const isStoredSession = (value: unknown): value is StoredServerSession => {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.tokenDigest === 'string' && /^[a-f0-9]{64}$/.test(session.tokenDigest) &&
    typeof session.userId === 'string' && isUuid(session.userId) &&
    typeof session.createdAt === 'string' && Number.isFinite(Date.parse(session.createdAt)) &&
    typeof session.expiresAt === 'string' && Number.isFinite(Date.parse(session.expiresAt));
};

/**
 * Development-only restart-persistent session store. Production must provide a
 * transactional durable adapter through the operational-store contract.
 */
export const createFileServerSessionStore = (options: {
  filePath: string;
  now?: () => Date;
  ttlMs?: number;
  createToken?: () => string;
}): ServerSessionStore => {
  const filePath = path.resolve(options.filePath);
  const now = options.now ?? (() => new Date());
  const ttlMs = Math.min(options.ttlMs ?? DEFAULT_SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS);
  const createToken = options.createToken ?? (() => randomBytes(32).toString('base64url'));

  const readSessions = (): StoredServerSession[] => {
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new ServerAuthStoreError();
    }
    try {
      const parsed = JSON.parse(raw) as StoredServerSessionFile;
      if (parsed?.version !== 1 || !Array.isArray(parsed.sessions) ||
          !parsed.sessions.every(isStoredSession) ||
          new Set(parsed.sessions.map((session) => session.tokenDigest)).size !== parsed.sessions.length) {
        throw new Error('invalid');
      }
      return parsed.sessions;
    } catch {
      throw new ServerAuthStoreError('Authentication session store is malformed or corrupted.');
    }
  };

  const writeSessions = (sessions: StoredServerSession[]) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ version: 1, sessions }, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporaryPath, filePath);
  };

  const mutate = <T>(operation: (sessions: StoredServerSession[]) => T): T => {
    const sessions = readSessions();
    const result = operation(sessions);
    writeSessions(sessions);
    return result;
  };

  return {
    async create(userId) {
      const token = createToken();
      if (Buffer.from(token, 'base64url').length < 32) {
        throw new ServerAuthStoreError('Session token generator returned insufficient entropy.');
      }
      const createdAt = now();
      const session: StoredServerSession = {
        tokenDigest: digestSessionToken(token),
        userId,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
      };
      mutate((sessions) => { sessions.push(session); });
      return { token, expiresAt: session.expiresAt };
    },
    async resolve(token) {
      if (!token) return null;
      const digest = digestSessionToken(token);
      let resolved: StoredServerSession | null = null;
      mutate((sessions) => {
        const index = sessions.findIndex((session) => session.tokenDigest === digest);
        if (index < 0) return;
        if (new Date(sessions[index].expiresAt).getTime() <= now().getTime()) {
          sessions.splice(index, 1);
          return;
        }
        resolved = sessions[index];
      });
      return resolved;
    },
    async revoke(token) {
      if (!token) return;
      const digest = digestSessionToken(token);
      mutate((sessions) => {
        const index = sessions.findIndex((session) => session.tokenDigest === digest);
        if (index >= 0) sessions.splice(index, 1);
      });
    },
    async revokeUser(userId) {
      mutate((sessions) => {
        for (let index = sessions.length - 1; index >= 0; index -= 1) {
          if (sessions[index].userId === userId) sessions.splice(index, 1);
        }
      });
    },
  };
};

interface LoginAttempt {
  count: number;
  windowStartedAt: number;
}

export interface LoginThrottle {
  assertAllowed(key: string): void;
  recordFailure(key: string): void;
  clear(key: string): void;
}

export const createLoginThrottle = (options: {
  now?: () => Date;
  maximumFailures?: number;
  windowMs?: number;
} = {}): LoginThrottle => {
  const now = options.now ?? (() => new Date());
  const maximumFailures = options.maximumFailures ?? 5;
  const windowMs = options.windowMs ?? 10 * 60 * 1000;
  const attempts = new Map<string, LoginAttempt>();
  const current = (key: string) => {
    const attempt = attempts.get(key);
    if (!attempt || now().getTime() - attempt.windowStartedAt >= windowMs) {
      attempts.delete(key);
      return null;
    }
    return attempt;
  };
  return {
    assertAllowed(key) {
      if ((current(key)?.count ?? 0) >= maximumFailures) throw new ServerAuthRateLimitError();
    },
    recordFailure(key) {
      const existing = current(key);
      attempts.set(key, existing
        ? { ...existing, count: existing.count + 1 }
        : { count: 1, windowStartedAt: now().getTime() });
    },
    clear(key) {
      attempts.delete(key);
    },
  };
};

export interface ServerAuthService {
  register(input: { email: string; name: string; password: string }): Promise<{
    user: AuthenticatedServerUser;
    token: string;
    expiresAt: string;
  }>;
  enroll(input: { userId: string; email: string; name: string; password: string }): Promise<{
    user: AuthenticatedServerUser;
    token: string;
    expiresAt: string;
  }>;
  login(input: { email: string; password: string; throttleKey: string }): Promise<{
    user: AuthenticatedServerUser;
    token: string;
    expiresAt: string;
  }>;
  resolveToken(token: string): Promise<AuthenticatedServerUser | null>;
  logout(token: string): Promise<void>;
}

export const createServerAuthService = (dependencies: {
  users: ServerUserStore;
  sessions: ServerSessionStore;
  throttle?: LoginThrottle;
  now?: () => Date;
  createUserId?: () => string;
}): ServerAuthService => {
  const throttle = dependencies.throttle ?? createLoginThrottle();
  const now = dependencies.now ?? (() => new Date());
  const createUserId = dependencies.createUserId ?? randomUUID;

  const createUser = async (input: { id: string; email: string; name: string; password: string }) => {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    if (!email || !name || !isUuid(input.id)) {
      throw new ServerAuthError('AUTH_REGISTRATION_INVALID', 400, 'Invalid account registration.');
    }
    const passwordHash = await hashServerPassword(input.password);
    const stored = await dependencies.users.create({
      id: input.id,
      email,
      name,
      passwordHash,
      createdAt: now().toISOString(),
    });
    const session = await dependencies.sessions.create(stored.id);
    return { user: toPublicUser(stored), ...session };
  };

  return {
    register(input) {
      return createUser({ ...input, id: createUserId() });
    },
    enroll(input) {
      return createUser({ ...input, id: input.userId });
    },
    async login(input) {
      const email = normalizeEmail(input.email);
      const key = `${input.throttleKey}:${email}`;
      throttle.assertAllowed(key);
      const user = await dependencies.users.findByEmail(email);
      if (!user || !(await verifyServerPassword(input.password, user.passwordHash))) {
        throttle.recordFailure(key);
        throw new ServerAuthInvalidCredentialsError();
      }
      throttle.clear(key);
      const session = await dependencies.sessions.create(user.id);
      return { user: toPublicUser(user), ...session };
    },
    async resolveToken(token) {
      const session = await dependencies.sessions.resolve(token);
      if (!session) return null;
      const user = await dependencies.users.findById(session.userId);
      if (!user) {
        await dependencies.sessions.revoke(token);
        return null;
      }
      return toPublicUser(user);
    },
    async logout(token) {
      await dependencies.sessions.revoke(token);
    },
  };
};

export const parseCookieHeader = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, entry) => {
    const separator = entry.indexOf('=');
    if (separator < 1) return cookies;
    const name = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (!name) return cookies;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = '';
    }
    return cookies;
  }, {});
};

export const getSessionTokenFromRequest = (request: IncomingMessage) =>
  parseCookieHeader(request.headers.cookie)[AUTH_SESSION_COOKIE_NAME] ?? '';

const singleForwardedHeader = (value: string | string[] | undefined) => {
  if (Array.isArray(value) || !value || value.includes(',')) return null;
  return value.trim();
};

export const isSecureRequest = (request: IncomingMessage) =>
  Boolean((request.socket as { encrypted?: boolean }).encrypted) ||
  (process.env.TRUST_PROXY === '1' &&
    singleForwardedHeader(request.headers['x-forwarded-proto'])?.toLowerCase() === 'https');

export const serializeSessionCookie = (token: string, options: {
  secure: boolean;
  maxAgeSeconds: number;
}) => [
  `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
  'HttpOnly',
  'SameSite=Lax',
  'Path=/',
  `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
  ...(options.secure ? ['Secure'] : []),
].join('; ');

export const serializeExpiredSessionCookie = (secure: boolean) =>
  serializeSessionCookie('', { secure, maxAgeSeconds: 0 });

export const assertSameOriginRequest = (request: IncomingMessage) => {
  const origin = request.headers.origin;
  const configuredOrigin = process.env.PUBLIC_ORIGIN?.trim();
  const forwardedHost = process.env.TRUST_PROXY === '1'
    ? singleForwardedHeader(request.headers['x-forwarded-host'])
    : null;
  const host = forwardedHost ?? request.headers.host;
  if (!origin || !host) {
    throw new ServerAuthError('AUTH_ORIGIN_REJECTED', 403, 'Request origin is not allowed.');
  }
  try {
    const parsed = new URL(origin);
    if (
      parsed.host !== host ||
      (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') ||
      (process.env.NODE_ENV === 'production' && !isSecureRequest(request)) ||
      (configuredOrigin && parsed.origin !== new URL(configuredOrigin).origin)
    ) {
      throw new Error('mismatch');
    }
  } catch {
    throw new ServerAuthError('AUTH_ORIGIN_REJECTED', 403, 'Request origin is not allowed.');
  }
};

export const assertJsonRequest = (request: IncomingMessage) => {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ServerAuthError('AUTH_JSON_REQUIRED', 415, 'JSON request body required.');
  }
};

export const createDefaultServerAuthService = (): ServerAuthService => {
  const users = createServerUserStore({
    filePath: path.resolve(process.cwd(), '.data', 'auth-users.json'),
  });
  return createServerAuthService({
    users,
    sessions: createFileServerSessionStore({
      filePath: path.resolve(process.cwd(), '.data', 'auth-sessions.json'),
    }),
  });
};
