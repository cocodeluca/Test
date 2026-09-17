import type { LocalAccountUser } from './localAccountStore';

export class ServerAuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
    this.name = 'ServerAuthApiError';
  }
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as T & {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new ServerAuthApiError(
      payload.error ?? 'Authentication request failed.',
      response.status,
      payload.code ?? null
    );
  }
  return payload;
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
};

export const registerServerAccount = (input: {
  name: string;
  email: string;
  password: string;
}) => postJson<{ user: LocalAccountUser }>('/api/auth/register', input);

export const enrollExistingServerAccount = (input: {
  userId: string;
  name: string;
  email: string;
  password: string;
}) => postJson<{ user: LocalAccountUser }>('/api/auth/enroll', input);

export const loginServerAccount = (input: { email: string; password: string }) =>
  postJson<{ user: LocalAccountUser }>('/api/auth/login', input);

export const loadServerSession = async (): Promise<LocalAccountUser | null> => {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (response.status === 401) return null;
  return (await parseResponse<{ user: LocalAccountUser }>(response)).user;
};

export const logoutServerAccount = () =>
  postJson<{ ok: true }>('/api/auth/logout', {});
