import { UserAccountBackup } from './localAccountStore';
import { tracePortfolioPersistence } from './portfolioPersistenceTrace';

const ensureOk = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Account backup request failed');
  }

  return payload;
};

const remoteWrites = new Map<string, Promise<unknown>>();
export const saveBackupToServer = (backup: UserAccountBackup) => {
  const email = backup.user.email.trim().toLowerCase();
  const body = JSON.stringify({ email, backup });
  const next = (remoteWrites.get(email) ?? Promise.resolve()).catch(() => undefined).then(async () => {
  const response = await fetch('/api/account-backup/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  return ensureOk<{ ok: boolean; email: string; updatedAt: string }>(response);
  });
  remoteWrites.set(email, next);
  void next.finally(() => { if (remoteWrites.get(email) === next) remoteWrites.delete(email); }).catch(() => undefined);
  return next;
};

export const loadBackupFromServer = async (email: string) => {
  // Caller-side hydration traces carry the account ID; do not log email here.
  tracePortfolioPersistence('backup:remote-load', {});
  const response = await fetch('/api/account-backup/load', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  return ensureOk<{
    ok: boolean;
    email: string;
    updatedAt: string;
    payload: UserAccountBackup;
  }>(response);
};
