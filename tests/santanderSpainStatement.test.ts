import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { IDBFactory } from 'fake-indexeddb';
import { utils, write } from 'xlsx';
import { applySantanderStatementImport, getSantanderImportPreview, parseSantanderSpainXls } from '../src/common/utils/santanderSpainStatement';
import { getBankTransactionIdentity } from '../src/common/utils/bankTransactions';
import { createLinkedCashAccount, createManualCashAccount } from '../src/common/utils/cashAccounts';
import { mockProperties } from '../src/common/data/mockData';
import { confirmBankTransactionMatch, suggestBankTransactionMatch } from '../src/common/utils/bankReconciliation';
import { emptyPortfolioData, loadUserPortfolio, saveUserPortfolio } from '../src/platforms/web/services/localAccountStore';
import { BankTransactionsView } from '../src/platforms/web/components/BankTransactionsView';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const fakeIban = 'ES1200000000000000000000';
const columns = ['FECHA OPERACIÓN', 'FECHA VALOR', 'CONCEPTO', 'IMPORTE EUR', 'SALDO'];
const transactions: (string | number)[][] = [
  ['02/04/2026', '03/04/2026', 'Synthetic rent', 20, 55],
  ['01/04/2026', '02/04/2026', 'Synthetic expense', -12.34, 35],
];
const workbookBytes = (options: {
  headers?: string[]; rows?: (string | number)[][]; statementAt?: string; balance?: number | string;
  sheet?: string; iban?: string;
} = {}): ArrayBuffer => {
  const rows: (string | number | null)[][] = [
    ['Cuenta', 'Santander synthetic checking'],
    ['FECHA GENERACIÓN', options.statementAt ?? '03/04/2026 12:00'],
    ['IBAN', options.iban ?? fakeIban],
    ['Titular', 'Test Holder'],
    ['SALDO ACTUAL', options.balance ?? 55],
    [],
    options.headers ?? columns,
    ...(options.rows ?? transactions),
  ];
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), options.sheet ?? 'Movimientos');
  const binary = write(book, { bookType: 'xls', type: 'array' }) as ArrayBuffer;
  return binary;
};

test('parses synthetic Santander BIFF XLS by headers and preserves cents, dates and privacy', async () => {
  const bytes = workbookBytes();
  assert.equal(new Uint8Array(bytes)[0], 0xd0);
  const statement = await parseSantanderSpainXls(bytes);
  assert.equal(statement.rows.length, 2);
  assert.equal(statement.rows[0].operationDate, '2026-04-02');
  assert.equal(statement.rows[0].valueDate, '2026-04-03');
  assert.equal(statement.rows[0].amountMinorUnits, 2000);
  assert.equal(statement.rows[1].amountMinorUnits, -1234);
  assert.equal(statement.rows[0].balanceMinorUnits, 5500);
  assert.equal(statement.balanceCompatible, true);
  assert.equal(statement.statementAt, '2026-04-03T12:00:00');
  assert.equal(statement.maskedReference, '•••• 0000');
  assert.doesNotMatch(JSON.stringify(statement), /ES1200000000000000000000|Test Holder/);
  const varied = await parseSantanderSpainXls(workbookBytes({
    headers: [' fecha operación ', 'FECHA  VALOR', 'concepto', ' importe eur ', ' saldo '],
    sheet: 'Other movements', rows: [...transactions].reverse(),
  }));
  assert.deepEqual(new Set(varied.rows.map((row) => row.externalTransactionId)),
    new Set(statement.rows.map((row) => row.externalTransactionId)));
  const repeatedWithOtherBalance = await parseSantanderSpainXls(workbookBytes({ rows: [
    ['02/04/2026', '03/04/2026', '  SYNTHETIC   RENT  ', 20, 54],
  ] }));
  assert.notEqual(repeatedWithOtherBalance.rows[0].externalTransactionId,
    statement.rows[0].externalTransactionId);
  const normalizedDescription = await parseSantanderSpainXls(workbookBytes({ rows: [
    ['02/04/2026', '03/04/2026', '  SYNTHETIC   RENT  ', 20, 55],
  ] }));
  assert.equal(normalizedDescription.rows[0].externalTransactionId,
    statement.rows[0].externalTransactionId);
  const containingIban = await parseSantanderSpainXls(workbookBytes({ rows: [
    ['02/04/2026', '03/04/2026', `Synthetic transfer to ${fakeIban}`, 20, 55],
  ] }));
  assert.doesNotMatch(JSON.stringify(containingIban), /ES1200000000000000000000/);
});

