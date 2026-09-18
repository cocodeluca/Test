import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { fetchEtoroAccountSnapshot } from './etoro';
import { fetchLatestFxRates } from './fx';
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidBalances,
  fetchPlaidInstitution,
  fetchPlaidItem,
  isPlaidLoginRequiredError,
  mapPlaidAccountsToCashAccounts,
  removePlaidItem,
  PlaidProviderError,
} from './plaid';
import {
  createDefaultOpenBankingConnectionStore,
  OpenBankingConnectionOwnershipError,
  OpenBankingVaultError,
} from './openBankingStore';
import {
  createServerSessionOpenBankingAuthenticator,
  OpenBankingAuthenticationError,
  type OpenBankingRequestAuthenticator,
} from './openBankingAuth';
import {
  createOpenBankingLinkSessionStore,
  OpenBankingLinkSessionError,
} from './openBankingLinkSessions';
import {
  OpenBankingConfigurationError,
} from './openBankingPolicy';
import {
  OpenBankingConnectionStateError,
  createOpenBankingService,
  type OpenBankingService,
} from './openBankingService';
import {
  AccountBackupError,
  defaultAccountBackupStore,
  type AccountBackupStore,
} from './accountBackupStore';
import {
  assertJsonRequest,
  assertSameOriginRequest,
  createDefaultServerAuthService,
  getSessionTokenFromRequest,
  isSecureRequest,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
  ServerAuthError,
  type ServerAuthService,
} from './serverAuth';

const json = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const methodNotAllowed = (response: ServerResponse) =>
  json(response, 405, { error: 'Method not allowed' });

const readJsonBody = async <T>(request: IncomingMessage, maximumBytes = 1024 * 1024): Promise<T> =>
  new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let exceededLimit = false;

    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maximumBytes) {
        exceededLimit = true;
        return;
      }
      body += chunk.toString();
    });

    request.on('end', () => {
      if (exceededLimit) {
        reject(new ServerAuthError('REQUEST_BODY_TOO_LARGE', 413, 'Request body is too large.'));
        return;
      }
      try {
        resolve((body ? JSON.parse(body) : {}) as T);
      } catch {
        reject(new ServerAuthError('REQUEST_JSON_INVALID', 400, 'Invalid JSON request body.'));
      }
    });

    request.on('error', reject);
  });

