import { createFxSnapshot, type FxSnapshot } from '../src/common/utils/fxRates';

interface JsonProviderDefinition {
  name: string;
  url: string;
  parseRates: (payload: unknown) => { USD: number; ARS: number; GBP: number };
}

const FX_FETCH_TIMEOUT_MS = 10000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readPositiveRate = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} was missing or invalid`);
  }

  return value;
};

const FX_PROVIDERS: JsonProviderDefinition[] = [
  {
    name: 'Frankfurter',
    url: 'https://api.frankfurter.app/latest?from=EUR&to=USD,ARS,GBP',
    parseRates: (payload) => {
      if (!isObject(payload) || !isObject(payload.rates)) {
        throw new Error('Frankfurter payload did not include a rates object');
      }

      return {
        USD: readPositiveRate(payload.rates.USD, 'Frankfurter USD rate'),
        ARS: readPositiveRate(payload.rates.ARS, 'Frankfurter ARS rate'),
        GBP: readPositiveRate(payload.rates.GBP, 'Frankfurter GBP rate'),
      };
    },
  },
  {
    name: 'ExchangeRate-API',
    url: 'https://open.er-api.com/v6/latest/EUR',
    parseRates: (payload) => {
      if (!isObject(payload) || !isObject(payload.rates)) {
        throw new Error('ExchangeRate-API payload did not include a rates object');
      }

      return {
        USD: readPositiveRate(payload.rates.USD, 'ExchangeRate-API USD rate'),
        ARS: readPositiveRate(payload.rates.ARS, 'ExchangeRate-API ARS rate'),
        GBP: readPositiveRate(payload.rates.GBP, 'ExchangeRate-API GBP rate'),
      };
    },
  },
];

const fetchProviderSnapshot = async (
  provider: JsonProviderDefinition,
  fetchImpl: typeof fetch,
  now: () => Date
): Promise<FxSnapshot> => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), FX_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(provider.url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `${provider.name} FX request failed (${response.status}): ${responseText || response.statusText}`
      );
    }

    const payload = (await response.json()) as unknown;
    const rates = provider.parseRates(payload);
    const fetchedAt = now().toISOString();

    return createFxSnapshot({
      provider: provider.name,
      baseCurrency: 'EUR',
      rates: {
        EUR: 1,
        USD: rates.USD,
        ARS: rates.ARS,
        GBP: rates.GBP,
      },
      fetchedAt,
      lastSuccessfulUpdateAt: fetchedAt,
      status: 'fresh',
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchLatestFxRatesWith = async (
  fetchImpl: typeof fetch,
  now: () => Date = () => new Date()
): Promise<FxSnapshot> => {
  const errors: string[] = [];

  for (const provider of FX_PROVIDERS) {
    try {
      return await fetchProviderSnapshot(provider, fetchImpl, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected provider error';
      errors.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(`All FX providers failed. ${errors.join(' | ')}`);
};

export const fetchLatestFxRates = async (): Promise<FxSnapshot> =>
  fetchLatestFxRatesWith(fetch);
