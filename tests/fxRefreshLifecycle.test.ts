import assert from 'node:assert/strict';
import test from 'node:test';
import type { FxSnapshot } from '../src/common/types/settings';
import {
  areFxRatesStale,
  buildFxSyncResult,
  createFxSnapshot,
  getActiveFxSnapshot,
  getSettingsCurrencyRates,
  hydrateSettingsFxSnapshot,
  isValidFxSnapshot,
  shouldRequestFxRefresh,
} from '../src/common/utils/fxRates';
import { DEFAULT_SETTINGS } from '../src/common/utils/settingsStore';
import { convertCurrency } from '../src/common/utils/currency';
import { createFxRequestCoordinator } from '../src/platforms/web/services/fx';
import {
  createFxDayRolloverController,
  getMillisecondsUntilNextLocalDay,
} from '../src/platforms/web/services/fxDayRollover';
import { fetchLatestFxRatesWith } from '../server/fx';

const makeSnapshot = (timestamp: string): FxSnapshot =>
  createFxSnapshot({
    provider: 'Test Provider',
    baseCurrency: 'EUR',
    rates: { EUR: 1, USD: 2, ARS: 1000, GBP: 0.8 },
    fetchedAt: timestamp,
    lastSuccessfulUpdateAt: timestamp,
    status: 'fresh',
  });

const makeSettings = (snapshot: FxSnapshot | null = null) => ({
  ...DEFAULT_SETTINGS,
  fxSnapshot: snapshot,
  fxRatesFetchedAt: snapshot?.fetchedAt ?? null,
});

test('startup refresh decision covers no cache, same local day, next local day, and manual force', () => {
  const today = new Date(2026, 3, 14, 12, 0, 0);
  const sameDaySnapshot = makeSnapshot(new Date(2026, 3, 14, 8, 0, 0).toISOString());
  const yesterdaySnapshot = makeSnapshot(new Date(2026, 3, 13, 23, 59, 0).toISOString());

  assert.equal(shouldRequestFxRefresh(makeSettings(), { now: today }), true);
  assert.equal(shouldRequestFxRefresh(makeSettings(sameDaySnapshot), { now: today }), false);
  assert.equal(shouldRequestFxRefresh(makeSettings(yesterdaySnapshot), { now: today }), true);
  assert.equal(shouldRequestFxRefresh(makeSettings(sameDaySnapshot), { now: today, force: true }), true);
});

test('open app refreshes once when the local midnight timer fires', async () => {
  let currentTime = new Date(2026, 3, 14, 23, 59, 30);
  let timerCallback: (() => void) | null = null;
  let refreshCount = 0;
  const controller = createFxDayRolloverController({
    now: () => currentTime,
    refresh: () => {
      refreshCount += 1;
    },
    setTimer: (callback) => {
      timerCallback = callback;
      return 1;
    },
    clearTimer: () => undefined,
  });

  controller.start();
  assert.equal(getMillisecondsUntilNextLocalDay(currentTime), 30_000);
  currentTime = new Date(2026, 3, 15, 0, 0, 1);
  assert.ok(timerCallback);
  (timerCallback as () => void)();
  await Promise.resolve();

  assert.equal(refreshCount, 1);
  controller.stop();
});

test('activation after sleeping across midnight refreshes immediately but same-day activation does not', async () => {
  let currentTime = new Date(2026, 3, 14, 18, 0, 0);
  let refreshCount = 0;
  const controller = createFxDayRolloverController({
    now: () => currentTime,
    refresh: () => {
      refreshCount += 1;
    },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });

  controller.start();
  controller.handleActivation();
  assert.equal(refreshCount, 0);

  currentTime = new Date(2026, 3, 15, 9, 0, 0);
  controller.handleActivation();
  await Promise.resolve();
  assert.equal(refreshCount, 1);
  controller.stop();
});

test('midnight and manual refresh share one in-flight request', async () => {
  let requestCount = 0;
  let resolveRequest: ((snapshot: FxSnapshot) => void) | null = null;
  const coordinatedRequest = createFxRequestCoordinator(
    () =>
      new Promise<FxSnapshot>((resolve) => {
        requestCount += 1;
        resolveRequest = resolve;
      })
  );
  let currentTime = new Date(2026, 3, 14, 23, 59, 59);
  let timerCallback: (() => void) | null = null;
  const controller = createFxDayRolloverController({
    now: () => currentTime,
    refresh: async () => {
      await coordinatedRequest();
    },
    setTimer: (callback) => {
      timerCallback = callback;
      return 1;
    },
    clearTimer: () => undefined,
  });

  controller.start();
  currentTime = new Date(2026, 3, 15, 0, 0, 1);
  (timerCallback as unknown as () => void)();
  const manualRequest = coordinatedRequest({ force: true });
  assert.equal(requestCount, 1);
  assert.ok(resolveRequest);
  (resolveRequest as (snapshot: FxSnapshot) => void)(makeSnapshot(currentTime.toISOString()));
  await manualRequest;
  controller.stop();
});