const handleEtoroAccount = async (_request: IncomingMessage, response: ServerResponse) => {
  try {
    const snapshot = await fetchEtoroAccountSnapshot();
    json(response, 200, snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected eToro sync error';
    json(response, 500, { error: message });
  }
};

const handleEtoroTest = async (_request: IncomingMessage, response: ServerResponse) => {
  try {
    const snapshot = await fetchEtoroAccountSnapshot();
    json(response, 200, {
      ok: true,
      provider: snapshot.provider,
      fetchedAt: snapshot.fetchedAt,
      requestId: snapshot.requestId,
      totalAccountValue: snapshot.totalAccountValue,
      currency: snapshot.currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected eToro sync error';
    json(response, 500, { ok: false, error: message });
  }
};

const handleFxRates = async (_request: IncomingMessage, response: ServerResponse) => {
  try {
    const snapshot = await fetchLatestFxRates();
    json(response, 200, snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected FX sync error';
    json(response, 500, { error: message });
  }
};

interface OpenBankingSessionBody {
  providerName?: string;
  connectionId?: string;
}

interface OpenBankingCompleteBody {
  sessionId?: string;
  publicToken?: string;
}

const logOpenBankingError = (operation: string, error: unknown) => {
  console.error('[open-banking] Request failed.', {
    operation,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorCode:
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : null,
    providerRequestId: error instanceof PlaidProviderError ? error.requestId : null,
  });
};

const setSessionCookie = (
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  expiresAt: string
) => {
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );
  response.setHeader('Set-Cookie', serializeSessionCookie(token, {
    secure: isSecureRequest(request),
    maxAgeSeconds,
  }));
};

const jsonAuthError = (response: ServerResponse, error: unknown) => {
  console.error('[auth] Request failed.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorCode: error instanceof ServerAuthError ? error.code : null,
  });
  if (error instanceof ServerAuthError) {
    json(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  json(response, 500, { error: 'Unexpected authentication error.', code: 'AUTH_UNEXPECTED' });
};

const requireAuthMutationRequest = (request: IncomingMessage) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
};

const requireAuthenticatedServerUser = async (
  request: IncomingMessage,
  authService: Pick<ServerAuthService, 'resolveToken'>
) => {
  const user = await authService.resolveToken(getSessionTokenFromRequest(request));
  if (!user) throw new ServerAuthError('AUTH_REQUIRED', 401, 'Authentication required.');
  return user;
};

const jsonAccountBackupError = (response: ServerResponse, error: unknown) => {
  console.error('[account-backup] Request failed.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorCode:
      error instanceof ServerAuthError || error instanceof AccountBackupError
        ? error.code
        : null,
  });
  if (error instanceof ServerAuthError || error instanceof AccountBackupError) {
    json(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  json(response, 500, { error: 'Unexpected account backup error.', code: 'ACCOUNT_BACKUP_UNEXPECTED' });
};

const assertNoClientBackupOwner = (body: Record<string, unknown>) => {
  if (
    Object.prototype.hasOwnProperty.call(body, 'email') ||
    Object.prototype.hasOwnProperty.call(body, 'userId')
  ) {
    throw new AccountBackupError(
      'ACCOUNT_BACKUP_OWNER_FORBIDDEN',
      400,
      'Backup owner fields are not accepted.'
    );
  }
};

const handleSaveAccountBackup = async (
  request: IncomingMessage,
  response: ServerResponse,
  authService: ServerAuthService,
  backupStore: AccountBackupStore
) => {
  requireAuthMutationRequest(request);
  const user = await requireAuthenticatedServerUser(request, authService);
  const body = await readJsonBody<Record<string, unknown> & { backup?: unknown }>(
    request,
    32 * 1024 * 1024
  );
  assertNoClientBackupOwner(body);
  const result = await backupStore.save({ userId: user.id, email: user.email }, body.backup);
  json(response, 200, result);
};

const handleLoadAccountBackup = async (
  request: IncomingMessage,
  response: ServerResponse,
  authService: ServerAuthService,
  backupStore: AccountBackupStore
) => {
  requireAuthMutationRequest(request);
  const user = await requireAuthenticatedServerUser(request, authService);
  const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
  assertNoClientBackupOwner(body);
  const result = await backupStore.load({ userId: user.id, email: user.email });
  json(response, 200, result);
};

const handleAuthRegister = async (
  request: IncomingMessage,
  response: ServerResponse,
  authService: ServerAuthService
) => {
  requireAuthMutationRequest(request);
  const body = await readJsonBody<{ email?: string; name?: string; password?: string }>(request, 16 * 1024);
  const result = await authService.register({
    email: body.email ?? '',
    name: body.name ?? '',
    password: body.password ?? '',
  });
  setSessionCookie(request, response, result.token, result.expiresAt);
  json(response, 201, { user: result.user });
};

const handleAuthEnroll = async (
  request: IncomingMessage,
  response: ServerResponse,
  authService: ServerAuthService
) => {
  requireAuthMutationRequest(request);
  const body = await readJsonBody<{
    userId?: string;
    email?: string;
    name?: string;
    password?: string;
  }>(request, 16 * 1024);
  const result = await authService.enroll({
    userId: body.userId ?? '',
    email: body.email ?? '',
    name: body.name ?? '',
    password: body.password ?? '',
  });
  setSessionCookie(request, response, result.token, result.expiresAt);
  json(response, 201, { user: result.user });
};

const handleAuthLogin = async (
  request: IncomingMessage,
  response: ServerResponse,
  authService: ServerAuthService
) => {
  requireAuthMutationRequest(request);
  const body = await readJsonBody<{ email?: string; password?: string }>(request, 16 * 1024);
  const result = await authService.login({
    email: body.email ?? '',
    password: body.password ?? '',
    throttleKey: request.socket.remoteAddress ?? 'unknown',
  });
  setSessionCookie(request, response, result.token, result.expiresAt);
  json(response, 200, { user: result.user });
};

const handleAuthSession = async (
  request: IncomingMessage,
  response: ServerResponse,
  authService: ServerAuthService
) => {
  const user = await authService.resolveToken(getSessionTokenFromRequest(request));
  if (!user) {
    json(response, 401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    return;
  }
  json(response, 200, { user });
};

const handleAuthLogout = async (
  request: IncomingMessage,
  response: ServerResponse,
  authService: ServerAuthService
) => {
  requireAuthMutationRequest(request);
  authService.logout(getSessionTokenFromRequest(request));
  response.setHeader('Set-Cookie', serializeExpiredSessionCookie(isSecureRequest(request)));
  json(response, 200, { ok: true });
};

const jsonOpenBankingError = (
  response: ServerResponse,
  error: unknown,
  operation: string
) => {
  logOpenBankingError(operation, error);
  if (error instanceof OpenBankingAuthenticationError) {
    json(response, 401, {
      error: 'Server-authenticated session required.',
      code: error.code,
    });
    return;
  }
  if (error instanceof ServerAuthError) {
    json(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  if (error instanceof OpenBankingConnectionOwnershipError) {
    json(response, 404, {
      error: 'Open banking connection not found.',
      code: error.code,
    });
    return;
  }
  if (error instanceof OpenBankingConnectionStateError) {
    json(response, 409, {
      error: error.message,
      code: error.code,
    });
    return;
  }
  if (error instanceof OpenBankingLinkSessionError) {
    json(response, 400, {
      error: 'Bank connection session is invalid or expired.',
      code: error.code,
    });
    return;
  }
  if (error instanceof OpenBankingConfigurationError || error instanceof OpenBankingVaultError) {
    json(response, 503, {
      error: 'Open banking is not securely configured.',
      code: error.code,
    });
    return;
  }
  if (error instanceof PlaidProviderError) {
    json(response, 502, {
      error: 'The banking provider could not complete the request.',
      code: 'OPEN_BANKING_PROVIDER_ERROR',
    });
    return;
  }
  json(response, 500, { error: 'Unexpected open banking error.' });
};

const handleCreateOpenBankingSession = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
  const principal = await authenticator.authenticate(request);
  const body = await readJsonBody<OpenBankingSessionBody>(request);
  const result = await service.createConnectionSession(principal, {
    providerName: body.providerName,
    connectionId: body.connectionId,
  });
  json(response, 200, result);
};

const handleOpenBankingPreflight = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
  const principal = await authenticator.authenticate(request);
  const result = await service.getSantanderPreflight(principal);
  json(response, 200, result);
};

const handleCompleteOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
  const principal = await authenticator.authenticate(request);
  const body = await readJsonBody<OpenBankingCompleteBody>(request);
  const result = await service.completeConnection(principal, {
    sessionId: body.sessionId,
    publicToken: body.publicToken,
  });
  json(response, 200, result);
};

const handleRefreshOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
  const principal = await authenticator.authenticate(request);
  const body = await readJsonBody<{ connectionId?: string }>(request);
  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }
  const result = await service.refreshConnection(principal, body.connectionId);
  json(response, 200, result);
};

const handleDisconnectOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
  const principal = await authenticator.authenticate(request);
  const body = await readJsonBody<{ connectionId?: string }>(request);
  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }
  const result = await service.disconnectConnection(principal, body.connectionId);
  json(response, 200, result);
};

