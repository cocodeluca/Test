import {
  isSameLocalCalendarDay,
  isValidFxSnapshot,
  type FxSnapshot,
} from '../../../common/utils/fxRates';

const ensureOk = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'FX sync request failed');
  }

  return payload;
};

const fetchLatestFxRatesFromApi = async (): Promise<FxSnapshot> => {
  const response = await fetch('/api/fx/rates');
  const payload = await ensureOk<FxSnapshot>(response);

  if (!isValidFxSnapshot(payload)) {
    throw new Error('FX provider returned an invalid snapshot payload');
  }

  return payload;
};

export const createFxRequestCoordinator = (
  request: () => Promise<FxSnapshot>,
  now: () => Date = () => new Date()
): ((options?: { force?: boolean }) => Promise<FxSnapshot>) => {
  let inFlightRequest: Promise<FxSnapshot> | null = null;
  let lastSessionSnapshot: FxSnapshot | null = null;

  return ({ force = false }: { force?: boolean } = {}) => {
    if (inFlightRequest) {
      return inFlightRequest;
    }

    if (
      !force &&
      lastSessionSnapshot &&
      isSameLocalCalendarDay(new Date(lastSessionSnapshot.lastSuccessfulUpdateAt), now())
    ) {
      return Promise.resolve(lastSessionSnapshot);
    }

    inFlightRequest = request()
      .then((snapshot) => {
        lastSessionSnapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        inFlightRequest = null;
      });
    return inFlightRequest;
  };
};

export const fetchLatestFxRates = createFxRequestCoordinator(fetchLatestFxRatesFromApi);
