import type {
  AppSettings,
  DisplayCurrency,
  FxRateRecord,
  FxSnapshot,
  FxSnapshotStatus,
} from '../types/settings';

export type { FxRateRecord, FxSnapshot, FxSnapshotStatus } from '../types/settings';

export interface FxSyncResult {
  nextSettings: AppSettings;
  warning: string | null;
  usedCachedRates: boolean;
  shouldRefresh: boolean;
  activeSnapshot: FxSnapshot | null;
}

type PartialFxSettings = Pick<
  AppSettings,
  | 'usdToEurRate'
  | 'arsToEurRate'
  | 'usdToEurRateUpdatedAt'
  | 'arsToEurRateUpdatedAt'
  | 'usdToEurRateSource'
  | 'arsToEurRateSource'
  | 'fxRatesFetchedAt'
  | 'fxSnapshot'
>;

const DEFAULT_ARS_TO_EUR_RATE = 0.00092;
const DEFAULT_USD_TO_EUR_RATE = 0.92;
const DEFAULT_GBP_TO_EUR_RATE = 1.17;
export const FX_SUPPORTED_CURRENCIES: DisplayCurrency[] = ['EUR', 'USD', 'ARS', 'GBP'];

const isPositiveNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isValidIsoTimestamp = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
};

const getSnapshotRateRecord = (
  snapshot: FxSnapshot,
  quoteCurrency: DisplayCurrency
): FxRateRecord | undefined =>
  snapshot.rates.find(
    (record) =>
      record.baseCurrency === snapshot.baseCurrency && record.quoteCurrency === quoteCurrency
  );

const buildRateRecord = (
  baseCurrency: DisplayCurrency,
  quoteCurrency: DisplayCurrency,
  rate: number
): FxRateRecord => ({
  baseCurrency,
  quoteCurrency,
  rate,
});

const getDefaultEurRate = (currency: DisplayCurrency): number => {
  if (currency === 'USD') return DEFAULT_USD_TO_EUR_RATE;
  if (currency === 'ARS') return DEFAULT_ARS_TO_EUR_RATE;
  if (currency === 'GBP') return DEFAULT_GBP_TO_EUR_RATE;
  return 1;
};

const buildSnapshotRateMap = (snapshot: FxSnapshot): Record<DisplayCurrency, number> => {
  const eurQuoteRate = getSnapshotRateRecord(snapshot, 'EUR')?.rate;

  return FX_SUPPORTED_CURRENCIES.reduce<Record<DisplayCurrency, number>>(
    (rates, currency) => {
      const quoteRate = getSnapshotRateRecord(snapshot, currency)?.rate;
      rates[currency] =
        isPositiveNumber(eurQuoteRate) && isPositiveNumber(quoteRate)
          ? eurQuoteRate / quoteRate
          : getDefaultEurRate(currency);
      return rates;
    },
    { EUR: 1, USD: DEFAULT_USD_TO_EUR_RATE, ARS: DEFAULT_ARS_TO_EUR_RATE, GBP: DEFAULT_GBP_TO_EUR_RATE }
  );
};

export const formatFxTimestampUtc = (value: string): string => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  const year = parsedDate.getUTCFullYear();
  const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getUTCDate()).padStart(2, '0');
  const hours = String(parsedDate.getUTCHours()).padStart(2, '0');
  const minutes = String(parsedDate.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
};

export const createFxSnapshot = ({
  provider,
  baseCurrency = 'EUR',
  rates,
  fetchedAt,
  lastSuccessfulUpdateAt,
  status,
}: {
  provider: string;
  baseCurrency?: DisplayCurrency;
  rates: Record<DisplayCurrency, number>;
  fetchedAt: string;
  lastSuccessfulUpdateAt: string;
  status: FxSnapshotStatus;
}): FxSnapshot => ({
  baseCurrency,
  provider,
  fetchedAt,
  lastSuccessfulUpdateAt,
  status,
  rates: FX_SUPPORTED_CURRENCIES.map((quoteCurrency) =>
    buildRateRecord(baseCurrency, quoteCurrency, quoteCurrency === baseCurrency ? 1 : rates[quoteCurrency])
  ),
});

