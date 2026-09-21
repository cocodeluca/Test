import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { PlaidEnvironment } from '../src/common/types';
import { fetchEtoroAccountSnapshot } from './etoro';
import { fetchLatestFxRates } from './fx';
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidBalances,
  fetchPlaidInstitution,
  fetchPlaidItem,
  fetchPlaidTransactionsSyncPage,
  isPlaidLoginRequiredError,
  mapPlaidAccountsToCashAccounts,
  mapPlaidTransactionsSyncPage,
  removePlaidItem,
  PlaidProviderError,
} from './plaid';
import {
  createDefaultOpenBankingConnectionStore,
  OpenBankingCursorStateError,
  OpenBankingConnectionOwnershipError,
  OpenBankingEnvironmentMismatchError,
  OpenBankingLegacyEnvironmentError,
  OpenBankingVaultError,
} from './openBankingStore';
import {
  createServerSessionOpenBankingAuthenticator,
  OpenBankingAuthenticationError,
  type OpenBankingRequestAuthenticator,
} from './openBankingAuth';
import {
  createFileOpenBankingLinkSessionStore,
  OpenBankingLinkSessionError,
} from './openBankingLinkSessions';
import {
  OpenBankingConfigurationError,
} from './openBankingPolicy';
import {
  OpenBankingAccountScopeError,
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
  createServerAuthService,
  getSessionTokenFromRequest,
  isSecureRequest,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
  ServerAuthError,
  type ServerAuthService,
} from './serverAuth';
import type { OperationalStores } from './operationalStore';

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
  connectionEnvironment?: unknown;
  intent?: 'connect' | 'reauthentication' | 'transactions-consent';
}

interface OpenBankingConnectionBody {
  connectionId?: string;
  connectionEnvironment?: unknown;
  cursor?: unknown;
}

interface OpenBankingCompleteBody {
  sessionId?: string;
  publicToken?: string;
  selectedAccountIds?: unknown;
}

const parseConnectionEnvironment = (value: unknown): PlaidEnvironment | null => {
  if (value === 'sandbox' || value === 'production') return value;
  throw new ServerAuthError(
    'OPEN_BANKING_ENVIRONMENT_INVALID',
    400,
    'A valid connection environment is required.'
  );
};