test('rejects unsupported and ambiguous schema and excludes invalid rows', async () => {
  await assert.rejects(parseSantanderSpainXls(new ArrayBuffer(24)), /unsupported-file/);
  await assert.rejects(parseSantanderSpainXls(workbookBytes({ headers: columns.slice(0, 4) })), /missing-headers/);
  await assert.rejects(parseSantanderSpainXls(workbookBytes({ headers: [...columns, 'SALDO'] })), /ambiguous-headers/);
  await assert.rejects(parseSantanderSpainXls(workbookBytes({ headers: [...columns.slice(0, 3), 'IMPORTE USD', 'SALDO'] })), /missing-headers/);
  await assert.rejects(parseSantanderSpainXls(workbookBytes({ balance: 'invalid' })), /invalid-balance/);
  const statement = await parseSantanderSpainXls(workbookBytes({ rows: [
    transactions[0],
    ['31/02/2026', '02/04/2026', 'Invalid date', 1, 56],
    ['01/04/2026', '02/04/2026', 'Invalid amount', '1.00', 56],
    ['01/04/2026', '02/04/2026', 'Invalid balance', 1, '56.00'],
  ] }));
  assert.equal(statement.rows.length, 1);
  assert.equal(statement.rejectedRows, 3);
  await assert.rejects(parseSantanderSpainXls(workbookBytes({ rows: [
    ['31/02/2026', '02/04/2026', 'Invalid date', 1, 56],
  ] })), /empty-table/);
});

