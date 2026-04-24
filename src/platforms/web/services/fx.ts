import {
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

export const fetchLatestFxRates = async (): Promise<FxSnapshot> => {
  const response = await fetch('/api/fx/rates');
  const payload = await ensureOk<FxSnapshot>(response);

  if (!isValidFxSnapshot(payload)) {
    throw new Error('FX provider returned an invalid snapshot payload');
  }

  return payload;
};
