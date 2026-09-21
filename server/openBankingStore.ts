import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OpenBankingProviderName, PlaidEnvironment } from '../src/common/types';
import { readPlaidPilotConfiguration } from './openBankingPolicy';

export interface StoredOpenBankingConnection {
  id: string;
  userId: string;
  providerName: OpenBankingProviderName;
  environment: PlaidEnvironment;
  institutionName: string;
  institutionId: string;
  accessToken: string | null;
  itemId: string | null;
  providerItemStatus: 'active' | 'disconnect_requested' | 'provider_revoked' | 'disconnected';
  disconnectedAt: string | null;
  revokedItems: Array<{
    itemId: string;
    revokedAt: string;
  }>;
  selectedAccountIds: string[];
  transactionSyncCursor: string | null;
  consentExpirationTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EncryptedSecret {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface PersistedOpenBankingConnection extends Omit<StoredOpenBankingConnection, 'accessToken'> {
  encryptedAccessToken: EncryptedSecret | null;
}

interface LegacyPersistedOpenBankingConnection extends Omit<PersistedOpenBankingConnection, 'environment' | 'transactionSyncCursor'> {
  environment?: never;
  transactionSyncCursor?: never;
}

export interface OpenBankingRecordScope {
  userId: string;
  id: string;
  providerName: OpenBankingProviderName;
  environment: PlaidEnvironment;
}

export interface OpenBankingConnectionStore {
  list(providerName: OpenBankingProviderName, environment: PlaidEnvironment): Promise<StoredOpenBankingConnection[]>;
  listOwned(input: {
    userId: string;
    providerName: OpenBankingProviderName;
    environment: PlaidEnvironment;
  }): Promise<StoredOpenBankingConnection[]>;
  loadOwned(scope: OpenBankingRecordScope): Promise<StoredOpenBankingConnection | null>;
  save(connection: StoredOpenBankingConnection): Promise<StoredOpenBankingConnection>;
  updateOwned(
    scope: OpenBankingRecordScope,
    patch: Partial<Omit<StoredOpenBankingConnection, 'id' | 'userId' | 'providerName' | 'environment' | 'accessToken' | 'transactionSyncCursor'>>
  ): Promise<StoredOpenBankingConnection>;
  advanceTransactionCursorOwned(
    scope: OpenBankingRecordScope,
    input: {
      expectedItemId: string;
      expectedCursor: string | null;
      nextCursor: string | null;
      updatedAt: string;
    }
  ): Promise<StoredOpenBankingConnection>;
  beginDisconnectOwned(
    scope: OpenBankingRecordScope,
    input: { requestedAt: string; expectedItemId: string }
  ): Promise<StoredOpenBankingConnection>;
  markProviderRevokedOwned(
    scope: OpenBankingRecordScope,
    input: { revokedAt: string; expectedItemId: string }
  ): Promise<StoredOpenBankingConnection>;
  finalizeDisconnectOwned(
    scope: OpenBankingRecordScope,
    input: { revokedAt: string; expectedItemId: string }
  ): Promise<StoredOpenBankingConnection>;
  markDisconnectedOwned(
    scope: OpenBankingRecordScope,
    input: { revokedAt: string; expectedItemId: string }
  ): Promise<StoredOpenBankingConnection>;
  deleteOwned(scope: OpenBankingRecordScope): Promise<boolean>;
}

export class OpenBankingVaultError extends Error {
  readonly code = 'OPEN_BANKING_VAULT_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'OpenBankingVaultError';
  }
}

export class OpenBankingConnectionOwnershipError extends Error {
  readonly code = 'OPEN_BANKING_CONNECTION_NOT_FOUND';

  constructor() {
    super('Open banking connection not found for authenticated owner.');
    this.name = 'OpenBankingConnectionOwnershipError';
  }
}

export class OpenBankingEnvironmentMismatchError extends Error {
  readonly code = 'OPEN_BANKING_ENVIRONMENT_MISMATCH';

  constructor() {
    super('Open banking provider environment does not match the active configuration.');
    this.name = 'OpenBankingEnvironmentMismatchError';
  }
}

export class OpenBankingLegacyEnvironmentError extends Error {
  readonly code = 'OPEN_BANKING_LEGACY_ENVIRONMENT_UNKNOWN';

  constructor() {
    super('Legacy open banking provider environment cannot be established safely.');
    this.name = 'OpenBankingLegacyEnvironmentError';
  }
}

export class OpenBankingCursorStateError extends Error {
  readonly code = 'OPEN_BANKING_CURSOR_STATE_INVALID';

