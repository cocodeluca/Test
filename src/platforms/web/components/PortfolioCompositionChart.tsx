import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { DisplayCurrency } from '../../../common/types/settings';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { formatPercentage, formatPortfolioDisplayCurrency } from '../../../common/utils/formatting';
import { resolveDisplayCurrency } from '../../../common/utils/metricCurrency';
import { useSettings } from '../context/SettingsContext';
import {
  chartDotRingClass,
  chartTooltipSurfaceClass,
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardSurfaceClass,
} from '../styles/dashboardTheme';

export interface CompositionChartSegment {
  key: string;
  name: string;
  value: number;
  color: string;
  helperText?: string;
}

interface PortfolioCompositionChartProps {
  title: string;
  subtitle: string;
  centerLabel: string;
  centerValue: number;
  segments: CompositionChartSegment[];
  displayCurrency?: DisplayCurrency;
  compact?: boolean;
  insightTitle?: string;
  insightBullets?: string[];
  insightTone?: 'neutral' | 'success';
}

const getBalancedCenterLabelLines = (label: string): string[] => {
  const normalizedLabel = label.trim();
  const words = normalizedLabel.split(/\s+/).filter(Boolean);

  if (words.length <= 1 || normalizedLabel.length <= 16) {
    return [normalizedLabel];
  }

  if (words.length === 2) {
    return words;
  }

  return [words[0], words.slice(1).join(' ')];
};

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const insightToneClassMap = {
  neutral: 'border-[rgba(148,163,184,0.18)] bg-[rgba(248,250,252,0.92)] text-[#334155]',
  success: 'border-[rgba(34,197,94,0.16)] bg-[rgba(240,253,244,0.92)] text-[#166534]',
} as const;

export const PortfolioCompositionChart: React.FC<PortfolioCompositionChartProps> = ({
  title,
  subtitle,
  centerLabel,
  centerValue,
  segments,
  displayCurrency,
  compact = false,
  insightTitle,
  insightBullets = [],
  insightTone = 'neutral',
}) => {
  const { settings } = useSettings();
  const fxRates = getSettingsCurrencyRates(settings);
  const resolvedCurrency =
    displayCurrency ?? resolveDisplayCurrency({ domain: 'value', settings });
  const formatAmount = (value: number) =>
    formatPortfolioDisplayCurrency(value, resolvedCurrency, 'valuation', {
      reportingCurrency: resolveDisplayCurrency({ domain: 'reporting', settings }),
      rateOverrides: fxRates,
    });
  const safeTotal = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  const data = segments.map((segment) => ({
    ...segment,
    percentage: safeTotal === 0 ? 0 : (Math.max(segment.value, 0) / safeTotal) * 100,
  }));
  const centerLabelLines = getBalancedCenterLabelLines(centerLabel);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) {
      return null;
    }

    const item = payload[0]?.payload;

    return (
      <div className={`min-w-[168px] rounded-[18px] px-4 py-3 ${chartTooltipSurfaceClass}`}>
        <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>{item.name}</p>
        <p className={`mt-1 text-[14px] ${dashboardLightMutedTextClass}`}>{formatAmount(item.value)}</p>
        <p className={`mt-1 text-[12px] ${dashboardLightMutedTextClass}`}>{formatPercentage(item.percentage, 1)}</p>
      </div>
    );
  };

  const contentClassName = compact
    ? 'grid gap-4 lg:grid-cols-[minmax(220px,0.95fr)_minmax(0,1.05fr)] lg:items-center'
    : 'grid gap-5 lg:grid-cols-[minmax(260px,0.92fr)_minmax(0,1.08fr)] lg:items-center';

  return (
    <div className={`flex h-full flex-col rounded-[28px] border border-[var(--dashboard-border)] ${dashboardSurfaceClass} ${compact ? 'px-5 py-4' : 'p-5'}`}>
      <div>
        <p className={`text-[1rem] font-semibold ${dashboardLightValueClass}`}>{title}</p>
        <p className={`mt-1 text-[13px] leading-5 ${dashboardLightMutedTextClass}`}>{subtitle}</p>
      </div>

      <div className={`mt-4 ${contentClassName}`}>
        <div className={`relative ${compact ? 'mx-auto h-[188px] w-[188px] sm:h-[206px] sm:w-[206px]' : 'mx-auto h-[228px] w-[228px]'}`}>
          <div className="pointer-events-none absolute inset-[16%] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.08)_0%,rgba(255,255,255,0)_72%)]" />
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={compact ? 58 : 70}
                outerRadius={compact ? 86 : 102}
                paddingAngle={2}
                stroke="var(--dashboard-chart-stroke)"
                strokeWidth={compact ? 3 : 5}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={<CustomTooltip />}
                cursor={false}
                offset={20}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ pointerEvents: 'none', zIndex: 20 }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <div className="space-y-0.5">
              {centerLabelLines.map((line) => (
                <p key={line} className={`text-[11px] font-semibold leading-[1.15] ${dashboardLightLabelClass}`}>
                  {line}
                </p>
              ))}
            </div>
            <p className={`mt-2 max-w-[134px] text-[1.05rem] font-bold tracking-tight sm:max-w-[152px] sm:text-[1.18rem] ${dashboardLightValueClass}`}>
              {formatAmount(centerValue)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {data.map((item) => (
            <div
              key={item.key}
              className="rounded-[18px] border px-4 py-3"
              style={{
                borderColor: hexToRgba(item.color, 0.16),
                backgroundColor: hexToRgba(item.color, 0.07),
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${chartDotRingClass}`}
                    style={{ backgroundColor: item.color }}
                  />
                  <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>{item.name}</p>
                </div>
                <p className={`text-[13px] font-medium ${dashboardLightMutedTextClass}`}>
                  {formatPercentage(item.percentage, 1)} · {formatAmount(item.value)}
                </p>
              </div>
              {item.helperText ? (
                <p className={`mt-1.5 text-[12px] leading-5 ${dashboardLightMutedTextClass}`}>{item.helperText}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {insightTitle && insightBullets.length > 0 ? (
        <div className={`mt-4 rounded-[20px] border px-4 py-3 ${insightToneClassMap[insightTone]}`}>
          <p className="text-[14px] font-semibold">{insightTitle}</p>
          <ul className="mt-2 space-y-1.5 pl-4 text-[12px] leading-5">
            {insightBullets.map((bullet) => (
              <li key={`${title}-${bullet}`}>{bullet}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
