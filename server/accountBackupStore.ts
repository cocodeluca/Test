import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface StoredAccountBackupRecord {
  email: string;
  payload: unknown;
  updatedAt: string;
}

const DATA_DIRECTORY = path.resolve(process.cwd(), '.data');
const BACKUP_FILE_PATH = path.join(DATA_DIRECTORY, 'account-backups.json');

const ensureDataDirectory = async () => {
  await mkdir(DATA_DIRECTORY, { recursive: true });
};

const readRecords = async (): Promise<StoredAccountBackupRecord[]> => {
  await ensureDataDirectory();

  try {
    const fileContent = await readFile(BACKUP_FILE_PATH, 'utf-8');
    return JSON.parse(fileContent) as StoredAccountBackupRecord[];
  } catch {
    return [];
  }
};

const writeRecords = async (records: StoredAccountBackupRecord[]) => {
  await ensureDataDirectory();
  await writeFile(BACKUP_FILE_PATH, JSON.stringify(records, null, 2), 'utf-8');
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const saveAccountBackupToStore = async (email: string, payload: unknown) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error('Email is required to save a server backup.');
  }

  const records = await readRecords();
  const nextRecord: StoredAccountBackupRecord = {
    email: normalizedEmail,
    payload,
    updatedAt: new Date().toISOString(),
  };

  const nextRecords = records.some((record) => record.email === normalizedEmail)
    ? records.map((record) => (record.email === normalizedEmail ? nextRecord : record))
    : [...records, nextRecord];

  await writeRecords(nextRecords);

  return {
    ok: true,
    email: normalizedEmail,
    updatedAt: nextRecord.updatedAt,
  };
};

export const loadAccountBackupFromStore = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error('Email is required to load a server backup.');
  }

  const records = await readRecords();
  const record = records.find((candidate) => candidate.email === normalizedEmail);

  if (!record) {
    throw new Error('No server backup found for this email.');
  }

  return {
    ok: true,
    email: normalizedEmail,
    updatedAt: record.updatedAt,
    payload: record.payload,
  };
};