test('deduplicates repeat and overlapping statements, uses canonical transactions and orders balance snapshots', async () => {
  const statement = await parseSantanderSpainXls(workbookBytes());
  const manual = createManualCashAccount({ id: 'manual-unaffected', currentBalance: 4 });
  const plaid = createLinkedCashAccount({ id: 'plaid-unaffected', providerName: 'plaid',
    providerEnvironment: 'sandbox', externalAccountId: 'provider-account' });
  const first = applySantanderStatementImport(statement, [manual, plaid], [], 'synthetic-user', 'EUR', { EUR: 1 },
    '2026-04-03T12:05:00Z', 'Santander synthetic •••• 0000');
  assert.equal(first.newTransactions.length, 2);
  assert.equal(first.account.currentBalance, 55);
  assert.equal(first.account.sourceType, 'statement-import');
  assert.equal(first.transactions[0].pending, false);
  assert.equal(first.transactions[0].amount, 20);
  assert.equal(first.transactions[1].amount, -12.34);
  assert.equal(first.transactions[0].bookingDate, '2026-04-02');
  assert.equal(first.transactions[0].providerMetadata?.valueDate, '2026-04-03');
  assert.equal(first.transactions[0].cashAccountId, first.account.id);
  assert.equal(first.accounts[0], manual);
  assert.equal(first.accounts[1], plaid);
  assert.doesNotMatch(JSON.stringify(first), /ES1200000000000000000000|Test Holder/);
  assert.equal(getSantanderImportPreview(statement, first.transactions).duplicateCount, 2);

  const repeat = applySantanderStatementImport(statement, first.accounts, first.transactions,
    'synthetic-user', 'EUR', { EUR: 1 }, '2026-04-04T00:00:00Z');
  assert.equal(repeat.newTransactions.length, 0);
  assert.equal(repeat.transactions.length, 2);
  const older = await parseSantanderSpainXls(workbookBytes({ statementAt: '02/04/2026 09:00', balance: 999 }));
  const noRegression = applySantanderStatementImport(older, repeat.accounts, repeat.transactions,
    'synthetic-user', 'EUR', { EUR: 1 });
  assert.equal(noRegression.account.currentBalance, 55);
  assert.equal(noRegression.account.balanceSnapshotAt, '2026-04-03T12:00:00');

  const overlap = await parseSantanderSpainXls(workbookBytes({
    statementAt: '04/04/2026 14:00', balance: 60,
    rows: [ ['04/04/2026', '04/04/2026', 'Another synthetic credit', 5, 60], transactions[0] ],
  }));
  const updated = applySantanderStatementImport(overlap, noRegression.accounts, noRegression.transactions,
    'synthetic-user', 'EUR', { EUR: 1 });
  assert.equal(updated.newTransactions.length, 1);
  assert.equal(updated.duplicateCount, 1);
  assert.equal(updated.account.currentBalance, 60);
  assert.equal(updated.transactions.length, 3);
  assert.notEqual(getBankTransactionIdentity(updated.transactions[0]),
    getBankTransactionIdentity({ ...updated.transactions[0], providerName: 'plaid' }));

  (globalThis as typeof globalThis & { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  const portfolio = { ...emptyPortfolioData, cashAccounts: updated.accounts, bankTransactions: updated.transactions };
  await saveUserPortfolio('statement-test-user', portfolio);
  const loaded = await loadUserPortfolio('statement-test-user');
  assert.equal(loaded.cashAccounts.find((account) => account.id === updated.account.id)?.balanceSnapshotAt,
    '2026-04-04T14:00:00');
  assert.deepEqual((loaded.bankTransactions ?? []).map((transaction) => transaction.id), updated.transactions.map((transaction) => transaction.id));
  assert.doesNotMatch(JSON.stringify(loaded), /ES1200000000000000000000|Test Holder/);
});

test('imported posted rows use the existing rent and expense reconciliation pipeline', async () => {
  const rentRow: (string | number)[] = ['03/09/2026', '03/09/2026', 'September rent', 1450, 2000];
  const expenseRow: (string | number)[] = ['10/09/2026', '10/09/2026', 'Community fee', -90, 1910];
  const statement = await parseSantanderSpainXls(workbookBytes({
    statementAt: '11/09/2026 10:00', balance: 1910, rows: [expenseRow, rentRow],
  }));
  const imported = applySantanderStatementImport(statement, [], [], 'synthetic-user', 'EUR', { EUR: 1 });
  const lease = { ...mockProperties[0].leases![0], id: 'synthetic-lease', name: 'Synthetic tenant',
    startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 1450,
    monthlyRentCurrency: 'EUR' as const, rentDueDay: 5, rentTrackingStartDate: '2026-09-01', active: true };
  const property = { ...mockProperties[0], id: 'synthetic-property', name: 'Synthetic property',
    leases: [lease], activeLeaseId: lease.id };
  const rent = { id: 'synthetic-rent', propertyId: property.id, leaseId: lease.id,
    period: '2026-09', dueDate: '2026-09-05', expectedAmount: 1450, currency: 'EUR' as const };
  const rule = { id: 'synthetic-rule', propertyId: property.id, category: 'COMMUNITY' as const,
    label: 'Community fee', amount: 90, currency: 'EUR' as const, frequency: 'MONTHLY' as const,
    startDate: '2026-01-01', trackingStartDate: '2026-09-01', dueDay: 10, isActive: true };
  const obligation = { id: 'synthetic-obligation', propertyId: property.id,
    expenseRuleId: rule.id, category: rule.category, label: rule.label, period: '2026-09',
    dueDate: '2026-09-10', expectedAmount: 90, currency: 'EUR' as const };
  const context = { properties: [property], rentReceivables: [rent], rentPayments: [],
    propertyExpenseRules: [rule], expenseObligations: [obligation], expensePayments: [],
    cashAccounts: imported.accounts, bankTransactions: imported.transactions,
    today: new Date('2026-09-11T12:00:00Z') };
  const incoming = imported.transactions.find((transaction) => transaction.amount > 0)!;
  const outgoing = imported.transactions.find((transaction) => transaction.amount < 0)!;
  assert.equal(suggestBankTransactionMatch(incoming, context)?.targetId, rent.id);
  assert.equal(suggestBankTransactionMatch(outgoing, context)?.targetId, obligation.id);
  const confirmedRent = confirmBankTransactionMatch({ transaction: incoming,
    targetType: 'rent-receivable', targetId: rent.id, reconciliations: [], context });
  assert.equal(confirmedRent?.reconciliations[0].status, 'matched');
  assert.equal(confirmedRent?.rentPayments[0].source, 'bank_sync');
  const confirmedExpense = confirmBankTransactionMatch({ transaction: outgoing,
    targetType: 'expense-obligation', targetId: obligation.id, reconciliations: [], context });
  assert.equal(confirmedExpense?.reconciliations[0].status, 'matched');
  assert.equal(confirmedExpense?.expensePayments[0].source, 'bank_sync');
});

test('Transactions renders imported rows and account filtering uses the imported CashAccount ID', async () => {
  const statement = await parseSantanderSpainXls(workbookBytes());
  const imported = applySantanderStatementImport(statement, [], [], 'synthetic-user', 'EUR', { EUR: 1 });
  const other = createManualCashAccount({ id: 'other-cash-account', nickname: 'Other cash' });
  const otherTransaction = { ...imported.transactions[0], id: 'other-transaction',
    cashAccountId: other.id, description: 'Other synthetic transfer' };
  const props = { transactions: [...imported.transactions, otherTransaction],
    cashAccounts: [...imported.accounts, other], selectedAccountId: imported.account.id,
    onSelectedAccountIdChange: () => undefined, isSyncing: false, language: 'en' as const,
    t: (key: string) => key };
  const html = renderToStaticMarkup(React.createElement(BankTransactionsView, props));
  assert.match(html, /Synthetic rent/);
  assert.match(html, /Synthetic expense/);
  assert.doesNotMatch(html, /Other synthetic transfer/);
});

test('parsing and canonical import make no network request', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests++; throw new Error('unexpected-network-request'); }) as typeof fetch;
  try {
    const statement = await parseSantanderSpainXls(workbookBytes());
    applySantanderStatementImport(statement, [], [], 'synthetic-user', 'EUR', { EUR: 1 });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
