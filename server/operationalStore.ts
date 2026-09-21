import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PlaidEnvironment } from '../src/common/types';
import {
  createFileOpenBankingLinkSessionStore,
  type OpenBankingLinkSessionIntent,
  type OpenBankingLinkSessionStore,
} from './openBankingLinkSessions';
import {
  createOpenBankingConnectionStore,
  type OpenBankingConnectionStore,
} from './openBankingStore';
import { readPlaidPilotConfiguration } from './openBankingPolicy';
import {
  createFileServerSessionStore,
  createServerUserStore,
  type ServerSessionStore,
  type ServerUserStore,
} from './serverAuth';

export type OperationalStoreKind = 'memory' | 'development-json' | 'production-durable';

export interface OperationalStoreCapabilities {
  kind: OperationalStoreKind;
  persistsAcrossRestart: boolean;
  transactionalWrites: boolean;
  ownerScoped: boolean;
  environmentScoped: boolean;
  compareAndSwap: boolean;
  expiringOneTimeRecords: boolean;
  encryptedProviderSecrets: boolean;
}

export interface OAuthRecoveryRecord {
  id: string;
  ownerUserId: string;
  providerName: 'plaid';
  environment: PlaidEnvironment;
  intent: OpenBankingLinkSessionIntent;
  connectionId: string | null;
  linkSessionId: string;
  linkToken: string;
  redirectUri: string;
  providerOAuthStateId: string | null;
  receivedRedirectUri: string | null;
  callbackReceivedAt: string | null;
  completedConnectionId: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface OAuthRecoveryStore {
  save(record: OAuthRecoveryRecord): void;
  loadOwned(input: {
    id: string;
    ownerUserId: string;
    environment: PlaidEnvironment;
  }): OAuthRecoveryRecord | null;
  loadByLinkSessionOwned(input: {
    linkSessionId: string;
    ownerUserId: string;
    environment: PlaidEnvironment;
  }): OAuthRecoveryRecord | null;
  recordCallbackOwned(input: {
    id: string;
    ownerUserId: string;
    environment: PlaidEnvironment;
    providerOAuthStateId: string;
    receivedRedirectUri: string;
    now: Date;
  }): OAuthRecoveryRecord | null;
  consumeOwned(input: {
    id: string;
    ownerUserId: string;
    environment: PlaidEnvironment;
    completedConnectionId: string | null;
    now: Date;
  }): OAuthRecoveryRecord | null;
  listRecoverableOwned(input: {
    ownerUserId: string;
    environment: PlaidEnvironment;
    now: Date;
  }): OAuthRecoveryRecord[];
  listOwned(input: {
    ownerUserId: string;
    environment: PlaidEnvironment;
  }): OAuthRecoveryRecord[];
}

export interface OperationalStores {
  capabilities: OperationalStoreCapabilities;
  users: ServerUserStore;
  sessions: ServerSessionStore;
  linkSessions: OpenBankingLinkSessionStore;
  providerConnections: OpenBankingConnectionStore;
  oauthRecovery: OAuthRecoveryStore;
}

export class OperationalStoreConfigurationError extends Error {
  readonly code = 'OPERATIONAL_STORE_CONFIGURATION_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'OperationalStoreConfigurationError';
  }
}

const isOAuthRecord = (value: unknown): value is OAuthRecoveryRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.ownerUserId === 'string' &&
    record.providerName === 'plaid' &&
    (record.environment === 'sandbox' || record.environment === 'production') &&
    (record.intent === 'connect' || record.intent === 'reauthentication' ||
      record.intent === 'transactions-consent') &&
    (record.connectionId === null || typeof record.connectionId === 'string') &&
    typeof record.linkSessionId === 'string' && record.linkSessionId.length > 0 &&
    typeof record.linkToken === 'string' && record.linkToken.length > 0 &&
    typeof record.redirectUri === 'string' && record.redirectUri.length > 0 &&
    (record.providerOAuthStateId === null || typeof record.providerOAuthStateId === 'string') &&
    (record.receivedRedirectUri === null || typeof record.receivedRedirectUri === 'string') &&
    (record.callbackReceivedAt === null ||
      (typeof record.callbackReceivedAt === 'string' &&
        Number.isFinite(Date.parse(record.callbackReceivedAt)))) &&
    (record.completedConnectionId === null || typeof record.completedConnectionId === 'string') &&
    typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)) &&
    typeof record.expiresAt === 'string' && Number.isFinite(Date.parse(record.expiresAt)) &&
    (record.consumedAt === null ||
      (typeof record.consumedAt === 'string' && Number.isFinite(Date.parse(record.consumedAt))));
};