export interface BrokerApiPluginOptions {
  accountBackupStore?: AccountBackupStore;
  authService?: ServerAuthService;
  openBankingAuthenticator?: OpenBankingRequestAuthenticator;
  openBankingService?: OpenBankingService;
}

const createDefaultOpenBankingService = () => createOpenBankingService({
  store: createDefaultOpenBankingConnectionStore(),
  linkSessions: createOpenBankingLinkSessionStore(),
  plaid: {
    createLinkToken: createPlaidLinkToken,
    exchangePublicToken: exchangePlaidPublicToken,
    fetchItem: fetchPlaidItem,
    fetchInstitution: fetchPlaidInstitution,
    fetchBalances: fetchPlaidBalances,
    removeItem: removePlaidItem,
    isLoginRequiredError: isPlaidLoginRequiredError,
    mapAccounts: (input) => mapPlaidAccountsToCashAccounts({
      ...input,
      providerName: 'plaid',
    }),
  },
});

export const brokerApiPlugin = (options: BrokerApiPluginOptions = {}): Plugin => {
  const accountBackupStore = options.accountBackupStore ?? defaultAccountBackupStore;
  const authService = options.authService ?? createDefaultServerAuthService();
  const openBankingAuthenticator =
    options.openBankingAuthenticator ?? createServerSessionOpenBankingAuthenticator(authService);
  const openBankingService = options.openBankingService ?? createDefaultOpenBankingService();
  return {
    name: 'broker-api-plugin',
    configureServer(server) {
    server.middlewares.use('/api/brokers/etoro/account', async (request, response) => {
      if (request.method !== 'GET') {
        return methodNotAllowed(response);
      }

      await handleEtoroAccount(request, response);
    });

    server.middlewares.use('/api/brokers/etoro/test', async (request, response) => {
      if (request.method !== 'GET') {
        return methodNotAllowed(response);
      }

      await handleEtoroTest(request, response);
    });

    server.middlewares.use('/api/fx/rates', async (request, response) => {
      if (request.method !== 'GET') {
        return methodNotAllowed(response);
      }

      await handleFxRates(request, response);
    });

    server.middlewares.use('/api/account-backup/save', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleSaveAccountBackup(request, response, authService, accountBackupStore);
      } catch (error) {
        jsonAccountBackupError(response, error);
      }
    });

    server.middlewares.use('/api/account-backup/load', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleLoadAccountBackup(request, response, authService, accountBackupStore);
      } catch (error) {
        jsonAccountBackupError(response, error);
      }
    });

    server.middlewares.use('/api/auth/register', async (request, response) => {
      if (request.method !== 'POST') return methodNotAllowed(response);
      try {
        await handleAuthRegister(request, response, authService);
      } catch (error) {
        jsonAuthError(response, error);
      }
    });

    server.middlewares.use('/api/auth/enroll', async (request, response) => {
      if (request.method !== 'POST') return methodNotAllowed(response);
      try {
        await handleAuthEnroll(request, response, authService);
      } catch (error) {
        jsonAuthError(response, error);
      }
    });

    server.middlewares.use('/api/auth/login', async (request, response) => {
      if (request.method !== 'POST') return methodNotAllowed(response);
      try {
        await handleAuthLogin(request, response, authService);
      } catch (error) {
        jsonAuthError(response, error);
      }
    });

    server.middlewares.use('/api/auth/session', async (request, response) => {
      if (request.method !== 'GET') return methodNotAllowed(response);
      try {
        await handleAuthSession(request, response, authService);
      } catch (error) {
        jsonAuthError(response, error);
      }
    });

    server.middlewares.use('/api/auth/logout', async (request, response) => {
      if (request.method !== 'POST') return methodNotAllowed(response);
      try {
        await handleAuthLogout(request, response, authService);
      } catch (error) {
        jsonAuthError(response, error);
      }
    });

    server.middlewares.use('/api/open-banking/session/create', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleCreateOpenBankingSession(
          request,
          response,
          openBankingService,
          openBankingAuthenticator
        );
      } catch (error) {
        jsonOpenBankingError(response, error, 'session-create');
      }
    });

    server.middlewares.use('/api/open-banking/connection/complete', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleCompleteOpenBankingConnection(
          request,
          response,
          openBankingService,
          openBankingAuthenticator
        );
      } catch (error) {
        jsonOpenBankingError(response, error, 'connection-complete');
      }
    });

    server.middlewares.use('/api/open-banking/connection/refresh', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleRefreshOpenBankingConnection(
          request,
          response,
          openBankingService,
          openBankingAuthenticator
        );
      } catch (error) {
        jsonOpenBankingError(response, error, 'connection-refresh');
      }
    });

    server.middlewares.use('/api/open-banking/connection/disconnect', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleDisconnectOpenBankingConnection(
          request,
          response,
          openBankingService,
          openBankingAuthenticator
        );
      } catch (error) {
        jsonOpenBankingError(response, error, 'connection-disconnect');
      }
    });

    server.middlewares.use('/api/open-banking/preflight', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleOpenBankingPreflight(
          request,
          response,
          openBankingService,
          openBankingAuthenticator
        );
      } catch (error) {
        jsonOpenBankingError(response, error, 'preflight');
      }
    });
    },
  };
};
