import { read, utils, type WorkBook } from 'xlsx';
import type { BankTransaction, CashAccount } from '../types';
import type { DisplayCurrency } from '../types/settings';
import { normalizeCashAccount } from './cashAccounts';
import { getBankTransactionIdentity, normalizeProviderTransactions } from './bankTransactions';
import type { CurrencyRates } from './currency';

export const SANTANDER_XLS_MAX_BYTES = 5 * 1024 * 1024;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const headers = ['FECHA OPERACION', 'FECHA VALOR', 'CONCEPTO', 'IMPORTE EUR', 'SALDO'];
type Cell = string | number | boolean | null | undefined;

export interface SantanderStatementRow {
  operationDate: string;
  valueDate: string;
  description: string;
  amountMinorUnits: number;
  balanceMinorUnits: number;
  currency: 'EUR';
  source: 'statement-import';
  importer: 'santander-es';
  posted: true;
  externalTransactionId: string;
}

export interface SantanderStatement {
  accountFingerprint: string;
  maskedReference: string;
  statementAt: string | null;
  statementBalanceMinorUnits: number | null;
  rows: SantanderStatementRow[];
  rejectedRows: number;
  balanceCompatible: boolean | null;
}

const normalizeText = (value: Cell) => String(value ?? '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const normalizeHeader = (value: Cell) => normalizeText(value).toUpperCase();
const normalizeDescriptionForIdentity = (value: string) => normalizeText(value).toUpperCase();
const redactAccountIdentifiers = (value: string) => value.replace(/\bES\d{2}(?:[\s-]*\d{4}){5}\b/gi,
  (iban) => `•••• ${iban.replace(/\D/g, '').slice(-4)}`);
const toMinorUnits = (value: Cell): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(value * 100 - cents) < 0.000001 ? cents : null;
};
const parseDate = (value: Cell): string | null => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${match[3]}-${match[2]}-${match[1]}` : null;
};
const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const parseTimestamp = (value: string): string | null => {
  const match = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?\b/);
  if (!match) return null;
  const date = parseDate(`${match[1]}/${match[2]}/${match[3]}`);
  if (!date) return null;
  const hours = Number(match[4] ?? '00');
  const minutes = Number(match[5] ?? '00');
  const seconds = Number(match[6] ?? '00');
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  // The export contains local Spanish wall time without a timezone. Retain that
  // clock representation for ordering statements from the same institution.
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** Accepts only a legacy OLE/BIFF workbook. The caller never sends its bytes to a service. */
export const parseSantanderSpainXls = async (bytes: ArrayBuffer): Promise<SantanderStatement> => {
  if (bytes.byteLength < OLE_SIGNATURE.length || bytes.byteLength > SANTANDER_XLS_MAX_BYTES ||
      !OLE_SIGNATURE.every((byte, index) => new Uint8Array(bytes)[index] === byte)) {
    throw new Error('unsupported-file');
  }
  let workbook: WorkBook;
  try {
    workbook = read(bytes, { type: 'array', cellFormula: false, cellHTML: false, bookVBA: false,
      bookFiles: false, bookProps: false, bookSheets: false, sheetStubs: false });
  } catch {
    throw new Error('invalid-workbook');
  }
  const candidates = workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    if (sheet['!ref']) {
      let range;
      try { range = utils.decode_range(sheet['!ref']); } catch { throw new Error('invalid-workbook'); }
      if (range.e.r - range.s.r > 50000 || range.e.c - range.s.c >= 64) throw new Error('unsupported-file');
    }
    const rows = utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
    if (rows.length > 50000 || rows.some((row) => row.length > 64)) throw new Error('unsupported-file');
    const tableIndex = rows.findIndex((row) => headers.every((header) => row.some((cell) => normalizeHeader(cell) === header)));
    return tableIndex < 0 ? [] : [{ name, rows, tableIndex }];
  });
  if (candidates.length === 0) throw new Error('missing-headers');
  const preferred = candidates.filter((candidate) => normalizeHeader(candidate.name) === 'MOVIMIENTOS');
  if (preferred.length > 1 || (preferred.length === 0 && candidates.length !== 1)) throw new Error('ambiguous-sheet');
  const { rows, tableIndex } = preferred[0] ?? candidates[0];
  const positions = headers.map((header) => rows[tableIndex].flatMap((cell, index) =>
    normalizeHeader(cell) === header ? [index] : []));
  if (positions.some((matches) => matches.length !== 1)) throw new Error('ambiguous-headers');
  const [operationColumn, valueColumn, descriptionColumn, amountColumn, balanceColumn] = positions.map((matches) => matches[0]);
  const metadata = rows.slice(0, tableIndex);
  const metadataText = metadata.flat().map((cell) => String(cell ?? '')).join(' ');
  const accountIdentifiers = [...metadataText.toUpperCase().matchAll(/\bES\d{2}(?:[\s-]*\d{4}){5}\b/g)]
    .map((match) => match[0].replace(/[^A-Z0-9]/g, ''));
  const uniqueAccounts = [...new Set(accountIdentifiers)];
  if (uniqueAccounts.length !== 1) throw new Error('missing-account');
  const accountFingerprint = await sha256(uniqueAccounts[0]);
  const maskedReference = `•••• ${uniqueAccounts[0].slice(-4)}`;
  const statementAt = metadata.map((row) => row.map((cell) => String(cell ?? '')).join(' '))
    .filter((line) => /FECHA|GENERAD|EMISI[OÓ]N/i.test(line))
    .map(parseTimestamp).find((value) => value !== null) ?? null;
  let statementBalanceMinorUnits: number | null = null;
  let balancePriority = -1;
  for (const row of metadata) {
    const label = normalizeHeader(row[0]);
    if (/^SALDO(?: (ACTUAL|FINAL))?(?: EUR)?$/.test(label)) {
      const number = row.slice(1).map(toMinorUnits).find((value) => value !== null);
      if (number === undefined) throw new Error('invalid-balance');
      const priority = label.includes('ACTUAL') ? 2 : label.includes('FINAL') ? 1 : 0;
      if (priority === balancePriority && statementBalanceMinorUnits !== null && statementBalanceMinorUnits !== number) {
        throw new Error('invalid-balance');
      }
      if (priority >= balancePriority) {
        statementBalanceMinorUnits = number;
        balancePriority = priority;
      }
    }
  }
  const parsedRows: SantanderStatementRow[] = [];
  let rejectedRows = 0;
  for (const row of rows.slice(tableIndex + 1)) {
    if (row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')) continue;
    const operationDate = parseDate(row[operationColumn]);
    const valueDate = parseDate(row[valueColumn]);
    const amountMinorUnits = toMinorUnits(row[amountColumn]);
    const balanceMinorUnits = toMinorUnits(row[balanceColumn]);
    const description = redactAccountIdentifiers(String(row[descriptionColumn] ?? '').replace(/\s+/g, ' ').trim());
    if (!operationDate || !valueDate || amountMinorUnits === null || balanceMinorUnits === null || !description || description.length > 512) {
      rejectedRows++;
      continue;
    }
    const identity = JSON.stringify(['statement-import', 'santander-es', accountFingerprint, operationDate,
      valueDate, amountMinorUnits, balanceMinorUnits, normalizeDescriptionForIdentity(description)]);
    parsedRows.push({ operationDate, valueDate, description, amountMinorUnits, balanceMinorUnits,
      currency: 'EUR', source: 'statement-import', importer: 'santander-es', posted: true,
      externalTransactionId: `santander-es:${await sha256(identity)}` });
  }
  if (parsedRows.length === 0) throw new Error('empty-table');
  const newest = [...parsedRows].sort((a, b) => b.operationDate.localeCompare(a.operationDate))[0];
  return { accountFingerprint, maskedReference, statementAt, statementBalanceMinorUnits,
    rows: parsedRows, rejectedRows,
    balanceCompatible: statementBalanceMinorUnits === null ? null :
      newest.balanceMinorUnits === statementBalanceMinorUnits };
};

export const getSantanderImportPreview = (statement: SantanderStatement, transactions: BankTransaction[]) => {
  const existing = new Set(transactions.map(getBankTransactionIdentity));
  const seen = new Set<string>();
  const newRows = statement.rows.filter((row) => {
    const identity = getBankTransactionIdentity({ providerName: 'other', providerEnvironment: null,
      connectionId: `statement:santander-es:${statement.accountFingerprint}`,
      externalAccountId: statement.accountFingerprint, externalTransactionId: row.externalTransactionId });
    if (existing.has(identity) || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return { newRows, duplicateCount: statement.rows.length - newRows.length,
    inflowMinorUnits: newRows.reduce((sum, row) => sum + Math.max(row.amountMinorUnits, 0), 0),
    outflowMinorUnits: newRows.reduce((sum, row) => sum + Math.min(row.amountMinorUnits, 0), 0) };
};

export const applySantanderStatementImport = (
  statement: SantanderStatement,
  accounts: CashAccount[],
  transactions: BankTransaction[],
  userId: string,
  reportingCurrency: DisplayCurrency,
  fxRates: Readonly<Partial<CurrencyRates>>,
  timestamp = new Date().toISOString(),
  defaultAccountName = `Santander Spain ${statement.maskedReference}`
) => {
  const matches = accounts.filter((account) => account.sourceType === 'statement-import' &&
    account.statementAccountFingerprint === statement.accountFingerprint);
  if (matches.length > 1) throw new Error('ambiguous-account');
  const existing = matches[0];
  const accountId = `statement-account:santander-es:${statement.accountFingerprint}`;
  if (!existing && accounts.some((account) => account.id === accountId)) throw new Error('account-conflict');
  const balanceIsNewer = statement.statementBalanceMinorUnits !== null && !!statement.statementAt &&
    (!existing?.balanceSnapshotAt || statement.statementAt > existing.balanceSnapshotAt);
  const balance = statement.statementBalanceMinorUnits !== null && balanceIsNewer
    ? statement.statementBalanceMinorUnits / 100 : existing?.currentBalance ?? 0;
  const account = existing && !balanceIsNewer ? existing : normalizeCashAccount({
    ...(existing ?? {}), id: existing?.id ?? accountId, userId,
    nickname: existing?.nickname ?? defaultAccountName,
    institutionName: 'Santander Spain', accountType: 'checking', currency: 'EUR',
    currentBalance: balance, balance: balance, sourceType: 'statement-import',
    statementAccountFingerprint: statement.accountFingerprint,
    balanceSnapshotAt: balanceIsNewer && statement.statementBalanceMinorUnits !== null
      ? statement.statementAt : existing?.balanceSnapshotAt ?? null,
    maskedReference: statement.maskedReference, providerName: 'other',
    externalAccountId: statement.accountFingerprint,
    connectionId: `statement:santander-es:${statement.accountFingerprint}`,
    status: existing?.status ?? 'active', syncStatus: 'idle', updatedAt: timestamp,
  });
  const preview = getSantanderImportPreview(statement, transactions);
  const incoming = normalizeProviderTransactions(preview.newRows.map((row) => ({
    externalTransactionId: row.externalTransactionId,
    externalAccountId: statement.accountFingerprint,
    bookingDate: row.operationDate,
    authorizedDate: row.valueDate,
    amount: Math.abs(row.amountMinorUnits) / 100,
    direction: row.amountMinorUnits >= 0 ? 'credit' as const : 'debit' as const,
    currency: 'EUR' as const, description: row.description, pending: false,
    metadata: { source: 'statement-import', importer: 'santander-es', valueDate: row.valueDate,
      balanceMinorUnits: row.balanceMinorUnits },
  })), { providerName: 'other', providerEnvironment: null,
    connectionId: account.connectionId!, accounts: [account], reportingCurrency, fxRates, syncedAt: timestamp });
  return { account, accounts: existing ? accounts.map((item) => item.id === existing.id ? account : item) : [...accounts, account],
    transactions: [...transactions, ...incoming], newTransactions: incoming, duplicateCount: preview.duplicateCount };
};
