import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface StoredAccountBackupRecord {
  userId?: string;
  email: string;
  payload: unknown;
  updatedAt: string;
}

export interface AccountBackupOwner {
  userId: string;
  email: string;
}

export interface AccountBackupStore {
  save(owner: AccountBackupOwner, payload: unknown): Promise<{
    ok: true;
    email: string;
    updatedAt: string;
  }>;
  load(owner: AccountBackupOwner): Promise<{
    ok: true;
    email: string;
    updatedAt: string;
    payload: unknown;
  }>;
}

export class AccountBackupError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AccountBackupError';
  }
}

export class AccountBackupNotFoundError extends AccountBackupError {
  constructor() {
    super('ACCOUNT_BACKUP_NOT_FOUND', 404, 'No server backup found for this account.');
    this.name = 'AccountBackupNotFoundError';
  }
}

export class AccountBackupOwnershipError extends AccountBackupError {
  constructor() {
    super(
      'ACCOUNT_BACKUP_OWNERSHIP_UNRESOLVED',
      409,
      'Server backup ownership could not be established safely.'
    );
    this.name = 'AccountBackupOwnershipError';
  }
}

export class AccountBackupStoreError extends AccountBackupError {
  constructor() {
    super('ACCOUNT_BACKUP_STORE_ERROR', 503, 'Server backup storage is unavailable.');
    this.name = 'AccountBackupStoreError';
  }
}

export class AccountBackupPayloadError extends AccountBackupError {
  constructor() {
    super('ACCOUNT_BACKUP_PAYLOAD_INVALID', 400, 'Account backup payload is invalid.');
    this.name = 'AccountBackupPayloadError';
  }
}

const DATA_DIRECTORY = path.resolve(process.cwd(), '.data');
const BACKUP_FILE_PATH = path.join(DATA_DIRECTORY, 'account-backups.json');
const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isStoredRecord = (value: unknown): value is StoredAccountBackupRecord => {
  if (!isRecord(value)) return false;
  return (value.userId === undefined || (typeof value.userId === 'string' && isUuid(value.userId))) &&
    typeof value.email === 'string' &&
    Boolean(normalizeEmail(value.email)) &&
    'payload' in value &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt));
};

const getPayloadEmail = (payload: unknown): string | null => {
  if (!isRecord(payload) || !isRecord(payload.user) || typeof payload.user.email !== 'string') {
    return null;
  }
  return normalizeEmail(payload.user.email);
};

const normalizeOwner = (owner: AccountBackupOwner): AccountBackupOwner => {
  const email = normalizeEmail(owner.email);
  if (!isUuid(owner.userId) || !email) throw new AccountBackupOwnershipError();
  return { userId: owner.userId, email };
};

export const createAccountBackupStore = (options: {
  filePath?: string;
  now?: () => Date;
} = {}): AccountBackupStore => {
  const filePath = path.resolve(options.filePath ?? BACKUP_FILE_PATH);
  const now = options.now ?? (() => new Date());
  let writeQueue: Promise<void> = Promise.resolve();

  const readRecords = async (): Promise<StoredAccountBackupRecord[]> => {
    let fileContent: string;
    try {
      fileContent = await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new AccountBackupStoreError();
    }
    try {
      const parsed = JSON.parse(fileContent) as unknown;
      if (!Array.isArray(parsed) || !parsed.every(isStoredRecord)) throw new Error('invalid');
      const ownedIds = parsed
        .filter((record): record is StoredAccountBackupRecord & { userId: string } => Boolean(record.userId))
        .map((record) => record.userId);
      if (new Set(ownedIds).size !== ownedIds.length) throw new Error('duplicate owner');
      return parsed;
    } catch {
      throw new AccountBackupStoreError();
    }
  };

  const writeRecords = async (records: StoredAccountBackupRecord[]) => {
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

  const findLegacyRecordIndex = (
    records: StoredAccountBackupRecord[],
    owner: AccountBackupOwner
  ): number | null => {
    if (records.some((record) => record.userId && normalizeEmail(record.email) === owner.email)) {
      throw new AccountBackupOwnershipError();
    }
    const candidates = records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => !record.userId && normalizeEmail(record.email) === owner.email);
    if (candidates.length === 0) return null;
    if (candidates.length !== 1 || getPayloadEmail(candidates[0].record.payload) !== owner.email) {
      throw new AccountBackupOwnershipError();
    }
    return candidates[0].index;
  };

  return {
    save(ownerInput, payload) {
      return withWriteLock(async () => {
        const owner = normalizeOwner(ownerInput);
        if (!isRecord(payload)) throw new AccountBackupPayloadError();
        const records = await readRecords();
        const ownedIndex = records.findIndex((record) => record.userId === owner.userId);
        const legacyIndex = ownedIndex < 0 ? findLegacyRecordIndex(records, owner) : null;
        const nextRecord: StoredAccountBackupRecord = {
          userId: owner.userId,
          email: owner.email,
          payload,
          updatedAt: now().toISOString(),
        };
        const replaceIndex = ownedIndex >= 0 ? ownedIndex : legacyIndex;
        const nextRecords = replaceIndex === null
          ? [...records, nextRecord]
          : records.map((record, index) => index === replaceIndex ? nextRecord : record);
        await writeRecords(nextRecords);
        return { ok: true, email: owner.email, updatedAt: nextRecord.updatedAt };
      });
    },

    load(ownerInput) {
      return withWriteLock(async () => {
        const owner = normalizeOwner(ownerInput);
        const records = await readRecords();
        const ownedRecord = records.find((record) => record.userId === owner.userId);
        if (ownedRecord) {
          return {
            ok: true,
            email: owner.email,
            updatedAt: ownedRecord.updatedAt,
            payload: ownedRecord.payload,
          };
        }

        const legacyIndex = findLegacyRecordIndex(records, owner);
        if (legacyIndex === null) throw new AccountBackupNotFoundError();
        const legacyRecord = records[legacyIndex];
        const claimedRecord = { ...legacyRecord, userId: owner.userId, email: owner.email };
        await writeRecords(records.map((record, index) =>
          index === legacyIndex ? claimedRecord : record
        ));
        return {
          ok: true,
          email: owner.email,
          updatedAt: claimedRecord.updatedAt,
          payload: claimedRecord.payload,
        };
      });
    },
  };
};

export const defaultAccountBackupStore = createAccountBackupStore();