const logOpenBankingError = (operation: string, error: unknown) => {
  console.error('[open-banking] Request failed.', {
    operation,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorCode:
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : null,
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
  if (error instanceof OpenBankingEnvironmentMismatchError) {
    json(response, 409, {
      error: 'Open banking connection is unavailable in this provider environment.',
      code: error.code,
    });
    return;
  }
  if (
    error instanceof OpenBankingLegacyEnvironmentError ||
    error instanceof OpenBankingCursorStateError
  ) {
    json(response, 503, {
      error: 'Open banking operational state is unavailable.',
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
  if (error instanceof OpenBankingAccountScopeError) {
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
    const safeProviderValue = (value: string | null) =>
      value && /^[A-Z0-9_]+$/.test(value) ? value : null;
    const providerErrorCode = safeProviderValue(error.code);
    json(response, 502, {
      error: providerErrorCode === 'ADDITIONAL_CONSENT_REQUIRED'
        ? 'Transaction access requires additional bank consent.'
        : 'The banking provider could not complete the request.',
      code: 'OPEN_BANKING_PROVIDER_ERROR',
      providerError: {
        errorType: safeProviderValue(error.errorType),
        errorCode: providerErrorCode,
        httpStatus:
          error.httpStatus && error.httpStatus >= 400 && error.httpStatus <= 599
            ? error.httpStatus
            : null,
      },
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
  if (
    body.intent !== undefined &&
    body.intent !== 'connect' &&
    body.intent !== 'reauthentication' &&
    body.intent !== 'transactions-consent'
  ) {
    json(response, 400, { error: 'intent is invalid.' });
    return;
  }
  const result = await service.createConnectionSession(principal, {
    providerName: body.providerName,
    connectionId: body.connectionId,
    connectionEnvironment: body.connectionId
      ? parseConnectionEnvironment(body.connectionEnvironment)
      : null,
    intent: body.intent,
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

const handleListOwnedOpenBankingConnections = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  const principal = await authenticator.authenticate(request);
  json(response, 200, await service.listOwnedConnections(principal));
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
  if (
    body.selectedAccountIds !== undefined &&
    (!Array.isArray(body.selectedAccountIds) ||
      body.selectedAccountIds.length > 1000 ||
      body.selectedAccountIds.some(
        (accountId) => typeof accountId !== 'string' || accountId.length === 0
      ))
  ) {
    json(response, 400, { error: 'selectedAccountIds is invalid.' });
    return;
  }
  const result = await service.completeConnection(principal, {
    sessionId: body.sessionId,
    publicToken: body.publicToken,
    selectedAccountIds: body.selectedAccountIds as string[] | undefined,
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
  const body = await readJsonBody<OpenBankingConnectionBody>(request);
  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }
  const result = await service.refreshConnection(
    principal,
    body.connectionId,
    parseConnectionEnvironment(body.connectionEnvironment)
  );
  json(response, 200, result);
};

const handleSyncOpenBankingTransactions = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
  const principal = await authenticator.authenticate(request);
  const body = await readJsonBody<OpenBankingConnectionBody>(request);
  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'cursor')) {
    json(response, 400, { error: 'Browser transaction cursors are not accepted.' });
    return;
  }
  const result = await service.syncTransactions(
    principal,
    body.connectionId,
    parseConnectionEnvironment(body.connectionEnvironment)
  );
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
  const body = await readJsonBody<OpenBankingConnectionBody>(request);
  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }
  const result = await service.disconnectConnection(
    principal,
    body.connectionId,
    parseConnectionEnvironment(body.connectionEnvironment)
  );
  json(response, 200, result);
};

const handleDeleteOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
  assertSameOriginRequest(request);
  assertJsonRequest(request);
  const principal = await authenticator.authenticate(request);
  const body = await readJsonBody<OpenBankingConnectionBody>(request);
  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }
  const result = await service.deleteDisconnectedConnection(
    principal,
    body.connectionId,
    parseConnectionEnvironment(body.connectionEnvironment)
  );
  json(response, 200, result);
};

export interface BrokerApiPluginOptions {
  accountBackupStore?: AccountBackupStore;
  authService?: ServerAuthService;
  openBankingAuthenticator?: OpenBankingRequestAuthenticator;
  openBankingService?: OpenBankingService;
  operationalStores?: OperationalStores;
}

const createDefaultOpenBankingService = (stores?: OperationalStores) => createOpenBankingService({
  store: stores?.providerConnections ?? createDefaultOpenBankingConnectionStore(),
  linkSessions: stores?.linkSessions ?? createFileOpenBankingLinkSessionStore({
    filePath: path.resolve(process.cwd(), '.data', 'open-banking-link-sessions.json'),
  }),
  plaid: {
    createLinkToken: createPlaidLinkToken,
    exchangePublicToken: exchangePlaidPublicToken,
    fetchItem: fetchPlaidItem,
    fetchInstitution: fetchPlaidInstitution,
    fetchBalances: fetchPlaidBalances,
    fetchTransactions: async (accessToken, cursor) =>
      mapPlaidTransactionsSyncPage(
        await fetchPlaidTransactionsSyncPage(accessToken, cursor)
      ),
    removeItem: removePlaidItem,
    isLoginRequiredError: isPlaidLoginRequiredError,
    mapAccounts: (input) => mapPlaidAccountsToCashAccounts({
      ...input,
      providerName: 'plaid',
    }),
  },
});

export interface BrokerApiRoute {
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
}

export interface BrokerApiApplication {
  readonly routes: readonly BrokerApiRoute[];
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

export const createBrokerApiApplication = (
  options: BrokerApiPluginOptions = {}
): BrokerApiApplication => {
  const accountBackupStore = options.accountBackupStore ?? defaultAccountBackupStore;
  const authService = options.authService ?? (options.operationalStores
    ? createServerAuthService({
        users: options.operationalStores.users,
        sessions: options.operationalStores.sessions,
      })
    : createDefaultServerAuthService());
  const openBankingAuthenticator = options.openBankingAuthenticator ??
    createServerSessionOpenBankingAuthenticator(authService);
  const openBankingService = options.openBankingService ??
    createDefaultOpenBankingService(options.operationalStores);

  const route = (
    path: string,
    method: 'GET' | 'POST',
    handler: BrokerApiRoute['handle']
  ): BrokerApiRoute => ({
    path,
    method,
    async handle(request, response) {
      if (request.method !== method) return methodNotAllowed(response);
      await handler(request, response);
    },
  });
  const accountRoute = (path: string, handler: BrokerApiRoute['handle']) =>
    route(path, 'POST', async (request, response) => {
      try { await handler(request, response); } catch (error) { jsonAccountBackupError(response, error); }
    });
  const authRoute = (path: string, method: 'GET' | 'POST', handler: BrokerApiRoute['handle']) =>
    route(path, method, async (request, response) => {
      try { await handler(request, response); } catch (error) { jsonAuthError(response, error); }
    });
  const bankingRoute = (path: string, method: 'GET' | 'POST', operation: string,
    handler: BrokerApiRoute['handle']) => route(path, method, async (request, response) => {
      try { await handler(request, response); } catch (error) { jsonOpenBankingError(response, error, operation); }
    });

  const routes: BrokerApiRoute[] = [
    route('/api/health', 'GET', async (_request, response) => {
      json(response, 200, { status: 'ready' });
    }),
    route('/api/brokers/etoro/account', 'GET', handleEtoroAccount),
    route('/api/brokers/etoro/test', 'GET', handleEtoroTest),
    route('/api/fx/rates', 'GET', handleFxRates),
    accountRoute('/api/account-backup/save', (request, response) =>
      handleSaveAccountBackup(request, response, authService, accountBackupStore)),
    accountRoute('/api/account-backup/load', (request, response) =>
      handleLoadAccountBackup(request, response, authService, accountBackupStore)),
    authRoute('/api/auth/register', 'POST', (request, response) =>
      handleAuthRegister(request, response, authService)),
    authRoute('/api/auth/enroll', 'POST', (request, response) =>
      handleAuthEnroll(request, response, authService)),
    authRoute('/api/auth/login', 'POST', (request, response) =>
      handleAuthLogin(request, response, authService)),
    authRoute('/api/auth/session', 'GET', (request, response) =>
      handleAuthSession(request, response, authService)),
    authRoute('/api/auth/logout', 'POST', (request, response) =>
      handleAuthLogout(request, response, authService)),
    bankingRoute('/api/open-banking/session/create', 'POST', 'session-create',
      (request, response) => handleCreateOpenBankingSession(
        request, response, openBankingService, openBankingAuthenticator)),
    bankingRoute('/api/open-banking/connection/complete', 'POST', 'connection-complete',
      (request, response) => handleCompleteOpenBankingConnection(
        request, response, openBankingService, openBankingAuthenticator)),
    bankingRoute('/api/open-banking/connection/refresh', 'POST', 'connection-refresh',
      (request, response) => handleRefreshOpenBankingConnection(
        request, response, openBankingService, openBankingAuthenticator)),
    bankingRoute('/api/open-banking/connection/disconnect', 'POST', 'connection-disconnect',
      (request, response) => handleDisconnectOpenBankingConnection(
        request, response, openBankingService, openBankingAuthenticator)),
    bankingRoute('/api/open-banking/transactions/sync', 'POST', 'transactions-sync',
      (request, response) => handleSyncOpenBankingTransactions(
        request, response, openBankingService, openBankingAuthenticator)),
    bankingRoute('/api/open-banking/connection/delete', 'POST', 'connection-delete',
      (request, response) => handleDeleteOpenBankingConnection(
        request, response, openBankingService, openBankingAuthenticator)),
    bankingRoute('/api/open-banking/preflight', 'POST', 'preflight',
      (request, response) => handleOpenBankingPreflight(
        request, response, openBankingService, openBankingAuthenticator)),
    bankingRoute('/api/open-banking/connections', 'GET', 'connections-list',
      (request, response) => handleListOwnedOpenBankingConnections(
        request, response, openBankingService, openBankingAuthenticator)),
  ];

  const routeByPath = new Map(routes.map((candidate) => [candidate.path, candidate]));
  return {
    routes,
    async handle(request, response) {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost');
      const matched = routeByPath.get(requestUrl.pathname);
      if (!matched) return false;
      await matched.handle(request, response);
      return true;
    },
  };
};
