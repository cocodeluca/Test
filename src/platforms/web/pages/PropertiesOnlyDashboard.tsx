import React, { useMemo } from 'react';
import {
  BadgePercent,
  BellRing,
  Building,
  Building2,
  CalendarDays,
  ChevronRight,
  LayoutGrid,
  MapPin,
  RefreshCcw,
  ShieldCheck,
  Target,
  TrendingUp,
  CircleDollarSign,
} from 'lucide-react';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Property } from '../../../common/types';
import { formatCurrencyValue, formatPercentage } from '../../../common/utils/formatting';
import {
  dashboardLightIconChipClass,
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardMetricToneClass,
} from '../styles/dashboardTheme';

interface PropertyEventItem {
  id: string;
  date: string;
  title: string;
  propertyName: string;
  statusLabel: string;
  tone: 'blue' | 'amber' | 'red' | 'green';
}

const baseCardClassName =
  'dashboard-card rounded-[28px] border border-[var(--dashboard-border)] bg-[var(--dashboard-card-surface)] shadow-[0_24px_54px_-42px_rgba(15,23,42,0.18)]';

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value));

const formatEventDay = (dateString: string) => new Intl.DateTimeFormat('es-ES', { day: '2-digit' }).format(new Date(dateString));
const formatEventMonth = (dateString: string) =>
  new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date(dateString)).toUpperCase();

const formatRelativeDays = (dateString: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'En 1 día';
  return `En ${diffDays} días`;
};

const ProgressBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[rgba(148,163,184,0.22)]">
    <div className="h-full rounded-full" style={{ width: `${clampPercentage(value)}%`, backgroundColor: color }} />
  </div>
);

const SectionCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`${baseCardClassName} ${className}`}>{children}</div>
);

const PropertyHeaderBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.08)] px-3 py-1 text-[12px] font-semibold text-[#255f99]">
    {children}
  </span>
);

const HeroKpiCard: React.FC<{
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  toneClassName?: string;
  deltaText?: string;
  deltaToneClassName?: string;
}> = ({ title, value, subtitle, icon, toneClassName = dashboardMetricToneClass.default, deltaText, deltaToneClassName = dashboardMetricToneClass.success }) => (
  <div className={`${baseCardClassName} h-full px-6 py-5`}>
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>{title}</p>
          <p className={`mt-3 text-[2.6rem] font-bold leading-none tracking-[-0.04em] ${toneClassName}`}>{value}</p>
        </div>
        <div className={`${dashboardLightIconChipClass} flex h-11 w-11 items-center justify-center rounded-[16px]`}>{icon}</div>
      </div>
      <div className="space-y-2.5">
        {deltaText ? <div className={`text-[14px] font-semibold ${deltaToneClassName}`}>{deltaText}</div> : null}
        <p className={`max-w-[34rem] text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>{subtitle}</p>
      </div>
    </div>
  </div>
);

const DoughnutSummary: React.FC<{ slices: Array<{ name: string; value: number; color: string }>; centerLabel: string; centerValue: string }> = ({ slices, centerLabel, centerValue }) => (
  <div className="relative h-[260px]">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius={76} outerRadius={108} paddingAngle={3} stroke="var(--dashboard-chart-stroke)" strokeWidth={5}>
          {slices.map((slice) => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatCurrencyValue(value, 'EUR', { maximumFractionDigits: 0 })} />
      </PieChart>
    </ResponsiveContainer>
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
      <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${dashboardLightLabelClass}`}>{centerLabel}</p>
      <p className={`mt-3 text-[1.7rem] font-semibold tracking-tight ${dashboardLightValueClass}`}>{centerValue}</p>
    </div>
  </div>
);