test('single-flight coordinator reuses a same-day session result but force refreshes after completion', async () => {
  let requestCount = 0;
  const now = new Date(2026, 3, 14, 12, 0, 0);
  const coordinatedRequest = createFxRequestCoordinator(async () => {
    requestCount += 1;
    return makeSnapshot(now.toISOString());
  }, () => now);

  await coordinatedRequest();
  await coordinatedRequest();
  assert.equal(requestCount, 1);

  await coordinatedRequest({ force: true });
  assert.equal(requestCount, 2);
});

test('Frankfurter v2 supplies one complete atomic EUR dataset', async () => {
  const requestedUrls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [
        { date: '2026-04-14', base: 'EUR', quote: 'ARS', rate: 1500 },
        { date: '2026-04-14', base: 'EUR', quote: 'GBP', rate: 0.75 },
        { date: '2026-04-14', base: 'EUR', quote: 'USD', rate: 3 },
      ],
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  const snapshot = await fetchLatestFxRatesWith(
    fetchImpl,
    () => new Date('2026-04-14T12:00:00.000Z')
  );

  assert.equal(requestedUrls.length, 1);
  assert.match(requestedUrls[0], /api\.frankfurter\.dev\/v2\/rates/);
  assert.equal(snapshot.provider, 'Frankfurter');
  assert.deepEqual(
    snapshot.rates.map(({ quoteCurrency, rate }) => [quoteCurrency, rate]),
    [['EUR', 1], ['USD', 3], ['ARS', 1500], ['GBP', 0.75]]
  );
});

test('duplicate Frankfurter quotes are rejected before using the complete fallback dataset', async () => {
  const requestedUrls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requestedUrls.push(url);
    const payload = url.includes('frankfurter')
      ? [
          { date: '2026-04-14', base: 'EUR', quote: 'USD', rate: 2 },
          { date: '2026-04-14', base: 'EUR', quote: 'USD', rate: 3 },
          { date: '2026-04-14', base: 'EUR', quote: 'GBP', rate: 0.8 },
        ]
      : { rates: { USD: 3, ARS: 1500, GBP: 0.75 } };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  const snapshot = await fetchLatestFxRatesWith(fetchImpl);

  assert.equal(requestedUrls.length, 2);
  assert.equal(snapshot.provider, 'ExchangeRate-API');
  assert.deepEqual(
    snapshot.rates.map(({ quoteCurrency, rate }) => [quoteCurrency, rate]),
    [['EUR', 1], ['USD', 3], ['ARS', 1500], ['GBP', 0.75]]
  );
});

test('non-positive rates from every provider reject the refresh atomically', async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    const payload = String(input).includes('frankfurter')
      ? [
          { date: '2026-04-14', base: 'EUR', quote: 'USD', rate: 2 },
          { date: '2026-04-14', base: 'EUR', quote: 'ARS', rate: 0 },
          { date: '2026-04-14', base: 'EUR', quote: 'GBP', rate: 0.8 },
        ]
      : { rates: { USD: 3, ARS: -1500, GBP: 0.75 } };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  await assert.rejects(
    () => fetchLatestFxRatesWith(fetchImpl),
    /All FX providers failed.*ARS rate was missing or invalid/
  );
});

test('provider missing ARS is rejected atomically and the fallback supplies the whole dataset', async () => {
  const requestedUrls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requestedUrls.push(url);
    const payload = url.includes('frankfurter')
      ? [
          { date: '2026-04-14', base: 'EUR', quote: 'USD', rate: 2 },
          { date: '2026-04-14', base: 'EUR', quote: 'GBP', rate: 0.8 },
        ]
      : { rates: { USD: 3, ARS: 1500, GBP: 0.75 } };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  const snapshot = await fetchLatestFxRatesWith(
    fetchImpl,
    () => new Date('2026-04-14T12:00:00.000Z')
  );

  assert.equal(requestedUrls.length, 2);
  assert.equal(snapshot.provider, 'ExchangeRate-API');
  assert.deepEqual(
    snapshot.rates.map(({ quoteCurrency, rate }) => [quoteCurrency, rate]),
    [['EUR', 1], ['USD', 3], ['ARS', 1500], ['GBP', 0.75]]
  );
});

