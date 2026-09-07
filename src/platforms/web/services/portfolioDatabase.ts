import { getPortfolioSnapshotTraceMetadata, tracePortfolioPersistence } from './portfolioPersistenceTrace';

/** Account snapshots are deliberately separate from gallery blobs. */
const DB_NAME = 're-portfolio-account-data';
const queues = new Map<string, Promise<unknown>>();

export const serializeAccountOperation = <T>(userId: string, operation: () => Promise<T>): Promise<T> => {
  tracePortfolioPersistence('queue:scheduled', { userId, accountId: userId, indexedDbKey: userId });
  const next = (queues.get(userId) ?? Promise.resolve()).catch(() => undefined).then(async () =>
    {
      tracePortfolioPersistence('queue:started', { userId, accountId: userId, indexedDbKey: userId });
      const result = typeof navigator !== 'undefined' && navigator.locks
        ? await navigator.locks.request('portfolio:' + userId, operation)
        : await operation();
      tracePortfolioPersistence('queue:completed', { userId, accountId: userId, indexedDbKey: userId });
      return result;
    });
  queues.set(userId, next);
  void next.finally(() => { if (queues.get(userId) === next) queues.delete(userId); }).catch(() => undefined);
  return next;
};

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
  const request = indexedDB.open(DB_NAME, 1);
  let blocked = false;
  request.onblocked = () => { blocked = true; reject(new Error('Account database is blocked. Close other app tabs and retry.')); };
  request.onerror = () => reject(request.error ?? new Error('Cannot open account database'));
  request.onupgradeneeded = () => {
    for (const name of ['portfolios', 'recovery']) {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'userId' });
    }
  };
  request.onsuccess = () => {
    if (blocked) { request.result.close(); return; }
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
});

export interface AccountSnapshotRecord {
  userId: string;
  schemaVersion: 1;
  updatedAt: string;
  portfolio: unknown;
}

export const accountSnapshotTransaction = async (
  store: 'portfolios' | 'recovery', userId: string, value?: unknown, onlyIfMissing = false
): Promise<AccountSnapshotRecord | undefined> => {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, value === undefined ? 'readonly' : 'readwrite', { durability: 'strict' });
      let result: AccountSnapshotRecord | undefined;
      tx.oncomplete = () => {
        if (value !== undefined && result) {
          tracePortfolioPersistence('idb:write', {
            ...getPortfolioSnapshotTraceMetadata(userId, result.portfolio as { properties?: Array<{ id?: string; name?: string }> }, {
              accountId: userId,
              indexedDbKey: userId,
              snapshotUpdatedAt: result.updatedAt,
              snapshotVersion: result.schemaVersion,
            }),
            details: { store, operation: 'write' },
          });
        }
        resolve(result);
      };
      tx.onabort = () => reject(tx.error ?? new Error('Account snapshot transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('Account snapshot transaction failed'));
      const objectStore = tx.objectStore(store);
      const request = objectStore.get(userId);
      request.onsuccess = () => {
        result = request.result;
        if (value === undefined) tracePortfolioPersistence('idb:read', {
          ...(result ? getPortfolioSnapshotTraceMetadata(userId, result.portfolio as { properties?: Array<{ id?: string; name?: string }> }, {
            accountId: userId,
            indexedDbKey: userId,
            snapshotUpdatedAt: result.updatedAt,
            snapshotVersion: result.schemaVersion,
          }) : { userId, accountId: userId, indexedDbKey: userId }),
          details: { store, operation: 'read' },
        });
        if (value !== undefined && (!onlyIfMissing || result === undefined)) {
          result = { userId, schemaVersion: 1, updatedAt: new Date().toISOString(), portfolio: value };
          objectStore.put(result);
        }
      };
    });
  } finally { db.close(); }
};
