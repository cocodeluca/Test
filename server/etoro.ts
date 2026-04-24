import { randomUUID } from 'node:crypto';

export const ETORO_API_BASE_URL = 'https://public-api.etoro.com/api/v1';

interface EtoroPositionLike {
  amount?: number;
  pnL?: number;
  totalExternalCosts?: number;
  mirrorId?: number;
  unrealizedPnL?: {
    pnL?: number;
  };
}

interface EtoroMirrorLike {
  availableAmount?: number;
  closedPositionsNetProfit?: number;
  positions?: EtoroPositionLike[];
}

interface EtoroClientPortfolio {
  credit?: number;
  unrealizedPnL?: number;
  positions?: EtoroPositionLike[];
  mirrors?: EtoroMirrorLike[];
  orders?: EtoroPositionLike[];
  ordersForOpen?: EtoroPositionLike[];
}

interface EtoroPortfolioPnlResponse {
  clientPortfolio?: EtoroClientPortfolio;
}

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

const getNumber = (value: number | undefined | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const sumBy = <T>(items: T[] | undefined, selector: (item: T) => number): number =>
  (items ?? []).reduce((total, item) => total + selector(item), 0);

const getPositionPnl = (position: EtoroPositionLike): number => {
  if (typeof position.unrealizedPnL?.pnL === 'number') {
    return position.unrealizedPnL.pnL;
  }

  return getNumber(position.pnL);
};

const calculateAvailableCash = (portfolio: EtoroClientPortfolio): number => {
  const pendingStandaloneOrders = sumBy(
    portfolio.ordersForOpen,
    (order) => (getNumber(order.mirrorId) === 0 ? getNumber(order.amount) : 0)
  );
  const openOrdersAmount = sumBy(portfolio.orders, (order) => getNumber(order.amount));

  return getNumber(portfolio.credit) - pendingStandaloneOrders - openOrdersAmount;
};

const calculateTotalInvested = (portfolio: EtoroClientPortfolio): number => {
  const positionsInvested = sumBy(portfolio.positions, (position) => getNumber(position.amount));
  const mirrorsInvested = sumBy(portfolio.mirrors, (mirror) => {
    const mirrorPositions = sumBy(mirror.positions, (position) => getNumber(position.amount));
    const mirrorAvailable = getNumber(mirror.availableAmount) - getNumber(mirror.closedPositionsNetProfit);
    return mirrorPositions + mirrorAvailable;
  });
  const pendingStandaloneOrders = sumBy(
    portfolio.ordersForOpen,
    (order) => (getNumber(order.mirrorId) === 0 ? getNumber(order.amount) : 0)
  );
  const openOrdersAmount = sumBy(portfolio.orders, (order) => getNumber(order.amount));
  const pendingOrderCosts = sumBy(
    portfolio.ordersForOpen,
    (order) => (getNumber(order.mirrorId) === 0 ? getNumber(order.totalExternalCosts) : 0)
  );

  return (
    positionsInvested +
    mirrorsInvested +
    pendingStandaloneOrders +
    openOrdersAmount +
    pendingOrderCosts
  );
};

const calculateUnrealizedPnl = (portfolio: EtoroClientPortfolio): number => {
  if (typeof portfolio.unrealizedPnL === 'number') {
    return portfolio.unrealizedPnL;
  }

  const positionsPnl = sumBy(portfolio.positions, (position) => getPositionPnl(position));
  const mirrorsPnl = sumBy(portfolio.mirrors, (mirror) => {
    const mirrorPositionsPnl = sumBy(mirror.positions, (position) => getPositionPnl(position));
    return mirrorPositionsPnl + getNumber(mirror.closedPositionsNetProfit);
  });

  return positionsPnl + mirrorsPnl;
};

const getRequiredEnv = (name: 'ETORO_API_KEY' | 'ETORO_USER_KEY'): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const fetchEtoroAccountSnapshot = async (): Promise<EtoroAccountSnapshot> => {
  const apiKey = getRequiredEnv('ETORO_API_KEY');
  const userKey = getRequiredEnv('ETORO_USER_KEY');
  const requestId = randomUUID();

  const response = await fetch(`${ETORO_API_BASE_URL}/trading/info/real/pnl`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-user-key': userKey,
      'x-request-id': requestId,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`eToro request failed (${response.status}): ${responseText || response.statusText}`);
  }

  const payload = (await response.json()) as EtoroPortfolioPnlResponse;
  const portfolio = payload.clientPortfolio;

  if (!portfolio) {
    throw new Error('eToro response did not include clientPortfolio');
  }

  const availableCash = calculateAvailableCash(portfolio);
  const totalInvested = calculateTotalInvested(portfolio);
  const unrealizedPnL = calculateUnrealizedPnl(portfolio);
  const totalAccountValue = availableCash + totalInvested + unrealizedPnL;

  return {
    provider: 'etoro',
    providerLabel: 'eToro',
    currency: 'USD',
    totalAccountValue,
    availableCash,
    totalInvested,
    unrealizedPnL,
    fetchedAt: new Date().toISOString(),
    requestId,
  };
};