  constructor() {
    super('Open banking transaction cursor state is unavailable or corrupt.');
    this.name = 'OpenBankingCursorStateError';
  }
}

const parseMasterKey = (encodedKey: string | undefined): Buffer => {
  const normalizedKey = encodedKey?.trim();
  if (!normalizedKey) {
    throw new OpenBankingVaultError('OPEN_BANKING_VAULT_KEY is required.');
  }

  if (!/^[A-Za-z0-9+/]{43}=$/.test(normalizedKey)) {
    throw new OpenBankingVaultError(
      'OPEN_BANKING_VAULT_KEY must be a base64-encoded 32-byte key.'
    );
  }
  const key = Buffer.from(normalizedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== normalizedKey) {
    throw new OpenBankingVaultError(
      'OPEN_BANKING_VAULT_KEY must be a base64-encoded 32-byte key.'
    );
  }
  return key;
};

const encryptSecret = (plaintext: string, key: Buffer, associatedData: string): EncryptedSecret => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
};

const decryptSecret = (secret: EncryptedSecret, key: Buffer, associatedData: string): string => {
  if (
    secret?.version !== 1 ||
    secret.algorithm !== 'aes-256-gcm' ||
    !secret.iv ||
    !secret.authTag ||
    !secret.ciphertext
  ) {
    throw new OpenBankingVaultError('Encrypted access token envelope is invalid.');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(secret.iv, 'base64')
    );
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new OpenBankingVaultError('Encrypted access token authentication failed.');
  }
};

const isPersistedRecordShape = (
  value: unknown
): value is PersistedOpenBankingConnection | LegacyPersistedOpenBankingConnection => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.providerName === 'string' &&
    (record.environment === undefined ||
      record.environment === 'sandbox' ||
      record.environment === 'production') &&
    typeof record.institutionName === 'string' &&
    typeof record.institutionId === 'string' &&
    (typeof record.itemId === 'string' || record.itemId === null) &&
    (record.providerItemStatus === undefined ||
      record.providerItemStatus === 'active' ||
      record.providerItemStatus === 'disconnect_requested' ||
      record.providerItemStatus === 'provider_revoked' ||
      record.providerItemStatus === 'disconnected') &&
    (record.disconnectedAt === undefined ||
      record.disconnectedAt === null ||
      typeof record.disconnectedAt === 'string') &&
    (record.revokedItems === undefined ||
      (Array.isArray(record.revokedItems) &&
        record.revokedItems.every((item) =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).itemId === 'string' &&
          typeof (item as Record<string, unknown>).revokedAt === 'string'
        ))) &&
    Array.isArray(record.selectedAccountIds) &&
    record.selectedAccountIds.every((id) => typeof id === 'string') &&
    (record.transactionSyncCursor === undefined ||
      record.transactionSyncCursor === null ||
      typeof record.transactionSyncCursor === 'string') &&
    (record.consentExpirationTime === undefined ||
      record.consentExpirationTime === null ||
      typeof record.consentExpirationTime === 'string') &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.encryptedAccessToken === null ||
      typeof record.encryptedAccessToken === 'object') &&
    (record.encryptedAccessToken === null
      ? record.itemId === null && record.providerItemStatus === 'disconnected'
      : typeof record.itemId === 'string' &&
        (record.providerItemStatus === undefined ||
          record.providerItemStatus === 'active' ||
          record.providerItemStatus === 'disconnect_requested' ||
          record.providerItemStatus === 'provider_revoked')) &&
    !('accessToken' in record)
  );
};

const isPersistedRecord = (
  record: PersistedOpenBankingConnection | LegacyPersistedOpenBankingConnection
): record is PersistedOpenBankingConnection =>
  record.environment === 'sandbox' || record.environment === 'production';

const buildAssociatedData = (
  record: Pick<
    StoredOpenBankingConnection,
    'id' | 'userId' | 'providerName' | 'environment' | 'institutionId' | 'itemId'
  >
) => JSON.stringify({
  id: record.id,
  userId: record.userId,
  providerName: record.providerName,
  environment: record.environment,
  institutionId: record.institutionId,
  itemId: record.itemId,
});

const buildLegacyAssociatedData = (
  record: Pick<
    StoredOpenBankingConnection,
    'id' | 'userId' | 'providerName' | 'institutionId' | 'itemId'
  >
) => JSON.stringify({
  id: record.id,
  userId: record.userId,
  providerName: record.providerName,
  institutionId: record.institutionId,
  itemId: record.itemId,
});

