import React from 'react';
import { AlertCircle, ArrowRight, BellRing, CalendarClock, CheckCircle2 } from 'lucide-react';
import type { PortfolioAlert } from '../../../common/utils/alerts';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonMutedClass,
  dashboardLightCardClass,
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardSurfaceClass,
} from '../styles/dashboardTheme';

interface AlertCenterWidgetProps {
  alerts: PortfolioAlert[];
  onOpenProperties: () => void;
}

const severityClasses: Record<PortfolioAlert['severity'], string> = {
  urgent: 'bg-rose-50 text-rose-700 border-rose-100',
  upcoming: 'bg-amber-50 text-amber-700 border-amber-100',
  info: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const AlertCenterWidget: React.FC<AlertCenterWidgetProps> = ({
  alerts,
  onOpenProperties,
}) => {
  const { settings, t } = useSettings();
  const languageDateLocale =
    settings.language === 'es' ? 'es-ES' : settings.language === 'pt' ? 'pt-PT' : 'en-US';
  const visibleAlerts = alerts.slice(0, 5);
  const attentionCount = alerts.filter((alert) => alert.category === 'attention').length;
  const upcomingCount = alerts.filter((alert) => alert.category === 'upcoming').length;
  const severityLabels = {
    urgent: t('dashboardUi.alertsSeverityUrgent'),
    upcoming: t('dashboardUi.alertsSeverityUpcoming'),
    info: t('dashboardUi.alertsSeverityInfo'),
  } as const;

  const formatDate = (value?: string) => {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat(languageDateLocale, {
      day: 'numeric',
      month: 'short',
    }).format(date);
  };

  const formatTiming = (alert: PortfolioAlert) => {
    if (typeof alert.daysUntil !== 'number') {
      return null;
    }

    if (alert.daysUntil < 0) {
      return t('dashboardUi.alertsOverdueDays', { count: Math.abs(alert.daysUntil) });
    }

    if (alert.daysUntil === 0) {
      return t('dashboardUi.alertsToday');
    }

    return t('dashboardUi.alertsInDays', { count: alert.daysUntil });
  };

  const getActionLabel = (alert: PortfolioAlert) => {
    switch (alert.action) {
      case 'review-rent':
        return t('dashboardUi.alertsActionReviewRent');
      case 'review-lease':
        return t('dashboardUi.alertsActionReviewLease');
      case 'review-insurance':
        return t('dashboardUi.alertsActionReviewInsurance');
      case 'complete-data':
        return t('dashboardUi.alertsActionCompleteData');
      default:
        return t('common.edit');
    }
  };

  const getAlertTitle = (alert: PortfolioAlert) => {
    switch (alert.kind) {
      case 'rent-update-upcoming':
        return t('dashboardUi.alertsRentUpdateTitle');
      case 'lease-ending':
        return t('dashboardUi.alertsLeaseEndingTitle');
      case 'lease-expired':
        return t('dashboardUi.alertsLeaseExpiredTitle');
      case 'insurance-ending':
        return t('dashboardUi.alertsInsuranceEndingTitle');
      case 'missing-lease-end-date':
        return t('dashboardUi.alertsMissingDataTitle');
      default:
        return t('dashboardUi.alertsTitle');
    }
  };

  const getAlertMessage = (alert: PortfolioAlert) => {
    switch (alert.kind) {
      case 'rent-update-upcoming':
        return t('dashboardUi.alertsRentUpdateBody');
      case 'lease-ending':
        return t('dashboardUi.alertsLeaseEndingBody');
      case 'lease-expired':
        return t('dashboardUi.alertsLeaseExpiredBody');
      case 'insurance-ending':
        return t('dashboardUi.alertsInsuranceEndingBody');
      case 'missing-lease-end-date':
        return t('dashboardUi.alertsMissingLeaseEndDateBody');
      default:
        return '';
    }
  };

  return (
    <section className={`${dashboardSurfaceClass} ${dashboardLightCardClass} rounded-[28px] p-5 sm:p-6`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-2.5 text-slate-600">
              <BellRing className="h-4.5 w-4.5" />
            </div>
            <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
              {t('dashboardUi.alertsEyebrow')}
            </p>
          </div>
          <h2 className={`mt-3 text-[1.18rem] font-semibold tracking-tight ${dashboardLightValueClass}`}>
            {t('dashboardUi.alertsTitle')}
          </h2>
          <p className={`mt-2 max-w-2xl text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>
            {t('dashboardUi.alertsBody')}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-[18px] border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] px-4 py-3">
            <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>{t('dashboardUi.alertsPending')}</p>
            <p className={`mt-2 text-lg font-semibold ${dashboardLightValueClass}`}>{alerts.length}</p>
          </div>
          <div className="rounded-[18px] border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] px-4 py-3">
            <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>{t('dashboardUi.alertsNeedsAttention')}</p>
            <p className="mt-2 text-lg font-semibold text-rose-700">{attentionCount}</p>
          </div>
          <div className="rounded-[18px] border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] px-4 py-3">
            <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>{t('dashboardUi.alertsUpcomingActions')}</p>
            <p className="mt-2 text-lg font-semibold text-amber-700">{upcomingCount}</p>
          </div>
        </div>
      </div>

      {visibleAlerts.length > 0 ? (
        <div className="mt-6 space-y-3">
          {visibleAlerts.map((alert) => {
            const dueDateLabel = formatDate(alert.dueDate);
            const timingLabel = formatTiming(alert);

            return (
              <div
                key={alert.id}
                className="flex flex-col gap-4 rounded-[22px] border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-[15px] font-semibold ${dashboardLightValueClass}`}>{getAlertTitle(alert)}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityClasses[alert.severity]}`}>
                      {severityLabels[alert.severity]}
                    </span>
                  </div>
                  <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${dashboardLightMutedTextClass}`}>
                    <span>{alert.propertyName}</span>
                    <span>·</span>
                    <span>{alert.propertyLocation}</span>
                    {timingLabel ? (
                      <>
                        <span>·</span>
                        <span>{timingLabel}</span>
                      </>
                    ) : null}
                    {dueDateLabel ? (
                      <>
                        <span>·</span>
                        <span>{dueDateLabel}</span>
                      </>
                    ) : null}
                  </div>
                  <p className={`mt-2 text-[13px] leading-6 ${dashboardLightMutedTextClass}`}>{getAlertMessage(alert)}</p>
                </div>

                <button
                  type="button"
                  onClick={onOpenProperties}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${dashboardLightValueClass}`}
                >
                  {alert.severity === 'urgent' ? <AlertCircle className="h-4 w-4" /> : alert.severity === 'upcoming' ? <CalendarClock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>{getActionLabel(alert)}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[22px] border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] px-5 py-8 text-center">
          <p className={`text-[15px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.alertsEmptyTitle')}</p>
          <p className={`mx-auto mt-2 max-w-xl text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>
            {t('dashboardUi.alertsEmptyBody')}
          </p>
        </div>
      )}
    </section>
  );
};
