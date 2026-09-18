import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OpenBankingProviderName } from '../src/common/types';

export interface StoredOpenBankingConnection {
  id: string;
  userId: string;
  providerName: OpenBankingProviderName;
  institutionName: string;
  institutionId: string;
  accessToken: string | null;
  itemId: string | null;
  providerItemStatus: 'active' | 'disconnected';
  disconnectedAt: string | null;
  revokedItems: Array<{
    itemId: string;
    revokedAt: string;
  }>;
  selectedAccountIds: string[];
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

export interface OpenBankingConnectionStore {
  list(): Promise<StoredOpenBankingConnection[]>;
  loadOwned(userId: string, id: string): Promise<StoredOpenBankingConnection | null>;
  save(connection: StoredOpenBankingConnection): Promise<StoredOpenBankingConnection>;
  updateOwned(
    userId: string,
    id: string,
    patch: Partial<Omit<StoredOpenBankingConnection, 'id' | 'userId' | 'accessToken'>>
  ): Promise<StoredOpenBankingConnection>;
  markDisconnectedOwned(
    userId: string,
    id: string,
    input: { revokedAt: string; expectedItemId: string }
  ): Promise<StoredOpenBankingConnection>;
  deleteOwned(userId: string, id: string): Promise<boolean>;
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

const isPersistedRecord = (value: unknown): value is PersistedOpenBankingConnection => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.providerName === 'string' &&
    typeof record.institutionName === 'string' &&
    typeof record.institutionId === 'string' &&
    (typeof record.itemId === 'string' || record.itemId === null) &&
    (record.providerItemStatus === undefined ||
      record.providerItemStatus === 'active' ||
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
        (record.providerItemStatus === undefined || record.providerItemStatus === 'active')) &&
    !('accessToken' in record)
  );
};

const buildAssociatedData = (
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
    if (!Array.isArray(parsed) || !parsed.every(isPersistedRecord)) {
      throw new OpenBankingVaultError('Open banking vault structure is invalid.');
    }
    return parsed;
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

  return {
    async list() {
      return (await readPersistedRecords()).map(decryptRecord);
    },

    async loadOwned(userId, id) {
      const record = (await readPersistedRecords()).find(
        (candidate) => candidate.id === id && candidate.userId === userId
      );
      return record ? decryptRecord(record) : null;
    },

    async save(connection) {
      return withWriteLock(async () => {
        if (
          (connection.providerItemStatus === 'active' &&
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
              return encrypted;
            })
          : [...records, encrypted];
        await writePersistedRecords(nextRecords);
        return connection;
      });
    },

    async updateOwned(userId, id, patch) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === id && candidate.userId === userId
        );
        if (!record) throw new OpenBankingConnectionOwnershipError();
        const existing = decryptRecord(record);
        const updated: StoredOpenBankingConnection = {
          ...existing,
          ...patch,
          id,
          userId,
          accessToken: existing.accessToken,
          updatedAt: patch.updatedAt ?? new Date().toISOString(),
        };
        await writePersistedRecords(
          records.map((candidate) => candidate === record ? encryptRecord(updated) : candidate)
        );
        return updated;
      });
    },

    async markDisconnectedOwned(userId, id, input) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const record = records.find(
          (candidate) => candidate.id === id && candidate.userId === userId
        );
        if (!record) throw new OpenBankingConnectionOwnershipError();
        const existing = decryptRecord(record);
        if (existing.providerItemStatus === 'disconnected') return existing;
        if (!existing.itemId || existing.itemId !== input.expectedItemId) {
          throw new OpenBankingVaultError('Open banking provider Item changed during disconnect.');
        }
        const updated: StoredOpenBankingConnection = {
          ...existing,
          accessToken: null,
          itemId: null,
          providerItemStatus: 'disconnected',
          disconnectedAt: input.revokedAt,
          revokedItems: [
            ...existing.revokedItems,
            { itemId: existing.itemId, revokedAt: input.revokedAt },
          ],
          updatedAt: input.revokedAt,
        };
        await writePersistedRecords(
          records.map((candidate) => candidate === record ? encryptRecord(updated) : candidate)
        );
        return updated;
      });
    },

    async deleteOwned(userId, id) {
      return withWriteLock(async () => {
        const records = await readPersistedRecords();
        const exists = records.some(
          (record) => record.id === id && record.userId === userId
        );
        if (!exists) return false;
        await writePersistedRecords(
          records.filter((record) => !(record.id === id && record.userId === userId))
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
    });
    return store;
  };
  return {
    list: () => getStore().list(),
    loadOwned: (userId, id) => getStore().loadOwned(userId, id),
    save: (connection) => getStore().save(connection),
    updateOwned: (userId, id, patch) => getStore().updateOwned(userId, id, patch),
    markDisconnectedOwned: (userId, id, input) =>
      getStore().markDisconnectedOwned(userId, id, input),
    deleteOwned: (userId, id) => getStore().deleteOwned(userId, id),
  };
};