const normalizeSnapshotShape = (snapshot: FxSnapshot): FxSnapshot => {
  const legacyBaseCurrency = snapshot.rates[0]?.baseCurrency ?? 'EUR';
  const baseCurrency = FX_SUPPORTED_CURRENCIES.includes(snapshot.baseCurrency)
    ? snapshot.baseCurrency
    : FX_SUPPORTED_CURRENCIES.includes(legacyBaseCurrency)
    ? legacyBaseCurrency
    : 'EUR';

  return {
    ...snapshot,
    baseCurrency,
    rates: snapshot.rates.map((record) => ({ ...record, baseCurrency })),
  };
};

const isUsableFxSnapshot = (snapshot: FxSnapshot | null | undefined): snapshot is FxSnapshot => {
  if (!snapshot || typeof snapshot.provider !== 'string' || snapshot.provider.trim().length === 0) {
    return false;
  }

  if (!isValidIsoTimestamp(snapshot.fetchedAt) || !isValidIsoTimestamp(snapshot.lastSuccessfulUpdateAt)) {
    return false;
  }

  const normalizedSnapshot = normalizeSnapshotShape(snapshot);
  return ['EUR', 'USD', 'ARS'].every((quoteCurrency) => {
    const rate = getSnapshotRateRecord(
      normalizedSnapshot,
      quoteCurrency as DisplayCurrency
    )?.rate;
    return quoteCurrency === normalizedSnapshot.baseCurrency ? rate === 1 : isPositiveNumber(rate);
  });
};

export const isValidFxSnapshot = (snapshot: FxSnapshot | null | undefined): snapshot is FxSnapshot => {
  if (!isUsableFxSnapshot(snapshot)) {
    return false;
  }

  const normalizedSnapshot = normalizeSnapshotShape(snapshot);
  return FX_SUPPORTED_CURRENCIES.every((quoteCurrency) => {
    const rate = getSnapshotRateRecord(normalizedSnapshot, quoteCurrency)?.rate;
    return quoteCurrency === normalizedSnapshot.baseCurrency ? rate === 1 : isPositiveNumber(rate);
  });
};

