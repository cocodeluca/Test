import { UserAccountBackup } from './localAccountStore';

const ensureOk = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Account backup request failed');
  }

  return payload;
};

export const saveBackupToServer = async (backup: UserAccountBackup) => {
  const response = await fetch('/api/account-backup/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    keepalive: true,
    body: JSON.stringify({
      email: backup.user.email,
      backup,
    }),
  });

  return ensureOk<{ ok: boolean; email: string; updatedAt: string }>(response);
};

export const loadBackupFromServer = async (email: string) => {
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

export const flushBackupToServer = (backup: UserAccountBackup): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return false;
  }

  try {
    const payload = JSON.stringify({
      email: backup.user.email,
      backup,
    });
    const blob = new Blob([payload], {
      type: 'application/json',
    });

    return navigator.sendBeacon('/api/account-backup/save', blob);
  } catch {
    return false;
  }
};
