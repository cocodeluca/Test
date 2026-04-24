export interface EtoroAccountSnapshot {
  provider: 'etoro';
  providerLabel: 'eToro';
  currency: 'USD';
  totalAccountValue: number;
  availableCash: number;
  totalInvested: number;
  unrealizedPnL: number;
  fetchedAt: string;
  requestId: string;
}

interface EtoroTestResponse {
  ok: boolean;
  provider?: 'etoro';
  fetchedAt?: string;
  requestId?: string;
  totalAccountValue?: number;
  currency?: 'USD';
  error?: string;
}

const ensureOk = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Broker sync request failed');
  }

  return payload;
};

export const fetchEtoroAccountSnapshot = async (): Promise<EtoroAccountSnapshot> => {
  const response = await fetch('/api/brokers/etoro/account');
  return ensureOk<EtoroAccountSnapshot>(response);
};

export const testEtoroConnection = async (): Promise<EtoroTestResponse> => {
  const response = await fetch('/api/brokers/etoro/test');
  return ensureOk<EtoroTestResponse>(response);
};