test('incomplete responses from every provider fail without replacing the cached dataset', async () => {
  const cachedSnapshot = makeSnapshot('2026-04-13T12:00:00.000Z');
  const fetchImpl = (async (input: string | URL | Request) => {
    const payload = String(input).includes('frankfurter')
      ? [
          { date: '2026-04-14', base: 'EUR', quote: 'USD', rate: 4 },
          { date: '2026-04-14', base: 'EUR', quote: 'GBP', rate: 0.7 },
        ]
      : { rates: { USD: 4, GBP: 0.7 } };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  await assert.rejects(() => fetchLatestFxRatesWith(fetchImpl), /All FX providers failed/);
  const settings = makeSettings(cachedSnapshot);
  const fallback = buildFxSyncResult(
    settings,
    null,
    new Error('All FX providers failed'),
    new Date('2026-04-14T12:00:00.000Z')
  );

  assert.deepEqual(fallback.nextSettings.fxSnapshot?.rates, cachedSnapshot.rates);
  assert.equal(fallback.nextSettings.fxSnapshot?.provider, cachedSnapshot.provider);
  assert.equal(
    fallback.nextSettings.fxSnapshot?.lastSuccessfulUpdateAt,
    cachedSnapshot.lastSuccessfulUpdateAt
  );
});

test('rebasing preserves EUR legacy scalar meanings and does not mutate native property values', () => {
  const property = {
    id: 'gbp-property',
    currentEstimatedValue: 250_000,
    currentEstimatedValueCurrency: 'GBP' as const,
    purchasePrice: 200_000,
    purchasePriceCurrency: 'GBP' as const,
  };
  const originalProperty = structuredClone(property);
  const result = buildFxSyncResult(
    { ...makeSettings(), currency: 'GBP' },
    makeSnapshot('2026-04-14T12:00:00.000Z'),
    null,
    new Date(2026, 3, 14, 12, 0, 0)
  );
  const rates = getSettingsCurrencyRates(result.nextSettings);

  assert.equal(result.nextSettings.fxSnapshot?.baseCurrency, 'GBP');
  assert.equal(result.nextSettings.usdToEurRate, 0.5);
  assert.equal(result.nextSettings.arsToEurRate, 0.001);
  assert.equal(convertCurrency(property.currentEstimatedValue, 'GBP', 'EUR', rates), 312_500);
  assert.deepEqual(property, originalProperty);
});

test('EUR quote rates are inverted exactly once for ARS conversions', () => {
  const snapshot = createFxSnapshot({
    provider: 'Frankfurter',
    baseCurrency: 'EUR',
    rates: { EUR: 1, USD: 1.1545, ARS: 1729.62, GBP: 0.85791 },
    fetchedAt: '2026-08-09T11:40:28.677Z',
    lastSuccessfulUpdateAt: '2026-08-09T11:40:28.677Z',
    status: 'fresh',
  });
  const result = buildFxSyncResult(
    makeSettings(),
    snapshot,
    null,
    new Date('2026-08-09T12:00:00.000Z')
  );
  const rates = getSettingsCurrencyRates(result.nextSettings);

  assert.equal(rates.ARS, 1 / 1729.62);
  assert.equal(convertCurrency(1, 'EUR', 'ARS', rates), 1729.62);
  assert.equal(convertCurrency(1_000_000, 'ARS', 'EUR', rates), 1_000_000 / 1729.62);
});

test('legacy snapshots keep their cached currencies, infer EUR base, and request completion', () => {
  const legacySnapshot = {
    provider: 'Legacy Provider',
    fetchedAt: new Date(2026, 3, 14, 8, 0, 0).toISOString(),
    lastSuccessfulUpdateAt: new Date(2026, 3, 14, 8, 0, 0).toISOString(),
    status: 'cached',
    rates: [
      { baseCurrency: 'EUR', quoteCurrency: 'EUR', rate: 1 },
      { baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 2 },
      { baseCurrency: 'EUR', quoteCurrency: 'ARS', rate: 1000 },
    ],
  } as unknown as FxSnapshot;
  const settings = makeSettings(legacySnapshot);
  const hydrated = hydrateSettingsFxSnapshot(settings, new Date(2026, 3, 14, 12, 0, 0));

  assert.equal(getActiveFxSnapshot(settings)?.baseCurrency, 'EUR');
  assert.equal(isValidFxSnapshot(legacySnapshot), false);
  assert.equal(areFxRatesStale(settings, new Date(2026, 3, 14, 12, 0, 0)), true);
  assert.equal(hydrated.fxSnapshot?.rates.length, 3);
  assert.equal(hydrated.usdToEurRate, 0.5);
  assert.equal(hydrated.arsToEurRate, 0.001);
});
