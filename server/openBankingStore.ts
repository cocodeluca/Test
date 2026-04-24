import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { OpenBankingProviderName } from '../src/common/types';

export interface StoredOpenBankingConnection {
  id: string;
  userId: string;
  providerName: OpenBankingProviderName;
  institutionName: string;
  institutionId: string;
  accessToken: string;
  itemId: string;
  selectedAccountIds: string[];
  consentExpirationTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIRECTORY = path.resolve(process.cwd(), '.data');
const STORE_FILE_PATH = path.join(DATA_DIRECTORY, 'open-banking-connections.json');

const ensureDataDirectory = async () => {
  await mkdir(DATA_DIRECTORY, { recursive: true });
};

const readRecords = async (): Promise<StoredOpenBankingConnection[]> => {
  await ensureDataDirectory();

  try {
    const fileContent = await readFile(STORE_FILE_PATH, 'utf-8');
    return JSON.parse(fileContent) as StoredOpenBankingConnection[];
  } catch {
    return [];
  }
};

const writeRecords = async (records: StoredOpenBankingConnection[]) => {
  await ensureDataDirectory();
  await writeFile(STORE_FILE_PATH, JSON.stringify(records, null, 2), 'utf-8');
};

export const listOpenBankingConnections = async () => readRecords();

export const loadOpenBankingConnection = async (id: string) => {
  const records = await readRecords();
  return records.find((record) => record.id === id) ?? null;
};

export const saveOpenBankingConnection = async (
  connection: StoredOpenBankingConnection
) => {
  const records = await readRecords();
  const nextRecords = records.some((record) => record.id === connection.id)
    ? records.map((record) => (record.id === connection.id ? connection : record))
    : [...records, connection];

  await writeRecords(nextRecords);
  return connection;
};

export const updateOpenBankingConnection = async (
  id: string,
  patch: Partial<StoredOpenBankingConnection>
) => {
  const existing = await loadOpenBankingConnection(id);

  if (!existing) {
    throw new Error('Open banking connection not found.');
  }

  const nextRecord: StoredOpenBankingConnection = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await saveOpenBankingConnection(nextRecord);
  return nextRecord;
};

export const deleteOpenBankingConnection = async (id: string) => {
  const records = await readRecords();
  await writeRecords(records.filter((record) => record.id !== id));
};