export const createOpenBankingConnectionStore = (options: {
  filePath: string;
  encodedMasterKey: string | undefined;
  expectedEnvironment: PlaidEnvironment;
}): OpenBankingConnectionStore => {
  const key = parseMasterKey(options.encodedMasterKey);
  const filePath = path.resolve(options.filePath);
  let writeQueue: Promise<void> = Promise.resolve();

  const readPersistedRecords = async (): Promise<PersistedOpenBankingConnection[]> => {
    let fileContent: string;
    try {
      fileContent = await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new OpenBankingVaultError('Unable to read the open banking vault.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      throw new OpenBankingVaultError('Open banking vault JSON is corrupted.');
    }
    if (!Array.isArray(parsed)) {
      throw new OpenBankingVaultError('Open banking vault structure is invalid.');
    }
    for (const value of parsed) {
      if (
        value &&
        typeof value === 'object' &&
        'transactionSyncCursor' in value &&
        (value as Record<string, unknown>).transactionSyncCursor !== null &&
        typeof (value as Record<string, unknown>).transactionSyncCursor !== 'string'
      ) {
        throw new OpenBankingCursorStateError();
      }
      if (
        value &&
        typeof value === 'object' &&
        ((('environment' in value) && !('transactionSyncCursor' in value)) ||
          (!('environment' in value) && ('transactionSyncCursor' in value)))
      ) {
        if ('environment' in value) throw new OpenBankingCursorStateError();
        throw new OpenBankingLegacyEnvironmentError();
      }
    }
    if (!parsed.every(isPersistedRecordShape)) {
      throw new OpenBankingVaultError('Open banking vault structure is invalid.');
    }

    const records = parsed as Array<
      PersistedOpenBankingConnection | LegacyPersistedOpenBankingConnection
    >;
    if (records.every(isPersistedRecord)) return records;
    if (
      options.expectedEnvironment !== 'sandbox' ||
      records.some((record) =>
        (isPersistedRecord(record) && record.environment !== 'sandbox') ||
        (!isPersistedRecord(record) && record.providerName !== 'plaid')
      )
    ) {
      throw new OpenBankingLegacyEnvironmentError();
    }

    const migrated = records.map((record): PersistedOpenBankingConnection => {
      if (isPersistedRecord(record)) return record;
      const { encryptedAccessToken, ...legacyMetadata } = record;
      const accessToken = encryptedAccessToken
        ? decryptSecret(encryptedAccessToken, key, buildLegacyAssociatedData(legacyMetadata))
        : null;
      return encryptRecord({
        ...legacyMetadata,
        environment: 'sandbox',
        transactionSyncCursor: null,
        providerItemStatus: record.providerItemStatus ??
          (record.encryptedAccessToken ? 'active' : 'disconnected'),
        disconnectedAt: record.disconnectedAt ?? null,
        revokedItems: record.revokedItems ?? [],
        accessToken,
      });
    });
    await writePersistedRecords(migrated);
    return migrated;
  };

  const decryptRecord = (
    record: PersistedOpenBankingConnection
  ): StoredOpenBankingConnection => {
    const { encryptedAccessToken, ...metadata } = record;
    const providerItemStatus = record.providerItemStatus ??
      (record.encryptedAccessToken ? 'active' : 'disconnected');
    return {
      ...metadata,
      providerItemStatus,
      disconnectedAt: record.disconnectedAt ?? null,
      revokedItems: record.revokedItems ?? [],
      accessToken: encryptedAccessToken
        ? decryptSecret(encryptedAccessToken, key, buildAssociatedData(metadata))
        : null,
    };
  };

  const encryptRecord = (
    record: StoredOpenBankingConnection
  ): PersistedOpenBankingConnection => {
    const { accessToken, ...metadata } = record;
    return {
      ...metadata,
      encryptedAccessToken: accessToken
        ? encryptSecret(accessToken, key, buildAssociatedData(metadata))
        : null,
    };
  };

  const writePersistedRecords = async (records: PersistedOpenBankingConnection[]) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(records, null, 2), {
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

  const assertRecordScope = (
    record: PersistedOpenBankingConnection,
    scope: OpenBankingRecordScope
  ) => {
    if (
      record.providerName !== scope.providerName ||
      record.environment !== scope.environment ||
      record.environment !== options.expectedEnvironment
    ) {
      throw new OpenBankingEnvironmentMismatchError();
    }
  };

  return {
    async list(providerName, environment) {
      if (environment !== options.expectedEnvironment) {
        throw new OpenBankingEnvironmentMismatchError();
      }
      return (await readPersistedRecords())
        .filter((record) =>
          record.providerName === providerName && record.environment === environment
        )
        .map(decryptRecord);
    },

    async listOwned({ userId, providerName, environment }) {
      if (environment !== options.expectedEnvironment) {
        throw new OpenBankingEnvironmentMismatchError();
      }
      return (await readPersistedRecords())
        .filter((record) => record.userId === userId &&
          record.providerName === providerName && record.environment === environment)
        .map(decryptRecord);
    },

    async loadOwned(scope) {
      const record = (await readPersistedRecords()).find(
        (candidate) => candidate.id === scope.id && candidate.userId === scope.userId
      );
      if (!record) return null;
      assertRecordScope(record, scope);
      return decryptRecord(record);
    },

    async save(connection) {
      return withWriteLock(async () => {
        if (connection.environment !== options.expectedEnvironment) {
          throw new OpenBankingEnvironmentMismatchError();
        }
        if (
          connection.transactionSyncCursor !== null &&
          typeof connection.transactionSyncCursor !== 'string'
        ) {
          throw new OpenBankingCursorStateError();
        }
        if (
          (connection.providerItemStatus !== 'disconnected' &&
            (!connection.accessToken || !connection.itemId)) ||
          (connection.providerItemStatus === 'disconnected' &&
            (connection.accessToken !== null || connection.itemId !== null))
        ) {
          throw new OpenBankingVaultError('Open banking provider Item lifecycle is invalid.');
        }
        const records = await readPersistedRecords();
        const encrypted = encryptRecord(connection);
        const nextRecords = records.some((record) => record.id === connection.id)
          ? records.map((record) => {
              if (record.id !== connection.id) return record;
              if (record.userId !== connection.userId) {
                throw new OpenBankingConnectionOwnershipError();
              }
              if (
                record.providerName !== connection.providerName ||
                record.environment !== connection.environment
              ) {
                throw new OpenBankingEnvironmentMismatchError();
              }
              return encrypted;
            })
          : [...records, encrypted];
        await writePersistedRecords(nextRecords);
        return connection;
      });
    },

    async updateOwned(scope, patch) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === scope.id && candidate.userId === scope.userId
        );
        if (!record) throw new OpenBankingConnectionOwnershipError();
        assertRecordScope(record, scope);
        const existing = decryptRecord(record);
        const updated: StoredOpenBankingConnection = {
          ...existing,
          ...patch,
          id: scope.id,
          userId: scope.userId,
          providerName: scope.providerName,
          environment: scope.environment,
          accessToken: existing.accessToken,
          transactionSyncCursor: existing.transactionSyncCursor,
          updatedAt: patch.updatedAt ?? new Date().toISOString(),
        };
        await writePersistedRecords(
          records.map((candidate) => candidate === record ? encryptRecord(updated) : candidate)
        );
        return updated;
      });
    },

    async advanceTransactionCursorOwned(scope, input) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === scope.id && candidate.userId === scope.userId
        );
        if (!record) throw new OpenBankingConnectionOwnershipError();
        assertRecordScope(record, scope);
        const existing = decryptRecord(record);
        if (
          existing.providerItemStatus !== 'active' ||
          existing.itemId !== input.expectedItemId ||
          existing.transactionSyncCursor !== input.expectedCursor
        ) {
          throw new OpenBankingCursorStateError();
        }
        const updated: StoredOpenBankingConnection = {
          ...existing,
          transactionSyncCursor: input.nextCursor,
          updatedAt: input.updatedAt,
        };
        await writePersistedRecords(
          records.map((candidate) => candidate === record ? encryptRecord(updated) : candidate)
        );
        return updated;
      });
    },

    async beginDisconnectOwned(scope, input) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === scope.id && candidate.userId === scope.userId
        );
        if (!record) throw new OpenBankingConnectionOwnershipError();
        assertRecordScope(record, scope);
        const existing = decryptRecord(record);
        if (existing.providerItemStatus === 'disconnected' ||
            existing.providerItemStatus === 'provider_revoked') return existing;
        if (!existing.itemId || existing.itemId !== input.expectedItemId || !existing.accessToken) {
          throw new OpenBankingVaultError('Open banking provider Item changed during disconnect.');
        }
        const updated: StoredOpenBankingConnection = {
          ...existing,
          providerItemStatus: 'disconnect_requested',
          updatedAt: input.requestedAt,
        };
        await writePersistedRecords(
          records.map((candidate) => candidate === record ? encryptRecord(updated) : candidate)
        );
        return updated;
      });
    },

    async markProviderRevokedOwned(scope, input) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === scope.id && candidate.userId === scope.userId
        );
        if (!record) throw new OpenBankingConnectionOwnershipError();
        assertRecordScope(record, scope);
        const existing = decryptRecord(record);
        if (existing.providerItemStatus === 'disconnected' ||
            existing.providerItemStatus === 'provider_revoked') return existing;
        if (existing.providerItemStatus !== 'disconnect_requested' ||
            existing.itemId !== input.expectedItemId || !existing.accessToken) {
          throw new OpenBankingVaultError('Open banking disconnect operation state is invalid.');
        }
        const updated: StoredOpenBankingConnection = {
          ...existing,
          providerItemStatus: 'provider_revoked',
          disconnectedAt: input.revokedAt,
          updatedAt: input.revokedAt,
        };
        await writePersistedRecords(
          records.map((candidate) => candidate === record ? encryptRecord(updated) : candidate)
        );
        return updated;
      });
    },

    async finalizeDisconnectOwned(scope, input) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === scope.id && candidate.userId === scope.userId
        );
        if (!record) throw new OpenBankingConnectionOwnershipError();
        assertRecordScope(record, scope);
        const existing = decryptRecord(record);
        if (existing.providerItemStatus === 'disconnected') return existing;
        if (existing.providerItemStatus !== 'provider_revoked' ||
            existing.itemId !== input.expectedItemId) {
          throw new OpenBankingVaultError('Open banking disconnect operation state is invalid.');
        }
        const updated: StoredOpenBankingConnection = {
          ...existing,
          accessToken: null,
          itemId: null,
          providerItemStatus: 'disconnected',
          disconnectedAt: input.revokedAt,
          revokedItems: existing.revokedItems.some((item) => item.itemId === input.expectedItemId)
            ? existing.revokedItems
            : [...existing.revokedItems, { itemId: input.expectedItemId, revokedAt: input.revokedAt }],
          updatedAt: input.revokedAt,
        };
        await writePersistedRecords(
          records.map((candidate) => candidate === record ? encryptRecord(updated) : candidate)
        );
        return updated;
      });
    },

    async markDisconnectedOwned(scope, input) {
      const begun = await this.beginDisconnectOwned(scope, {
        requestedAt: input.revokedAt,
        expectedItemId: input.expectedItemId,
      });
      if (begun.providerItemStatus === 'disconnected') return begun;
      const revoked = await this.markProviderRevokedOwned(scope, input);
      if (revoked.providerItemStatus === 'disconnected') return revoked;
      return this.finalizeDisconnectOwned(scope, input);
    },

    async deleteOwned(scope) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === scope.id && candidate.userId === scope.userId
        );
        if (!record) return false;
        assertRecordScope(record, scope);
        await writePersistedRecords(
          records.filter((candidate) => candidate !== record)
        );
        return true;
      });
    },
  };
};

