import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PlaidEnvironment } from '../src/common/types';
import {
  createFileOpenBankingLinkSessionStore,
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
  connectionId: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface OAuthRecoveryStore {
  save(record: OAuthRecoveryRecord): void;
  consumeOwned(input: {
    id: string;
    ownerUserId: string;
    environment: PlaidEnvironment;
    now: Date;
  }): OAuthRecoveryRecord | null;
  listRecoverableOwned(input: {
    ownerUserId: string;
    environment: PlaidEnvironment;
    now: Date;
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
    (record.connectionId === null || typeof record.connectionId === 'string') &&
    typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)) &&
    typeof record.expiresAt === 'string' && Number.isFinite(Date.parse(record.expiresAt)) &&
    (record.consumedAt === null ||
      (typeof record.consumedAt === 'string' && Number.isFinite(Date.parse(record.consumedAt))));
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
    consumeOwned(input) {
      const records = readRecords();
      const index = records.findIndex((record) =>
        record.id === input.id && record.ownerUserId === input.ownerUserId &&
        record.environment === input.environment && record.consumedAt === null
      );
      if (index < 0 || Date.parse(records[index].expiresAt) <= input.now.getTime()) return null;
      const consumed = { ...records[index], consumedAt: input.now.toISOString() };
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
