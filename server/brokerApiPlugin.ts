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
  OpenBankingAuthenticationError,
  type OpenBankingRequestAuthenticator,
  unavailableOpenBankingAuthenticator,
} from './openBankingAuth';
import {
  createOpenBankingLinkSessionStore,
  OpenBankingLinkSessionError,
} from './openBankingLinkSessions';
import {
  OpenBankingConfigurationError,
} from './openBankingPolicy';
import {
  createOpenBankingService,
  type OpenBankingService,
} from './openBankingService';
import {
  loadAccountBackupFromStore,
  saveAccountBackupToStore,
} from './accountBackupStore';

const json = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const methodNotAllowed = (response: ServerResponse) =>
  json(response, 405, { error: 'Method not allowed' });

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> =>
  new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk.toString();
    });

    request.on('end', () => {
      try {
        resolve((body ? JSON.parse(body) : {}) as T);
      } catch (error) {
        reject(error);
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

const handleSaveAccountBackup = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const body = await readJsonBody<{ email?: string; backup?: unknown }>(request);
    const result = await saveAccountBackupToStore(body.email ?? '', body.backup);
    json(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected account backup save error';
    json(response, 500, { error: message });
  }
};

const handleLoadAccountBackup = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const body = await readJsonBody<{ email?: string }>(request);
    const result = await loadAccountBackupFromStore(body.email ?? '');
    json(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected account backup load error';
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
  if (error instanceof OpenBankingConnectionOwnershipError) {
    json(response, 404, {
      error: 'Open banking connection not found.',
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
  const principal = await authenticator.authenticate(request);
  const body = await readJsonBody<OpenBankingSessionBody>(request);
  const result = await service.createConnectionSession(principal, {
    providerName: body.providerName,
    connectionId: body.connectionId,
  });
  json(response, 200, result);
};

const handleCompleteOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: OpenBankingService,
  authenticator: OpenBankingRequestAuthenticator
) => {
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
  const openBankingAuthenticator =
    options.openBankingAuthenticator ?? unavailableOpenBankingAuthenticator;
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

      await handleSaveAccountBackup(request, response);
    });

    server.middlewares.use('/api/account-backup/load', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      await handleLoadAccountBackup(request, response);
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
    },
  };
};