export const createDefaultOpenBankingConnectionStore = (): OpenBankingConnectionStore => {
  let store: OpenBankingConnectionStore | null = null;
  const getStore = () => {
    store ??= createOpenBankingConnectionStore({
      filePath: path.resolve(process.cwd(), '.data', 'open-banking-connections.json'),
      encodedMasterKey: process.env.OPEN_BANKING_VAULT_KEY,
      expectedEnvironment: readPlaidPilotConfiguration().environment,
    });
    return store;
  };
  return {
    list: (providerName, environment) => getStore().list(providerName, environment),
    listOwned: (input) => getStore().listOwned(input),
    loadOwned: (scope) => getStore().loadOwned(scope),
    save: (connection) => getStore().save(connection),
    updateOwned: (scope, patch) => getStore().updateOwned(scope, patch),
    advanceTransactionCursorOwned: (scope, input) =>
      getStore().advanceTransactionCursorOwned(scope, input),
    beginDisconnectOwned: (scope, input) => getStore().beginDisconnectOwned(scope, input),
    markProviderRevokedOwned: (scope, input) =>
      getStore().markProviderRevokedOwned(scope, input),
    finalizeDisconnectOwned: (scope, input) => getStore().finalizeDisconnectOwned(scope, input),
    markDisconnectedOwned: (scope, input) => getStore().markDisconnectedOwned(scope, input),
    deleteOwned: (scope) => getStore().deleteOwned(scope),
  };
};
