import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PlaidEnvironment } from '../src/common/types';

export type OpenBankingLinkSessionIntent =
  | 'connect'
  | 'reauthentication'
  | 'transactions-consent';

export interface OpenBankingLinkSession {
  readonly id: string;
  readonly ownerUserId: string;
  readonly providerName: 'plaid';
  readonly environment: PlaidEnvironment;
  readonly countryCode: 'ES';
  readonly institutionId: 'ins_65';
  readonly intent: OpenBankingLinkSessionIntent;
  readonly connectionId: string | null;
  readonly mode: 'create' | 'update';
  readonly createdAt: string;
  readonly expiresAt: string;
}

export class OpenBankingLinkSessionError extends Error {
  readonly code = 'OPEN_BANKING_LINK_SESSION_INVALID';

  constructor(message = 'The bank connection session is invalid or expired.') {
    super(message);
    this.name = 'OpenBankingLinkSessionError';
  }
}

export interface OpenBankingLinkSessionStore {
  create(input: {
    ownerUserId: string;
    environment: PlaidEnvironment;
    connectionId?: string | null;
    mode?: 'create' | 'update';
    intent?: OpenBankingLinkSessionIntent;
  }): OpenBankingLinkSession;
  consume(sessionId: string, ownerUserId: string): OpenBankingLinkSession;
}

const isLinkSession = (value: unknown): value is OpenBankingLinkSession => {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.id === 'string' &&
    typeof session.ownerUserId === 'string' &&
    session.providerName === 'plaid' &&
    (session.environment === 'sandbox' || session.environment === 'production') &&
    session.countryCode === 'ES' && session.institutionId === 'ins_65' &&
    (session.intent === 'connect' || session.intent === 'reauthentication' ||
      session.intent === 'transactions-consent') &&
    (session.connectionId === null || typeof session.connectionId === 'string') &&
    (session.mode === 'create' || session.mode === 'update') &&
    typeof session.createdAt === 'string' && Number.isFinite(Date.parse(session.createdAt)) &&
    typeof session.expiresAt === 'string' && Number.isFinite(Date.parse(session.expiresAt));
};

const buildLinkSession = (
  input: {
    ownerUserId: string;
    environment: PlaidEnvironment;
    connectionId?: string | null;
    mode?: 'create' | 'update';
    intent?: OpenBankingLinkSessionIntent;
  },
  now: () => Date,
  ttlMs: number,
  createId: () => string
): OpenBankingLinkSession => {
  const createdAt = now();
  const resolvedMode = input.mode ?? (input.connectionId ? 'update' : 'create');
  return Object.freeze({
    id: createId(),
    ownerUserId: input.ownerUserId,
    providerName: 'plaid',
    environment: input.environment,
    countryCode: 'ES',
    institutionId: 'ins_65',
    intent: input.intent ?? (resolvedMode === 'update' ? 'reauthentication' : 'connect'),
    connectionId: input.connectionId ?? null,
    mode: resolvedMode,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
  });
};

export const createOpenBankingLinkSessionStore = (options: {
  ttlMs?: number;
  now?: () => Date;
  createId?: () => string;
} = {}): OpenBankingLinkSessionStore => {
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const sessions = new Map<string, OpenBankingLinkSession>();

  return {
    create({ ownerUserId, environment, connectionId = null, mode, intent }) {
      const session = buildLinkSession(
        { ownerUserId, environment, connectionId, mode, intent },
        now,
        ttlMs,
        createId
      );
      sessions.set(session.id, session);
      return session;
    },

    consume(sessionId, ownerUserId) {
      const session = sessions.get(sessionId);
      if (!session || session.ownerUserId !== ownerUserId) {
        throw new OpenBankingLinkSessionError();
      }
      sessions.delete(sessionId);
      if (new Date(session.expiresAt).getTime() <= now().getTime()) {
        throw new OpenBankingLinkSessionError();
      }
      return session;
    },
  };
};

/** Development-only atomic JSON adapter. */
export const createFileOpenBankingLinkSessionStore = (options: {
  filePath: string;
  ttlMs?: number;
  now?: () => Date;
  createId?: () => string;
}): OpenBankingLinkSessionStore => {
  const filePath = path.resolve(options.filePath);
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;

  const readSessions = (): OpenBankingLinkSession[] => {
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new OpenBankingLinkSessionError();
    }
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; sessions?: unknown };
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions) ||
          !parsed.sessions.every(isLinkSession) ||
          new Set(parsed.sessions.map((session) => session.id)).size !== parsed.sessions.length) {
        throw new Error('invalid');
      }
      return parsed.sessions;
    } catch {
      throw new OpenBankingLinkSessionError();
    }
  };

  const writeSessions = (sessions: OpenBankingLinkSession[]) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ version: 1, sessions }, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporaryPath, filePath);
  };

  return {
    create(input) {
      const sessions = readSessions();
      const session = buildLinkSession(input, now, ttlMs, createId);
      sessions.push(session);
      writeSessions(sessions);
      return session;
    },
    consume(sessionId, ownerUserId) {
      const sessions = readSessions();
      const index = sessions.findIndex((session) => session.id === sessionId);
      if (index < 0 || sessions[index].ownerUserId !== ownerUserId) {
        throw new OpenBankingLinkSessionError();
      }
      const [session] = sessions.splice(index, 1);
      // Consumption is persisted before the caller can perform provider work.
      writeSessions(sessions);
      if (new Date(session.expiresAt).getTime() <= now().getTime()) {
        throw new OpenBankingLinkSessionError();
      }
      return session;
    },
  };
};