export const createMemoryOAuthRecoveryStore = (): OAuthRecoveryStore => {
  const records = new Map<string, OAuthRecoveryRecord>();
  return {
    save(record) {
      if (!isOAuthRecord(record)) {
        throw new OperationalStoreConfigurationError('OAuth recovery record is invalid.');
      }
      records.set(record.id, { ...record });
    },
    loadOwned(input) {
      const record = records.get(input.id);
      return record?.ownerUserId === input.ownerUserId &&
        record.environment === input.environment ? { ...record } : null;
    },
    loadByLinkSessionOwned(input) {
      const matching = [...records.values()].filter((candidate) =>
        candidate.linkSessionId === input.linkSessionId &&
        candidate.ownerUserId === input.ownerUserId &&
        candidate.environment === input.environment
      );
      const record = matching.find((candidate) => candidate.consumedAt === null) ?? matching[0];
      return record ? { ...record } : null;
    },
    recordCallbackOwned(input) {
      const record = records.get(input.id);
      if (!record || record.ownerUserId !== input.ownerUserId ||
          record.environment !== input.environment || record.consumedAt !== null ||
          Date.parse(record.expiresAt) <= input.now.getTime() ||
          (record.providerOAuthStateId !== null &&
            record.providerOAuthStateId !== input.providerOAuthStateId) ||
          (record.receivedRedirectUri !== null &&
            record.receivedRedirectUri !== input.receivedRedirectUri)) return null;
      const updated = {
        ...record,
        providerOAuthStateId: input.providerOAuthStateId,
        receivedRedirectUri: input.receivedRedirectUri,
        callbackReceivedAt: record.callbackReceivedAt ?? input.now.toISOString(),
      };
      records.set(updated.id, updated);
      return { ...updated };
    },
    consumeOwned(input) {
      const record = records.get(input.id);
      if (!record || record.ownerUserId !== input.ownerUserId ||
          record.environment !== input.environment || record.consumedAt !== null ||
          Date.parse(record.expiresAt) <= input.now.getTime()) return null;
      const consumed = {
        ...record,
        consumedAt: input.now.toISOString(),
        completedConnectionId: input.completedConnectionId,
      };
      records.set(consumed.id, consumed);
      return { ...consumed };
    },
    listRecoverableOwned(input) {
      return [...records.values()].filter((record) =>
        record.ownerUserId === input.ownerUserId && record.environment === input.environment &&
        record.consumedAt === null && Date.parse(record.expiresAt) > input.now.getTime()
      ).map((record) => ({ ...record }));
    },
    listOwned(input) {
      return [...records.values()].filter((record) =>
        record.ownerUserId === input.ownerUserId && record.environment === input.environment
      ).map((record) => ({ ...record }));
    },
  };
};

export const createFileOAuthRecoveryStore = (filePathInput: string): OAuthRecoveryStore => {
  const filePath = path.resolve(filePathInput);
  const readRecords = (): OAuthRecoveryRecord[] => {
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new OperationalStoreConfigurationError('OAuth recovery store is unavailable.');
    }
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; records?: unknown };
      if (parsed.version !== 1 || !Array.isArray(parsed.records) ||
          !parsed.records.every(isOAuthRecord)) throw new Error('invalid');
      return parsed.records;
    } catch {
      throw new OperationalStoreConfigurationError('OAuth recovery store is corrupted.');
    }
  };
  const writeRecords = (records: OAuthRecoveryRecord[]) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ version: 1, records }, null, 2), {
      encoding: 'utf8', mode: 0o600,
    });
    renameSync(temporaryPath, filePath);
  };
  return {
    save(record) {
      if (!isOAuthRecord(record)) {
        throw new OperationalStoreConfigurationError('OAuth recovery record is invalid.');
      }
      const records = readRecords();
      writeRecords([...records.filter((candidate) => candidate.id !== record.id), record]);
    },
    loadOwned(input) {
      return readRecords().find((record) =>
        record.id === input.id && record.ownerUserId === input.ownerUserId &&
        record.environment === input.environment
      ) ?? null;
    },
    loadByLinkSessionOwned(input) {
      const matching = readRecords().filter((record) =>
        record.linkSessionId === input.linkSessionId &&
        record.ownerUserId === input.ownerUserId &&
        record.environment === input.environment
      );
      return matching.find((record) => record.consumedAt === null) ?? matching[0] ?? null;
    },
    recordCallbackOwned(input) {
      const records = readRecords();
      const index = records.findIndex((record) =>
        record.id === input.id && record.ownerUserId === input.ownerUserId &&
        record.environment === input.environment && record.consumedAt === null
      );
      if (index < 0 || Date.parse(records[index].expiresAt) <= input.now.getTime()) return null;
      const existing = records[index];
      if ((existing.providerOAuthStateId &&
           existing.providerOAuthStateId !== input.providerOAuthStateId) ||
          (existing.receivedRedirectUri &&
           existing.receivedRedirectUri !== input.receivedRedirectUri)) return null;
      const updated = {
        ...existing,
        providerOAuthStateId: input.providerOAuthStateId,
        receivedRedirectUri: input.receivedRedirectUri,
        callbackReceivedAt: existing.callbackReceivedAt ?? input.now.toISOString(),
      };
      records[index] = updated;
      writeRecords(records);
      return updated;
    },
    consumeOwned(input) {
      const records = readRecords();
      const index = records.findIndex((record) =>
        record.id === input.id && record.ownerUserId === input.ownerUserId &&
        record.environment === input.environment && record.consumedAt === null
      );
      if (index < 0 || Date.parse(records[index].expiresAt) <= input.now.getTime()) return null;
      const consumed = {
        ...records[index],
        consumedAt: input.now.toISOString(),
        completedConnectionId: input.completedConnectionId,
      };
      records[index] = consumed;
      writeRecords(records);
      return consumed;
    },
    listRecoverableOwned(input) {
      return readRecords().filter((record) =>
        record.ownerUserId === input.ownerUserId && record.environment === input.environment &&
        record.consumedAt === null && Date.parse(record.expiresAt) > input.now.getTime()
      );
    },
    listOwned(input) {
      return readRecords().filter((record) =>
        record.ownerUserId === input.ownerUserId && record.environment === input.environment
      );
    },
  };
};

