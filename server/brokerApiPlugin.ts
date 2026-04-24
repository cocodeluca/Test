import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { fetchEtoroAccountSnapshot } from './etoro';
import { fetchLatestFxRates } from './fx';
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidBalances,
  fetchPlaidItem,
  isPlaidLoginRequiredError,
  mapPlaidAccountsToCashAccounts,
  removePlaidItem,
} from './plaid';
import {
  deleteOpenBankingConnection,
  loadOpenBankingConnection,
  saveOpenBankingConnection,
  updateOpenBankingConnection,
} from './openBankingStore';
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
  userId?: string;
  connectionId?: string;
}

interface OpenBankingCompleteBody {
  providerName?: string;
  userId?: string;
  publicToken?: string;
  institutionName?: string;
  institutionId?: string;
  selectedAccountIds?: string[];
  connectionId?: string;
}

const jsonError = (response: ServerResponse, error: unknown, fallbackMessage: string) => {
  const message = error instanceof Error ? error.message : fallbackMessage;
  json(response, 500, { error: message });
};

const handleCreateOpenBankingSession = async (
  request: IncomingMessage,
  response: ServerResponse
) => {
  const body = await readJsonBody<OpenBankingSessionBody>(request);
  const providerName = body.providerName ?? 'mock-bank';

  if (providerName !== 'plaid') {
    json(response, 200, {
      providerName,
      mode: 'create',
      status: 'mock',
    });
    return;
  }

  if (!body.userId) {
    json(response, 400, { error: 'userId is required.' });
    return;
  }

  const storedConnection = body.connectionId
    ? await loadOpenBankingConnection(body.connectionId)
    : null;
  const result = await createPlaidLinkToken({
    userId: body.userId,
    accessToken: storedConnection?.accessToken ?? null,
  });

  json(response, 200, {
    providerName,
    mode: result.mode,
    status: 'redirect-required',
    linkToken: result.linkToken,
    expiration: result.expiration ?? null,
    connectionId: body.connectionId ?? null,
  });
};

const handleCompleteOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse
) => {
  const body = await readJsonBody<OpenBankingCompleteBody>(request);
  const providerName = body.providerName ?? 'mock-bank';

  if (providerName !== 'plaid') {
    json(response, 400, { error: 'Only Plaid is supported by the real backend flow.' });
    return;
  }

  if (!body.userId || !body.publicToken) {
    json(response, 400, { error: 'userId and publicToken are required.' });
    return;
  }

  const syncedAt = new Date().toISOString();
  const existingConnection = body.connectionId
    ? await loadOpenBankingConnection(body.connectionId)
    : null;

  const exchanged = existingConnection
    ? null
    : await exchangePlaidPublicToken(body.publicToken);
  const accessToken = existingConnection?.accessToken ?? exchanged?.access_token;

  if (!accessToken) {
    json(response, 500, { error: 'Missing Plaid access token after connection completion.' });
    return;
  }

  const balances = await fetchPlaidBalances(accessToken);
  const item = await fetchPlaidItem(accessToken);
  const connectionId = body.connectionId ?? `connection-${Date.now()}`;
  const institutionId =
    body.institutionId ||
    existingConnection?.institutionId ||
    balances.item?.institution_id ||
    item.item.institution_id ||
    `plaid-institution-${Date.now()}`;
  const institutionName = body.institutionName || existingConnection?.institutionName || 'Connected institution';

  const mappedAccounts = mapPlaidAccountsToCashAccounts({
    userId: body.userId,
    providerName: 'plaid',
    connectionId,
    institutionName,
    institutionId,
    accounts: balances.accounts,
    selectedAccountIds: body.selectedAccountIds ?? existingConnection?.selectedAccountIds ?? [],
    syncedAt,
  });

  const storedConnection = await saveOpenBankingConnection({
    id: connectionId,
    userId: body.userId,
    providerName: 'plaid',
    institutionName,
    institutionId,
    accessToken,
    itemId: existingConnection?.itemId ?? exchanged?.item_id ?? item.item.item_id,
    selectedAccountIds: body.selectedAccountIds ?? existingConnection?.selectedAccountIds ?? [],
    consentExpirationTime:
      balances.item?.consent_expiration_time ?? item.item.consent_expiration_time ?? null,
    createdAt: existingConnection?.createdAt ?? syncedAt,
    updatedAt: syncedAt,
  });

  json(response, 200, {
    connection: {
      id: storedConnection.id,
      userId: storedConnection.userId,
      providerName: storedConnection.providerName,
      institutionName: storedConnection.institutionName,
      institutionId: storedConnection.institutionId,
      connectionStatus: 'connected',
      syncStatus: 'success',
      lastSyncedAt: syncedAt,
      needsReauth: false,
      errorMessage: null,
      linkedAccountIds: mappedAccounts.map((account) => account.id),
      createdAt: storedConnection.createdAt,
      updatedAt: storedConnection.updatedAt,
    },
    accounts: mappedAccounts,
  });
};

const handleRefreshOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse
) => {
  const body = await readJsonBody<{ connectionId?: string }>(request);

  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }

  const storedConnection = await loadOpenBankingConnection(body.connectionId);

  if (!storedConnection) {
    json(response, 404, { error: 'Stored open banking connection not found.' });
    return;
  }

  try {
    const balances = await fetchPlaidBalances(storedConnection.accessToken);
    const syncedAt = new Date().toISOString();
    const mappedAccounts = mapPlaidAccountsToCashAccounts({
      userId: storedConnection.userId,
      providerName: 'plaid',
      connectionId: storedConnection.id,
      institutionName: storedConnection.institutionName,
      institutionId: storedConnection.institutionId,
      accounts: balances.accounts,
      selectedAccountIds: storedConnection.selectedAccountIds,
      syncedAt,
    });
    await updateOpenBankingConnection(storedConnection.id, {
      selectedAccountIds: storedConnection.selectedAccountIds,
      consentExpirationTime: balances.item?.consent_expiration_time ?? null,
      updatedAt: syncedAt,
    });

    json(response, 200, {
      connection: {
        id: storedConnection.id,
        userId: storedConnection.userId,
        providerName: storedConnection.providerName,
        institutionName: storedConnection.institutionName,
        institutionId: storedConnection.institutionId,
        connectionStatus: 'connected',
        syncStatus: 'success',
        lastSyncedAt: syncedAt,
        needsReauth: false,
        errorMessage: null,
        linkedAccountIds: mappedAccounts.map((account) => account.id),
        createdAt: storedConnection.createdAt,
        updatedAt: syncedAt,
      },
      accounts: mappedAccounts,
    });
  } catch (error) {
    if (isPlaidLoginRequiredError(error)) {
      await updateOpenBankingConnection(storedConnection.id, {
        updatedAt: new Date().toISOString(),
      });

      json(response, 200, {
        connection: {
          id: storedConnection.id,
          userId: storedConnection.userId,
          providerName: storedConnection.providerName,
          institutionName: storedConnection.institutionName,
          institutionId: storedConnection.institutionId,
          connectionStatus: 'needs-reauthentication',
          syncStatus: 'needs-reauth',
          lastSyncedAt: null,
          needsReauth: true,
          errorMessage: error instanceof Error ? error.message : 'Connection requires reauthentication.',
          linkedAccountIds: storedConnection.selectedAccountIds,
          createdAt: storedConnection.createdAt,
          updatedAt: new Date().toISOString(),
        },
        accounts: [],
      });
      return;
    }

    throw error;
  }
};

const handleDisconnectOpenBankingConnection = async (
  request: IncomingMessage,
  response: ServerResponse
) => {
  const body = await readJsonBody<{ connectionId?: string }>(request);

  if (!body.connectionId) {
    json(response, 400, { error: 'connectionId is required.' });
    return;
  }

  const storedConnection = await loadOpenBankingConnection(body.connectionId);

  if (!storedConnection) {
    json(response, 404, { error: 'Stored open banking connection not found.' });
    return;
  }

  await removePlaidItem(storedConnection.accessToken);
  await deleteOpenBankingConnection(storedConnection.id);

  json(response, 200, {
    ok: true,
    connectionId: storedConnection.id,
  });
};

export const brokerApiPlugin = (): Plugin => ({
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
        await handleCreateOpenBankingSession(request, response);
      } catch (error) {
        jsonError(response, error, 'Unexpected open banking session error');
      }
    });

    server.middlewares.use('/api/open-banking/connection/complete', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleCompleteOpenBankingConnection(request, response);
      } catch (error) {
        jsonError(response, error, 'Unexpected open banking completion error');
      }
    });

    server.middlewares.use('/api/open-banking/connection/refresh', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleRefreshOpenBankingConnection(request, response);
      } catch (error) {
        jsonError(response, error, 'Unexpected open banking refresh error');
      }
    });

    server.middlewares.use('/api/open-banking/connection/disconnect', async (request, response) => {
      if (request.method !== 'POST') {
        return methodNotAllowed(response);
      }

      try {
        await handleDisconnectOpenBankingConnection(request, response);
      } catch (error) {
        jsonError(response, error, 'Unexpected open banking disconnect error');
      }
    });
  },
});