export const PropertiesOnlyDashboard: React.FC<{ properties: Property[] }> = ({ properties }) => {
  const propertyOnlyMetrics = useMemo(() => {
    const occupiedCount = properties.filter((property) => property.occupancyStatus === 'occupied').length;
    const vacantCount = Math.max(properties.length - occupiedCount, 0);
    const totalValue = properties.reduce((sum, property) => sum + property.currentEstimatedValue, 0);
    const grossRent = properties.reduce((sum, property) => sum + property.monthlyRent, 0);
    const operatingExpenses = properties.reduce((sum, property) => sum + property.totalOperatingExpensesMonthly, 0);
    const netCashflow = grossRent - operatingExpenses;
    const grossYield = totalValue > 0 ? (grossRent * 12 / totalValue) * 100 : 0;
    const occupancyRate = properties.length > 0 ? (occupiedCount / properties.length) * 100 : 0;

    const cityGroups = properties.reduce<Record<string, { value: number }>>((accumulator, property) => {
      accumulator[property.city] = { value: (accumulator[property.city]?.value ?? 0) + property.currentEstimatedValue };
      return accumulator;
    }, {});

    const citySlices = Object.entries(cityGroups)
      .map(([name, data], index) => ({
        name,
        value: data.value,
        color: ['#1f5f9d', '#4d7ea8', '#7aa0bf', '#9fbed2', '#c5d8e3'][index % 5],
      }))
      .sort((a, b) => b.value - a.value);

    const rentableProperties = [...properties]
      .map((property) => ({
        ...property,
        grossYield: property.currentEstimatedValue > 0 ? (property.monthlyRent * 12 / property.currentEstimatedValue) * 100 : 0,
      }))
      .sort((left, right) => right.grossYield - left.grossYield);

    const leaseEvents = properties.flatMap((property) => {
      const events: PropertyEventItem[] = [];
      if (property.leaseEndDate) {
        events.push({
          id: `${property.id}-lease-end`,
          date: property.leaseEndDate,
          title: 'Renovación de contrato',
          propertyName: property.name,
          statusLabel: formatRelativeDays(property.leaseEndDate),
          tone: 'blue',
        });
      }
      if (property.lastRentUpdateDate) {
        const nextReview = new Date(property.lastRentUpdateDate);
        nextReview.setMonth(nextReview.getMonth() + 6);
        const nextReviewIso = nextReview.toISOString();
        events.push({
          id: `${property.id}-rent-review`,
          date: nextReviewIso,
          title: 'Actualización de renta',
          propertyName: property.name,
          statusLabel: formatRelativeDays(nextReviewIso),
          tone: 'amber',
        });
      }
      if (property.occupancyStatus === 'vacant') {
        events.push({
          id: `${property.id}-vacancy`,
          date: new Date().toISOString(),
          title: 'Propiedad vacía',
          propertyName: property.name,
          statusLabel: 'Urgente',
          tone: 'red',
        });
      }
      if (property.leases?.some((lease) => lease.active && lease.endDate)) {
        const activeLease = property.leases.find((lease) => lease.active && lease.endDate);
        if (activeLease?.endDate) {
          events.push({
            id: `${property.id}-contract-review`,
            date: activeLease.endDate,
            title: 'Revisión de contrato',
            propertyName: property.name,
            statusLabel: formatRelativeDays(activeLease.endDate),
            tone: 'green',
          });
        }
      }
      return events;
    });

    return {
      occupiedCount,
      vacantCount,
      totalValue,
      grossRent,
      operatingExpenses,
      netCashflow,
      grossYield,
      occupancyRate,
      citySlices,
      rentableProperties: rentableProperties.slice(0, 5),
      upcomingEvents: leaseEvents.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()).slice(0, 4),
    };
  }, [properties]);

  const occupancyColor = propertyOnlyMetrics.occupancyRate >= 80 ? '#16a34a' : '#f59e0b';
  const occupancySlices = [
    { name: 'Ocupadas', value: propertyOnlyMetrics.occupiedCount, color: '#1f5f9d' },
    { name: 'Vacantes', value: propertyOnlyMetrics.vacantCount, color: '#d6e2ec' },
  ].filter((slice) => slice.value > 0);

  return (
    <div className="space-y-5 pb-2">
      <section className={`${baseCardClassName} px-6 py-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={`text-[13px] font-semibold ${dashboardLightLabelClass}`}>Dashboard</p>
            <h1 className={`mt-2 text-[1.55rem] font-semibold tracking-tight ${dashboardLightValueClass}`}>Seguimiento de propiedades</h1>
            <p className={`mt-2 max-w-2xl text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>Vista centrada en ingresos, ocupación y próximos hitos operativos de tu cartera inmobiliaria.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PropertyHeaderBadge>Modo: Solo propiedades</PropertyHeaderBadge>
            <button className="inline-flex items-center gap-2 rounded-full border border-[var(--dashboard-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--dashboard-text-default)]">
              <CalendarDays className="h-4 w-4" />
              Últimos 30 días
            </button>
            <button className="inline-flex items-center gap-2 rounded-full bg-[var(--app-button-primary-bg)] px-4 py-2 text-sm font-semibold text-white">
              <Building className="h-4 w-4" />
              Añadir propiedad
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3.5 xl:grid-cols-4">
        <HeroKpiCard title="Valor total propiedades" value={formatCurrencyValue(propertyOnlyMetrics.totalValue, 'EUR', { maximumFractionDigits: 0 })} subtitle="Valor estimado agregado de todas las propiedades." icon={<Building2 className="h-5 w-5" />} toneClassName={dashboardMetricToneClass.default} />
        <HeroKpiCard title="Alquiler mensual bruto" value={formatCurrencyValue(propertyOnlyMetrics.grossRent, 'EUR', { maximumFractionDigits: 0 })} subtitle="Ingresos mensuales antes de gastos y vacancia." icon={<CircleDollarSign className="h-5 w-5" />} toneClassName={dashboardMetricToneClass.success} deltaText="Cartera estable" />
        <HeroKpiCard title="Gastos operativos mensuales" value={formatCurrencyValue(propertyOnlyMetrics.operatingExpenses, 'EUR', { maximumFractionDigits: 0 })} subtitle="Comunidad, mantenimiento, impuestos y otros costes recurrentes." icon={<Target className="h-5 w-5" />} toneClassName={dashboardMetricToneClass.warning} />
        <HeroKpiCard title="Cashflow neto alquileres" value={formatCurrencyValue(propertyOnlyMetrics.netCashflow, 'EUR', { maximumFractionDigits: 0 })} subtitle="Resultado neto de rentas menos gastos operativos." icon={<TrendingUp className="h-5 w-5" />} toneClassName={propertyOnlyMetrics.netCashflow >= 0 ? dashboardMetricToneClass.success : dashboardMetricToneClass.danger} deltaText={formatPercentage(propertyOnlyMetrics.grossYield)} deltaToneClassName={dashboardMetricToneClass.info} />
      </section>

      <section className="grid gap-3.5 xl:grid-cols-4">
        <SectionCard className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>Propiedades ocupadas</p>
              <p className={`mt-2 text-[2.05rem] font-bold tracking-[-0.04em] ${dashboardLightValueClass}`}>{propertyOnlyMetrics.occupiedCount} de {properties.length}</p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>{propertyOnlyMetrics.occupiedCount} ocupadas y {propertyOnlyMetrics.vacantCount} vacantes</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px]`}><LayoutGrid className="h-5 w-5" /></div>
          </div>
          <div className="mt-4"><ProgressBar value={propertyOnlyMetrics.occupancyRate} color={occupancyColor} /></div>
        </SectionCard>
        <SectionCard className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>Rentabilidad media bruta</p>
              <p className={`mt-2 text-[2.05rem] font-bold tracking-[-0.04em] ${dashboardMetricToneClass.info}`}>{formatPercentage(propertyOnlyMetrics.grossYield)}</p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>Rendimiento anualizado sobre valor de mercado.</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px] bg-[rgba(37,99,235,0.08)] text-[#2563eb]`}><BadgePercent className="h-5 w-5" /></div>
          </div>
          <div className="mt-4 h-[82px] rounded-[16px] bg-[linear-gradient(180deg,rgba(37,99,235,0.12),rgba(37,99,235,0.02))]" />
        </SectionCard>
        <SectionCard className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>Distribución por ciudad</p>
              <p className={`mt-2 text-[13px] ${dashboardLightMutedTextClass}`}>Valor de cartera agrupado por ubicación.</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px] bg-[rgba(22,163,74,0.08)] text-[#15803d]`}><MapPin className="h-5 w-5" /></div>
          </div>
          <DoughnutSummary slices={propertyOnlyMetrics.citySlices} centerLabel="Valor" centerValue={formatCurrencyValue(propertyOnlyMetrics.totalValue, 'EUR', { maximumFractionDigits: 0 })} />
        </SectionCard>
        <SectionCard className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>Próximos eventos</p>
              <p className={`mt-2 text-[13px] ${dashboardLightMutedTextClass}`}>Renovaciones, revisiones y alertas operativas próximas.</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px] bg-[rgba(248,181,73,0.12)] text-[#c0841e]`}><BellRing className="h-5 w-5" /></div>
          </div>
          <div className="mt-4 space-y-3">
            {propertyOnlyMetrics.upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-[18px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.8)] px-3 py-3">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[16px] border border-[var(--dashboard-border)] bg-white text-center">
                  <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--dashboard-text-label)]">{formatEventMonth(event.date)}</span>
                  <span className="text-[16px] font-bold tracking-tight text-[var(--dashboard-text-strong)]">{formatEventDay(event.date)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>{event.title}</p>
                  <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>{event.propertyName}</p>
                </div>
                <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${event.tone === 'red' ? 'bg-[rgba(239,68,68,0.12)] text-[#b91c1c]' : event.tone === 'amber' ? 'bg-[rgba(245,158,11,0.12)] text-[#b45309]' : event.tone === 'green' ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d]' : 'bg-[rgba(37,99,235,0.12)] text-[#1d4ed8]'}`}>{event.statusLabel}</span>
              </div>
            ))}
          </div>
          <button className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#1d4ed8]">
            Ver calendario completo <ChevronRight className="h-4 w-4" />
          </button>
        </SectionCard>
      </section>

      <section className="grid gap-3.5 xl:grid-cols-3">
        <SectionCard className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>Desglose de alquileres (mensual bruto)</p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>Aporte mensual por propiedad y ubicación.</p>
            </div>
            <RefreshCcw className="h-4 w-4 text-[var(--dashboard-text-soft)]" />
          </div>
          <div className="mt-5 space-y-4">
            {properties.map((property) => {
              const share = propertyOnlyMetrics.grossRent > 0 ? (property.monthlyRent / propertyOnlyMetrics.grossRent) * 100 : 0;
              return (
                <div key={property.id}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <div><p className={`font-semibold ${dashboardLightValueClass}`}>{property.name}</p><p className={`mt-0.5 ${dashboardLightMutedTextClass}`}>{property.city}</p></div>
                    <p className={`font-semibold ${dashboardLightValueClass}`}>{formatCurrencyValue(property.monthlyRent, 'EUR', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="mt-2"><ProgressBar value={share} color="#1f5f9d" /></div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-[var(--dashboard-border)] pt-4 text-sm font-semibold">
            <span className={dashboardLightLabelClass}>Total bruto mensual</span>
            <span className={dashboardLightValueClass}>{formatCurrencyValue(propertyOnlyMetrics.grossRent, 'EUR', { maximumFractionDigits: 0 })}</span>
          </div>
        </SectionCard>
        <SectionCard className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>Top propiedades</p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>Ranking por rentabilidad bruta.</p>
            </div>
            <TrendingUp className="h-4 w-4 text-[var(--dashboard-text-soft)]" />
          </div>
          <div className="mt-5 space-y-3">
            {propertyOnlyMetrics.rentableProperties.map((property, index) => (
              <div key={property.id} className="flex items-center gap-3 rounded-[18px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.8)] px-3 py-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-[linear-gradient(135deg,#dfeaf3,#f7fafc)] text-sm font-bold text-[#1d4ed8]">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[14px] font-semibold ${dashboardLightValueClass}`}>{property.name}</p>
                  <p className={`mt-0.5 text-[12px] ${dashboardLightMutedTextClass}`}>{property.city}</p>
                </div>
                <div className="text-right">
                  <p className={`text-[13px] font-semibold ${dashboardMetricToneClass.success}`}>{formatPercentage(property.grossYield)}</p>
                  <p className={`mt-0.5 text-[12px] ${dashboardLightMutedTextClass}`}>{formatCurrencyValue(property.monthlyRent, 'EUR', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>Ocupación y vacancia</p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>Distribución operativa de la cartera.</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-[var(--dashboard-text-soft)]" />
          </div>
          <div className="mt-4">
            <DoughnutSummary slices={occupancySlices} centerLabel="Ocupación" centerValue={formatPercentage(propertyOnlyMetrics.occupancyRate)} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[13px]">
            <span className={dashboardLightMutedTextClass}>Ocupadas: {propertyOnlyMetrics.occupiedCount}</span>
            <span className={dashboardLightMutedTextClass}>Vacantes: {propertyOnlyMetrics.vacantCount}</span>
          </div>
          <div className="mt-4 rounded-[18px] border border-[rgba(34,197,94,0.18)] bg-[rgba(236,253,245,0.92)] px-4 py-3 text-[#166534]">
            <p className="text-[13px] font-semibold">Excelente nivel de ocupación</p>
            <p className="mt-1 text-[12px] leading-5">La cartera mantiene un flujo estable con vacancias controladas.</p>
          </div>
        </SectionCard>
      </section>
    </div>
  );
};
