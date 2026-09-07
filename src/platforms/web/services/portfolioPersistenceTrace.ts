export type PortfolioPersistenceTraceEvent =
  | 'react:add-property'
  | 'autosave:blocked'
  | 'autosave:scheduled'
  | 'autosave:status'
  | 'save:input'
  | 'queue:scheduled'
  | 'queue:started'
  | 'queue:completed'
  | 'idb:read'
  | 'idb:write'
  | 'load:raw'
  | 'bootstrap:start'
  | 'bootstrap:hydrated'
  | 'hydration:start'
  | 'hydration:remote-load'
  | 'hydration:remote-import'
  | 'hydration:complete'
  | 'backup:remote-load';

export type PortfolioPersistenceTraceEntry = {
  event: PortfolioPersistenceTraceEvent;
  timestamp: string;
  propertyCount?: number;
  snapshotUpdatedAt?: string;
  snapshotVersion?: number;
  details?: Record<string, string | number | boolean | null>;
};

declare global {
  var __RE_PORTFOLIO_PERSISTENCE_TRACE__: PortfolioPersistenceTraceEntry[] | undefined;
  var __RE_PORTFOLIO_PERSISTENCE_TRACE_ENABLED__: boolean | undefined;
}

type TraceHost = typeof globalThis & {
  __RE_PORTFOLIO_PERSISTENCE_TRACE__?: PortfolioPersistenceTraceEntry[];
  __RE_PORTFOLIO_PERSISTENCE_TRACE_ENABLED__?: boolean;
};

// Accepted only so call sites do not have to retain diagnostic identifiers;
// trace output deliberately drops them before it reaches the console or memory.
type TracePrivateIdentifiers = {
  userId?: string;
  accountId?: string;
  indexedDbKey?: string;
};

type TraceInput = Omit<PortfolioPersistenceTraceEntry, 'event' | 'timestamp'> & TracePrivateIdentifiers;

const isEnabled = (): boolean => {
  const host = globalThis as TraceHost;
  if (host.__RE_PORTFOLIO_PERSISTENCE_TRACE_ENABLED__) return true;
  return typeof window !== 'undefined' && Boolean(window.location?.search.includes('persistenceTrace=1'));
};

export const tracePortfolioPersistence = (
  event: PortfolioPersistenceTraceEvent,
  entry: TraceInput
): void => {
  if (!isEnabled()) return;
  const host = globalThis as TraceHost;
  const { userId: _userId, accountId: _accountId, indexedDbKey: _indexedDbKey, ...safeEntry } = entry;
  const value: PortfolioPersistenceTraceEntry = { event, timestamp: new Date().toISOString(), ...safeEntry };
  (host.__RE_PORTFOLIO_PERSISTENCE_TRACE__ ??= []).push(value);
  console.debug('[portfolio-persistence]', value);
};

export const getPortfolioSnapshotTraceMetadata = (
  _userId: string,
  portfolio: { properties?: Array<{ id?: string; name?: string }> },
  extra: Pick<PortfolioPersistenceTraceEntry, 'snapshotUpdatedAt' | 'snapshotVersion'> & TracePrivateIdentifiers = {}
): Omit<PortfolioPersistenceTraceEntry, 'event' | 'timestamp'> => {
  const properties = portfolio.properties ?? [];
  return {
    propertyCount: properties.length,
    ...extra,
  };
};
