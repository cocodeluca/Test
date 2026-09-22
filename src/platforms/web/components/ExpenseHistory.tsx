import React, { useMemo } from 'react';
import type { ExpenseObligation, ExpensePayment, Property, PropertyExpenseRule } from '../../../common/types';
import { buildExpenseObligationViews, generateExpenseObligations } from '../../../common/utils/propertyExpenses';
import { toCivilDate as toCivilDateParts } from '../../../common/utils/civilDate';
import { formatCurrencyValue } from '../../../common/utils/formatting';
import { useSettings } from '../context/SettingsContext';
import { appTextMutedClass, appTextStrongClass } from '../styles/dashboardTheme';

const toCivilDate = (date: Date) => { const value = toCivilDateParts(date); return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`; };

export const ExpenseHistory: React.FC<{ property: Property; rules: PropertyExpenseRule[]; obligations: ExpenseObligation[]; payments: ExpensePayment[] }> = ({ property, rules, obligations, payments }) => {
  const { settings, t } = useSettings();
  const title = settings.language === 'es' ? 'Historial de gastos' : settings.language === 'pt' ? 'Histórico de despesas' : 'Expense history';
  const empty = settings.language === 'es' ? 'Todavía no hay gastos operativos controlados.' : settings.language === 'pt' ? 'Ainda não existem despesas operacionais controladas.' : 'No tracked operating expenses yet.';
  const views = useMemo(() => buildExpenseObligationViews(generateExpenseObligations(rules.filter((r) => r.propertyId === property.id), [property], obligations.filter((o) => o.propertyId === property.id), { throughDate: toCivilDate(new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate(), 12)) }), payments), [property, rules, obligations, payments]);
  const rows = [...views].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 8);
  return <div className="mt-4 border-t border-[var(--app-border)] pt-4" data-property-expense-history><h4 className={`text-sm font-semibold ${appTextStrongClass}`}>{title}</h4>{rows.length ? <div className="mt-2 divide-y divide-[var(--app-border)]">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 py-2"><div><p className={`text-sm font-medium ${appTextStrongClass}`}>{row.id.startsWith('bank-expense:') ? t(`cashAccounts.expenseCategory.${row.category}`) : row.label}</p><p className={`text-xs ${appTextMutedClass}`}>{row.period ?? row.dueDate} · {row.status}</p></div><p className={`text-sm font-semibold ${appTextStrongClass}`}>{formatCurrencyValue(row.expectedAmount, row.currency)}</p></div>)}</div> : <p className={`mt-2 text-sm ${appTextMutedClass}`}>{empty}</p>}<p className={`mt-3 text-xs ${appTextMutedClass}`}>{rules.filter((r) => r.propertyId === property.id && r.isActive).length} {settings.language === 'es' ? 'reglas recurrentes activas' : settings.language === 'pt' ? 'regras recorrentes ativas' : 'active recurring rules'}</p></div>;
};