export const getLocalDateKey = (value: Date = new Date()): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate()
  ).padStart(2, '0')}`;

export const isSameLocalCalendarDay = (left: Date, right: Date): boolean =>
  getLocalDateKey(left) === getLocalDateKey(right);

export const rebaseFxSnapshot = (
  snapshot: FxSnapshot,
  baseCurrency: DisplayCurrency
): FxSnapshot => {
  const normalizedSnapshot = normalizeSnapshotShape(snapshot);
  if (!isValidFxSnapshot(normalizedSnapshot)) {
    return normalizedSnapshot;
  }

  if (normalizedSnapshot.baseCurrency === baseCurrency) {
    return normalizedSnapshot;
  }

  const newBaseRate = getSnapshotRateRecord(normalizedSnapshot, baseCurrency)?.rate;
  if (!isPositiveNumber(newBaseRate)) {
    return normalizedSnapshot;
  }

  return {
    ...normalizedSnapshot,
    baseCurrency,
    rates: FX_SUPPORTED_CURRENCIES.map((quoteCurrency) => {
      const existingRate = getSnapshotRateRecord(normalizedSnapshot, quoteCurrency)?.rate;
      return buildRateRecord(
        baseCurrency,
        quoteCurrency,
        quoteCurrency === baseCurrency ? 1 : (existingRate as number) / newBaseRate
      );
    }),
  };
};

export const getSnapshotStaleness = (
  snapshot: Pick<FxSnapshot, 'lastSuccessfulUpdateAt'>,
  now: Date = new Date()
): boolean => {
  if (!isValidIsoTimestamp(snapshot.lastSuccessfulUpdateAt)) {
    return true;
  }

  return !isSameLocalCalendarDay(new Date(snapshot.lastSuccessfulUpdateAt), now);
};

const normalizeSnapshotStatus = (
  snapshot: FxSnapshot,
  preferredStatus: FxSnapshotStatus,
  now: Date = new Date()
): FxSnapshot => ({
  ...snapshot,
  status:
    preferredStatus === 'error'
      ? 'error'
      : getSnapshotStaleness(snapshot, now)
      ? 'stale'
      : preferredStatus,
});

const getLegacyFxTimestamp = (settings: PartialFxSettings): string | null => {
  const candidates = [
    settings.fxRatesFetchedAt,
    settings.usdToEurRateUpdatedAt,
    settings.arsToEurRateUpdatedAt,
  ];

  return candidates.find(isValidIsoTimestamp) ?? null;
};

const buildLegacySnapshot = (
  settings: PartialFxSettings,
  now: Date = new Date()
): FxSnapshot | null => {
  if (!isPositiveNumber(settings.usdToEurRate) || !isPositiveNumber(settings.arsToEurRate)) {
    return null;
  }

  const timestamp = getLegacyFxTimestamp(settings);
  if (!timestamp) {
    return null;
  }

  const provider =
    settings.usdToEurRateSource === 'ECB' || settings.arsToEurRateSource === 'ECB'
      ? 'ECB (legacy cache)'
      : 'manual (legacy cache)';

  return normalizeSnapshotStatus(
    {
      baseCurrency: 'EUR',
      provider,
      rates: [
        buildRateRecord('EUR', 'EUR', 1),
        buildRateRecord('EUR', 'USD', 1 / settings.usdToEurRate),
        buildRateRecord('EUR', 'ARS', 1 / settings.arsToEurRate),
      ],
      fetchedAt: isValidIsoTimestamp(settings.fxRatesFetchedAt) ? settings.fxRatesFetchedAt : timestamp,
      lastSuccessfulUpdateAt: timestamp,
      status: 'cached',
    },
    'cached',
    now
  );
};

export const getActiveFxSnapshot = (
  settings: PartialFxSettings,
  now: Date = new Date()
): FxSnapshot | null => {
  if (isUsableFxSnapshot(settings.fxSnapshot)) {
    const normalizedSnapshot = normalizeSnapshotShape(settings.fxSnapshot);
    return normalizeSnapshotStatus(normalizedSnapshot, normalizedSnapshot.status, now);
  }

  return buildLegacySnapshot(settings, now);
};

export const getSettingsCurrencyRates = (settings: PartialFxSettings): Record<DisplayCurrency, number> => {
  const activeSnapshot = getActiveFxSnapshot(settings);
  if (activeSnapshot) {
    return buildSnapshotRateMap(activeSnapshot);
  }

  return {
    EUR: 1,
    USD: isPositiveNumber(settings.usdToEurRate) ? settings.usdToEurRate : DEFAULT_USD_TO_EUR_RATE,
    ARS: isPositiveNumber(settings.arsToEurRate) ? settings.arsToEurRate : DEFAULT_ARS_TO_EUR_RATE,
    GBP: DEFAULT_GBP_TO_EUR_RATE,
  };
};

export const hasValidFxRates = (settings: PartialFxSettings): boolean => getActiveFxSnapshot(settings) !== null;

export const shouldRequestFxRefresh = (
  settings: PartialFxSettings,
  { force = false, now = new Date() }: { force?: boolean; now?: Date } = {}
): boolean => force || !hasValidFxRates(settings) || areFxRatesStale(settings, now);

export const areFxRatesStale = (
  settings: Pick<AppSettings, 'fxRatesFetchedAt' | 'fxSnapshot'>,
  now: Date = new Date()
): boolean => {
  const snapshot = getActiveFxSnapshot(
    {
      usdToEurRate: 0,
      arsToEurRate: 0,
      usdToEurRateUpdatedAt: null,
      arsToEurRateUpdatedAt: null,
      usdToEurRateSource: 'manual',
      arsToEurRateSource: 'manual',
      fxRatesFetchedAt: settings.fxRatesFetchedAt,
      fxSnapshot: settings.fxSnapshot ?? null,
    },
    now
  );

  if (snapshot) {
    return !isValidFxSnapshot(snapshot) || getSnapshotStaleness(snapshot, now);
  }

  if (!isValidIsoTimestamp(settings.fxRatesFetchedAt)) {
    return true;
  }

  return true;
};

export const buildFxSnapshotFromSettings = (
  settings: PartialFxSettings,
  now: Date = new Date()
): FxSnapshot | null => getActiveFxSnapshot(settings, now);

export const hydrateSettingsFxSnapshot = (
  settings: AppSettings,
  now: Date = new Date()
): AppSettings => {
  const activeSnapshot = getActiveFxSnapshot(settings, now);

  if (!activeSnapshot) {
    return {
      ...settings,
      fxSnapshot: null,
    };
  }

  return applyFxSnapshotToSettings(settings, activeSnapshot);
};

export const applyFxSnapshotToSettings = (
  settings: AppSettings,
  snapshot: FxSnapshot
): AppSettings => {
  const rateMap = buildSnapshotRateMap(snapshot);

  return {
    ...settings,
    usdToEurRate: rateMap.USD,
    arsToEurRate: rateMap.ARS,
    usdToEurRateSource: snapshot.provider === 'manual (legacy cache)' ? 'manual' : 'ECB',
    arsToEurRateSource: snapshot.provider === 'manual (legacy cache)' ? 'manual' : 'ECB',
    usdToEurRateUpdatedAt: snapshot.lastSuccessfulUpdateAt,
    arsToEurRateUpdatedAt: snapshot.lastSuccessfulUpdateAt,
    fxRatesFetchedAt: snapshot.fetchedAt,
    fxSnapshot: snapshot,
  };
};

export const getFxWarningMessage = (
  snapshot: FxSnapshot | null,
  error?: Error | null,
  now: Date = new Date()
): string => {
  if (!snapshot) {
    return `FX refresh failed and no valid cached rates are available${
      error?.message ? `: ${error.message}` : '.'
    }`;
  }

  if (getSnapshotStaleness(snapshot, now)) {
    return `FX rates are stale. Last successful update: ${formatFxTimestampUtc(
      snapshot.lastSuccessfulUpdateAt
    )}.`;
  }

  return `FX refresh failed. Using cached rates from ${formatFxTimestampUtc(
    snapshot.lastSuccessfulUpdateAt
  )}.`;
};

export const buildFxSyncResult = (
  currentSettings: AppSettings,
  fetchedSnapshot: FxSnapshot | null,
  error?: Error | null,
  now: Date = new Date()
): FxSyncResult => {
  if (fetchedSnapshot && isValidFxSnapshot(fetchedSnapshot)) {
    const normalizedSnapshot = normalizeSnapshotStatus(
      rebaseFxSnapshot(fetchedSnapshot, currentSettings.currency),
      'fresh',
      now
    );
    return {
      nextSettings: applyFxSnapshotToSettings(currentSettings, normalizedSnapshot),
      warning: null,
      usedCachedRates: false,
      shouldRefresh: false,
      activeSnapshot: normalizedSnapshot,
    };
  }

  const cachedSnapshot = getActiveFxSnapshot(currentSettings, now);

  if (cachedSnapshot) {
    const cachedStatus = getSnapshotStaleness(cachedSnapshot, now) ? 'stale' : 'cached';
    const normalizedCachedSnapshot = normalizeSnapshotStatus(cachedSnapshot, cachedStatus, now);

    return {
      nextSettings: applyFxSnapshotToSettings(currentSettings, normalizedCachedSnapshot),
      warning: getFxWarningMessage(normalizedCachedSnapshot, error, now),
      usedCachedRates: true,
      shouldRefresh:
        !isValidFxSnapshot(normalizedCachedSnapshot) || normalizedCachedSnapshot.status === 'stale',
      activeSnapshot: normalizedCachedSnapshot,
    };
  }

  return {
    nextSettings: {
      ...currentSettings,
      fxSnapshot: null,
    },
    warning: getFxWarningMessage(null, error, now),
    usedCachedRates: false,
    shouldRefresh: true,
    activeSnapshot: null,
  };
};