export const DEVELOPMENT_STORE_CAPABILITIES: OperationalStoreCapabilities = Object.freeze({
  kind: 'development-json',
  persistsAcrossRestart: true,
  transactionalWrites: false,
  ownerScoped: true,
  environmentScoped: true,
  compareAndSwap: true,
  expiringOneTimeRecords: true,
  encryptedProviderSecrets: true,
});

export const createDevelopmentOperationalStores = (options: {
  dataDirectory?: string;
  environment?: NodeJS.ProcessEnv;
} = {}): OperationalStores => {
  const environment = options.environment ?? process.env;
  const dataDirectory = path.resolve(options.dataDirectory ?? path.join(process.cwd(), '.data'));
  const plaidEnvironment = readPlaidPilotConfiguration(environment).environment;
  return {
    capabilities: DEVELOPMENT_STORE_CAPABILITIES,
    users: createServerUserStore({ filePath: path.join(dataDirectory, 'auth-users.json') }),
    sessions: createFileServerSessionStore({ filePath: path.join(dataDirectory, 'auth-sessions.json') }),
    linkSessions: createFileOpenBankingLinkSessionStore({
      filePath: path.join(dataDirectory, 'open-banking-link-sessions.json'),
    }),
    providerConnections: createOpenBankingConnectionStore({
      filePath: path.join(dataDirectory, 'open-banking-connections.json'),
      encodedMasterKey: environment.OPEN_BANKING_VAULT_KEY,
      expectedEnvironment: plaidEnvironment,
    }),
    oauthRecovery: createFileOAuthRecoveryStore(
      path.join(dataDirectory, 'open-banking-oauth-recovery.json')
    ),
  };
};

export const assertProductionOperationalStores = (
  stores: OperationalStores
): OperationalStores => {
  const capabilities = stores?.capabilities;
  if (
    !capabilities || capabilities.kind !== 'production-durable' ||
    !capabilities.persistsAcrossRestart || !capabilities.transactionalWrites ||
    !capabilities.ownerScoped || !capabilities.environmentScoped ||
    !capabilities.compareAndSwap || !capabilities.expiringOneTimeRecords ||
    !capabilities.encryptedProviderSecrets
  ) {
    throw new OperationalStoreConfigurationError(
      'Production requires a durable transactional operational-store adapter; memory and JSON adapters are forbidden.'
    );
  }
  if (!stores.users || !stores.sessions || !stores.linkSessions ||
      !stores.providerConnections || !stores.oauthRecovery) {
    throw new OperationalStoreConfigurationError(
      'Production operational-store adapter does not implement the complete contract.'
    );
  }
  return stores;
};

export type ProductionOperationalStoreFactory = (input: {
  environment: Readonly<NodeJS.ProcessEnv>;
}) => Promise<OperationalStores> | OperationalStores;
