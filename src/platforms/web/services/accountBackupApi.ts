import { UserAccountBackup } from './localAccountStore';
import { tracePortfolioPersistence } from './portfolioPersistenceTrace';
import { isRemoteAccountBackupEnabled } from './runtimeConfiguration';

const ensureOk = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Account backup request failed');
  }

  return payload;
};

const remoteWrites = new Map<string, Promise<unknown>>();
export const saveBackupToServer = async (backup: UserAccountBackup) => {
  if (!(await isRemoteAccountBackupEnabled())) {
    return { ok: false as const, disabled: true as const };
  }
  const ownerKey = 'authenticated-session';
  const body = JSON.stringify({ backup });
  const next = (remoteWrites.get(ownerKey) ?? Promise.resolve()).catch(() => undefined).then(async () => {
  const response = await fetch('/api/account-backup/save', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  return ensureOk<{ ok: boolean; email: string; updatedAt: string }>(response);
  });
  remoteWrites.set(ownerKey, next);
  void next.finally(() => {
    if (remoteWrites.get(ownerKey) === next) remoteWrites.delete(ownerKey);
  }).catch(() => undefined);
  return next;
};

export const loadBackupFromServer = async () => {
  if (!(await isRemoteAccountBackupEnabled())) {
    throw new Error('Server account backup is disabled.');
  }
  tracePortfolioPersistence('backup:remote-load', {});
  const response = await fetch('/api/account-backup/load', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  return ensureOk<{
    ok: boolean;
    email: string;
    updatedAt: string;
    payload: UserAccountBackup;
  }>(response);
};
