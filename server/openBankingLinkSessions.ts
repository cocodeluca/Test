import { randomUUID } from 'node:crypto';

export type OpenBankingLinkSessionIntent =
  | 'connect'
  | 'reauthentication'
  | 'transactions-consent';

export interface OpenBankingLinkSession {
  id: string;
  ownerUserId: string;
  providerName: 'plaid';
  countryCode: 'ES';
  institutionId: 'ins_65';
  intent: OpenBankingLinkSessionIntent;
  connectionId: string | null;
  mode: 'create' | 'update';
  createdAt: string;
  expiresAt: string;
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
    connectionId?: string | null;
    mode?: 'create' | 'update';
    intent?: OpenBankingLinkSessionIntent;
  }): OpenBankingLinkSession;
  consume(sessionId: string, ownerUserId: string): OpenBankingLinkSession;
}

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
    create({ ownerUserId, connectionId = null, mode, intent }) {
      const createdAt = now();
      const resolvedMode = mode ?? (connectionId ? 'update' : 'create');
      const session: OpenBankingLinkSession = {
        id: createId(),
        ownerUserId,
        providerName: 'plaid',
        countryCode: 'ES',
        institutionId: 'ins_65',
        intent: intent ?? (resolvedMode === 'update' ? 'reauthentication' : 'connect'),
        connectionId,
        mode: resolvedMode,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
      };
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
