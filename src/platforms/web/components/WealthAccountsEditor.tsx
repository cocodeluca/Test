import React from 'react';
import { Activity, AlertCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  CashAccount,
  InvestmentAccount,
  InvestmentAccountType,
} from '../../../common/types';
import {
  createManualCashAccount,
  getCashAccountBalance,
  getCashAccountDisplayName,
} from '../../../common/utils/cashAccounts';
import { DisplayCurrency } from '../../../common/types/settings';
import { currencyOptions } from '../../../common/utils/currency';
import { getLocalizedCurrencyLabel } from '../../../common/utils/formatting';
import { useSettings } from '../context/SettingsContext';
import { CompactEditModal } from './CompactEditModal';
import {
  appBorderClass,
  appButtonMutedClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface WealthAccountsEditorProps {
  cashAccounts: CashAccount[];
  investmentAccounts: InvestmentAccount[];
  onChangeCashAccounts: (accounts: CashAccount[]) => void;
  onChangeInvestmentAccounts: (accounts: InvestmentAccount[]) => void;
  onConnectEtoroAccount: () => Promise<void>;
  onSyncInvestmentAccount: (accountId: string) => Promise<void>;
  onClose: () => void;
}

const inputClass = appInputClass;

const labelClass = `mb-2 block text-xs font-semibold uppercase tracking-[0.18em] ${appTextMutedClass}`;

const investmentTypes: InvestmentAccountType[] = ['stocks', 'etf', 'broker', 'crypto', 'fund', 'other'];
type WealthEditorSection = 'cash-accounts' | 'investment-accounts' | 'broker-connection';
export const WealthAccountsEditor: React.FC<WealthAccountsEditorProps> = ({
  cashAccounts,
  investmentAccounts,
  onChangeCashAccounts,
  onChangeInvestmentAccounts,
  onConnectEtoroAccount,
  onSyncInvestmentAccount,
  onClose,
}) => {
  const { t } = useSettings();
  const etoroAccount = investmentAccounts.find((account) => account.provider === 'etoro');
  const [editorMode, setEditorMode] = React.useState<'section' | 'full'>('section');
  const [activeSection, setActiveSection] = React.useState<WealthEditorSection>('cash-accounts');
  const showSection = (sectionId: WealthEditorSection) =>
    editorMode === 'full' || activeSection === sectionId;
  const sectionItems = [
    { id: 'cash-accounts', label: 'Cash Accounts' },
    { id: 'investment-accounts', label: 'Investment Accounts' },
    { id: 'broker-connection', label: 'Broker Connection' },
  ] as Array<{ id: WealthEditorSection; label: string }>;

  return (
    <CompactEditModal
      eyebrow="Wealth Inputs"
      title="Edit Manual Accounts"
      subtitle="Use smaller section editors for cash, investments, or broker connection settings."
      onClose={onClose}
      sections={sectionItems}
      activeSection={activeSection}
      onSectionChange={(sectionId) => setActiveSection(sectionId as WealthEditorSection)}
      mode={editorMode}
      onModeChange={setEditorMode}
      sectionWidthClassName="sm:max-w-3xl"
      fullWidthClassName="sm:max-w-5xl"
    >
      <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-6">
          {showSection('cash-accounts') ? (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextMutedClass}`}>
                  {t('dashboard.availableCash')}
                </p>
                <p className={`mt-1 text-sm ${appTextSoftClass}`}>
                  {t('dashboard.manualCashSupport')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeCashAccounts([
                    ...cashAccounts,
                    createManualCashAccount({
                      nickname: `Cash Account ${cashAccounts.length + 1}`,
                      institutionName: 'Manual account',
                      currency: 'EUR',
                    }),
                  ])
                }
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm ${appButtonMutedClass}`}
              >
                <Plus className="h-4 w-4" />
                {t('common.add')}
              </button>
            </div>

            <div className="space-y-4">
              {cashAccounts.map((account) => (
                <div key={account.id} className={`rounded-3xl p-4 ${appPanelInsetClass}`}>
                  <div className="grid gap-4 md:grid-cols-[1fr_160px_120px_auto] md:items-end">
                    <div>
                      <label className={labelClass}>Name</label>
                      <input
                        value={getCashAccountDisplayName(account)}
                        onChange={(event) =>
                          onChangeCashAccounts(
                            cashAccounts.map((item) =>
                              item.id === account.id
                                ? {
                                    ...item,
                                    nickname: event.target.value,
                                    name: event.target.value,
                                    updatedAt: new Date().toISOString(),
                                  }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Balance</label>
                      <input
                        type="number"
                        value={getCashAccountBalance(account)}
                        onChange={(event) =>
                          onChangeCashAccounts(
                            cashAccounts.map((item) =>
                              item.id === account.id
                                ? {
                                    ...item,
                                    currentBalance: Number(event.target.value) || 0,
                                    balance: Number(event.target.value) || 0,
                                    updatedAt: new Date().toISOString(),
                                  }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Currency</label>
                      <select
                        value={account.currency}
                        onChange={(event) =>
                          onChangeCashAccounts(
                            cashAccounts.map((item) =>
                              item.id === account.id
                                ? { ...item, currency: event.target.value as DisplayCurrency }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      >
                        {currencyOptions.map((currency) => (
                          <option key={currency.code} value={currency.code}>
                            {getLocalizedCurrencyLabel(currency.code)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeCashAccounts(cashAccounts.filter((item) => item.id !== account.id))
                      }
                      className={`rounded-2xl p-3 transition ${appButtonMutedClass} ${appTextMutedClass} hover:border-rose-500/40 hover:text-rose-700 dark:hover:text-rose-300`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          ) : null}

          {showSection('broker-connection') ? (
          <section>
            <div className={`mb-4 rounded-3xl border p-4 ${appBorderClass} ${appPanelClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-2xl p-2 ${appPanelInsetClass}`}>
                      <ShieldCheck className="h-4 w-4 text-teal-500" />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${appTextStrongClass}`}>
                        {etoroAccount?.name || t('dashboard.brokerConnection')}
                      </p>
                      <p className={`mt-1 text-xs leading-5 ${appTextSoftClass}`}>
                        {t('dashboard.etoroReadOnlyHelp')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onConnectEtoroAccount()}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm ${appButtonMutedClass}`}
                  >
                    <Activity className="h-4 w-4" />
                    {etoroAccount ? t('dashboard.reconnectEtoro') : t('dashboard.connectEtoro')}
                  </button>
                  {etoroAccount ? (
                    <button
                      type="button"
                      onClick={() => void onSyncInvestmentAccount(etoroAccount.id)}
                      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm ${appButtonMutedClass}`}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t('dashboard.syncNow')}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div className={`rounded-2xl px-3 py-2 ${appPanelInsetClass}`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextMutedClass}`}>
                    {t('dashboard.syncMode')}
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{t('dashboard.readOnly')}</p>
                </div>
                <div className={`rounded-2xl px-3 py-2 ${appPanelInsetClass}`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextMutedClass}`}>
                    {t('dashboard.lastSync')}
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>
                    {etoroAccount?.lastSyncedAt
                      ? new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(etoroAccount.lastSyncedAt))
                      : t('dashboard.notSyncedYet')}
                  </p>
                </div>
                <div className={`rounded-2xl px-3 py-2 ${appPanelInsetClass}`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextMutedClass}`}>
                    {t('dashboard.syncStatus')}
                  </p>
                  <div className={`mt-1 flex items-center gap-2 text-sm font-semibold ${appTextStrongClass}`}>
                    {etoroAccount?.syncStatus === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    )}
                    <span>
                      {etoroAccount?.syncStatus === 'error'
                        ? t('dashboard.syncError')
                        : etoroAccount?.syncStatus === 'syncing'
                        ? t('dashboard.syncing')
                        : etoroAccount?.syncStatus === 'success'
                        ? t('dashboard.connected')
                        : t('dashboard.idle')}
                    </span>
                  </div>
                </div>
              </div>

              {etoroAccount?.syncError ? (
                <p className="mt-3 text-xs leading-5 text-rose-600 dark:text-rose-300">
                  {etoroAccount.syncError}
                </p>
              ) : null}
            </div>
          </section>
          ) : null}

          {showSection('investment-accounts') ? (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextMutedClass}`}>
                  {t('dashboard.investmentsValue')}
                </p>
                <p className={`mt-1 text-sm ${appTextSoftClass}`}>
                  {t('dashboard.manualInvestmentsSupport')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeInvestmentAccounts([
                    ...investmentAccounts,
                    {
                      id: `investment-${Date.now()}`,
                      name: `Investment Account ${investmentAccounts.length + 1}`,
                      balance: 0,
                      currency: 'EUR',
                      isManual: true,
                      type: 'broker',
                      provider: 'manual',
                      syncStatus: 'idle',
                      dailyChangePct: null,
                      lastSyncedAt: null,
                      lastSuccessfulBalance: null,
                      syncError: null,
                    },
                  ])
                }
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm ${appButtonMutedClass}`}
              >
                <Plus className="h-4 w-4" />
                {t('common.add')}
              </button>
            </div>
            <div className="space-y-4">
              {investmentAccounts.map((account) => (
                <div key={account.id} className={`rounded-3xl p-4 ${appPanelInsetClass}`}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelClass}>Name</label>
                      <input
                        value={account.name}
                        onChange={(event) =>
                          onChangeInvestmentAccounts(
                            investmentAccounts.map((item) =>
                              item.id === account.id ? { ...item, name: event.target.value } : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Balance</label>
                      <input
                        type="number"
                        value={account.balance}
                        onChange={(event) =>
                          onChangeInvestmentAccounts(
                            investmentAccounts.map((item) =>
                              item.id === account.id
                                ? { ...item, balance: Number(event.target.value) || 0 }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                      {account.provider === 'etoro' ? (
                        <p className={`mt-2 text-xs leading-5 ${appTextSoftClass}`}>
                          {t('dashboard.manualFallbackBalanceHelp')}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className={labelClass}>Currency</label>
                      <select
                        value={account.currency}
                        onChange={(event) =>
                          onChangeInvestmentAccounts(
                            investmentAccounts.map((item) =>
                              item.id === account.id
                                ? { ...item, currency: event.target.value as DisplayCurrency }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      >
                        {currencyOptions.map((currency) => (
                          <option key={currency.code} value={currency.code}>
                            {getLocalizedCurrencyLabel(currency.code)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Type</label>
                      <select
                        value={account.type ?? 'other'}
                        onChange={(event) =>
                          onChangeInvestmentAccounts(
                            investmentAccounts.map((item) =>
                              item.id === account.id
                                ? { ...item, type: event.target.value as InvestmentAccountType }
                                : item
                            )
                          )
                        }
                        className={inputClass}
                      >
                        {investmentTypes.map((type) => (
                          <option key={type} value={type}>
                            {type.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      {account.provider === 'etoro' ? (
                        <button
                          type="button"
                          onClick={() => void onSyncInvestmentAccount(account.id)}
                          className={`rounded-2xl p-3 transition ${appButtonMutedClass} ${appTextMutedClass}`}
                          title={t('dashboard.syncNow')}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          onChangeInvestmentAccounts(
                            investmentAccounts.filter((item) => item.id !== account.id)
                          )
                        }
                        className={`rounded-2xl p-3 transition ${appButtonMutedClass} ${appTextMutedClass} hover:border-rose-500/40 hover:text-rose-700 dark:hover:text-rose-300`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
              >
                {t('common.save')}
              </button>
            </div>
          </section>
          ) : null}
      </div>
    </CompactEditModal>
  );
};
