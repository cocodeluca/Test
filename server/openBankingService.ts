import { randomUUID } from 'node:crypto';
import type { BankConnection, CashAccount } from '../src/common/types';
import type { AuthenticatedOpenBankingPrincipal } from './openBankingAuth';
import type { OpenBankingLinkSessionStore } from './openBankingLinkSessions';
import {
  OpenBankingConfigurationError,
  inspectPlaidPilotConfiguration,
  type PlaidPilotConfigurationStatus,
  type PlaidPreflightIssue,
  readPlaidPilotConfiguration,
  SANTANDER_SPAIN_INSTITUTION_ID,
  validatePlaidInstitutionForConfiguration,
  validateSantanderSpainInstitution,
} from './openBankingPolicy';
import {
  OpenBankingConnectionOwnershipError,
  type OpenBankingConnectionStore,
  type StoredOpenBankingConnection,
} from './openBankingStore';
import type { PlaidAccount, PlaidAccountsBalanceResponse, PlaidItemGetResponse } from './plaid';

export interface SanitizedProviderConnectionResult {
  connection: BankConnection;
  accounts: CashAccount[];
}

export interface PlaidPilotGateway {
  createLinkToken(input: {
    userId: string;
    accessToken?: string | null;
  }): Promise<{ linkToken: string; expiration?: string; mode: 'create' | 'update' }>;
  exchangePublicToken(publicToken: string): Promise<{ access_token: string; item_id: string }>;
  fetchItem(accessToken: string): Promise<PlaidItemGetResponse>;
  fetchInstitution(institutionId: string): Promise<{
    institutionId: string;
    name: string;
    countryCodes: string[];
    products: string[];
    oauth?: boolean;
  }>;
  fetchBalances(accessToken: string): Promise<PlaidAccountsBalanceResponse>;
  removeItem(accessToken: string): Promise<unknown>;
  isLoginRequiredError(error: unknown): boolean;
  mapAccounts(input: {
    userId: string;
    connectionId: string;
    institutionName: string;
    institutionId: string;
    accounts: PlaidAccount[];
    selectedAccountIds?: string[];
    syncedAt: string;
  }): CashAccount[];
}

export interface OpenBankingService {
  getSantanderPreflight(
    principal: AuthenticatedOpenBankingPrincipal
  ): Promise<{
    ready: boolean;
    configuration: PlaidPilotConfigurationStatus;
    institution: {
      institutionId: typeof SANTANDER_SPAIN_INSTITUTION_ID;
      countryCode: 'ES';
      clientAccessConfirmed: boolean;
      name: string | null;
      accountsSupported: boolean;
      balancesSupported: boolean;
      oauthSupported: boolean;
    };
    issues: Array<PlaidPreflightIssue | 'PLAID_INSTITUTION_LOOKUP_FAILED' | 'SANTANDER_CAPABILITIES_INVALID'>;
  }>;
  createConnectionSession(
    principal: AuthenticatedOpenBankingPrincipal,
    input: { providerName?: string; connectionId?: string | null }
  ): Promise<{
    sessionId: string;
    providerName: 'plaid';
    status: 'redirect-required';
    linkToken: string;
    expiration: string | null;
    mode: 'create' | 'update';
    connectionId: string | null;
  }>;
  completeConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    input: { sessionId?: string; publicToken?: string }
  ): Promise<SanitizedProviderConnectionResult>;
  refreshConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    connectionId: string
  ): Promise<SanitizedProviderConnectionResult>;
  disconnectConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    connectionId: string
  ): Promise<{ ok: true; connectionId: string }>;
  deleteDisconnectedConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    connectionId: string
  ): Promise<{ ok: true; connectionId: string; deleted: boolean }>;
}

export class OpenBankingConnectionStateError extends Error {
  readonly code = 'OPEN_BANKING_CONNECTION_STATE_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'OpenBankingConnectionStateError';
  }
}

const requireOwnedConnection = async (
  store: OpenBankingConnectionStore,
  principal: AuthenticatedOpenBankingPrincipal,
  connectionId: string,
  configuration = readPlaidPilotConfiguration()
) => {
  const connection = await store.loadOwned(principal.userId, connectionId);
  if (!connection) throw new OpenBankingConnectionOwnershipError();
  if (
    connection.providerName !== 'plaid' ||
    (configuration.environment !== 'sandbox' &&
      connection.institutionId !== SANTANDER_SPAIN_INSTITUTION_ID)
  ) {
    throw new OpenBankingConfigurationError(
      'The stored connection is not approved for the configured Plaid environment.'
    );
  }
  return connection;
};

const requireLiveProviderItem = (connection: StoredOpenBankingConnection) => {
  if (
    connection.providerItemStatus !== 'active' ||
    !connection.accessToken ||
    !connection.itemId
  ) {
    throw new OpenBankingConnectionStateError(
      'Open banking connection is disconnected. Connect again before refreshing or reauthenticating.'
    );
  }
  return {
    accessToken: connection.accessToken,
    itemId: connection.itemId,
  };
};

const sanitizeConnection = (
  stored: StoredOpenBankingConnection,
  accounts: CashAccount[],
  syncedAt: string
): BankConnection => ({
  id: stored.id,
  userId: stored.userId,
  providerName: stored.providerName,
  institutionName: stored.institutionName,
  institutionId: stored.institutionId,
  connectionStatus: 'connected',
  syncStatus: 'success',
  lastSyncedAt: syncedAt,
  needsReauth: false,
  errorMessage: null,
  linkedAccountIds: accounts.map((account) => account.id),
  createdAt: stored.createdAt,
  updatedAt: stored.updatedAt,
});

export const createOpenBankingService = (dependencies: {
  store: OpenBankingConnectionStore;
  linkSessions: OpenBankingLinkSessionStore;
  plaid: PlaidPilotGateway;
  now?: () => Date;
  createConnectionId?: () => string;
}): OpenBankingService => {
  const now = dependencies.now ?? (() => new Date());
  const createConnectionId = dependencies.createConnectionId ?? (() => `connection-${randomUUID()}`);

  return {
    async getSantanderPreflight(_principal) {
      const configuration = inspectPlaidPilotConfiguration();
      const unavailableInstitution = {
        institutionId: SANTANDER_SPAIN_INSTITUTION_ID as typeof SANTANDER_SPAIN_INSTITUTION_ID,
        countryCode: 'ES' as const,
        clientAccessConfirmed: false,
        name: null,
        accountsSupported: false,
        balancesSupported: false,
        oauthSupported: false,
      };
      if (!configuration.ready) {
        return {
          ready: false,
          configuration,
          institution: unavailableInstitution,
          issues: configuration.issues,
        };
      }

      try {
        const institution = await dependencies.plaid.fetchInstitution(
          SANTANDER_SPAIN_INSTITUTION_ID
        );
        const accountsSupported = institution.products.includes('auth');
        const balancesSupported = institution.products.includes('balance');
        const oauthSupported = institution.oauth === true;
        try {
          validateSantanderSpainInstitution(institution);
        } catch {
          return {
            ready: false,
            configuration,
            institution: {
              institutionId: SANTANDER_SPAIN_INSTITUTION_ID,
              countryCode: 'ES',
              clientAccessConfirmed: true,
              name: institution.name,
              accountsSupported,
              balancesSupported,
              oauthSupported,
            },
            issues: ['SANTANDER_CAPABILITIES_INVALID'],
          };
        }
        return {
          ready: true,
          configuration,
          institution: {
            institutionId: SANTANDER_SPAIN_INSTITUTION_ID,
            countryCode: 'ES',
            clientAccessConfirmed: true,
            name: institution.name,
            accountsSupported,
            balancesSupported,
            oauthSupported,
          },
          issues: [],
        };
      } catch {
        return {
          ready: false,
          configuration,
          institution: unavailableInstitution,
          issues: ['PLAID_INSTITUTION_LOOKUP_FAILED'],
        };
      }
    },

    async createConnectionSession(principal, input) {
      const configuration = readPlaidPilotConfiguration();
      if (input.providerName !== 'plaid') {
        throw new OpenBankingConfigurationError('Only Plaid is permitted for this banking flow.');
      }

      const existingConnection = input.connectionId
        ? await requireOwnedConnection(
            dependencies.store,
            principal,
            input.connectionId,
            configuration
          )
        : null;
      const mode = existingConnection?.providerItemStatus === 'active' ? 'update' : 'create';
      const liveItem = mode === 'update' && existingConnection
        ? requireLiveProviderItem(existingConnection)
        : null;
      const linkResult = await dependencies.plaid.createLinkToken({
        userId: principal.userId,
        accessToken: liveItem?.accessToken ?? null,
      });
      if (linkResult.mode !== mode) {
        throw new OpenBankingConnectionStateError(
          'Plaid Link mode did not match the connection lifecycle.'
        );
      }
      const session = dependencies.linkSessions.create({
        ownerUserId: principal.userId,
        connectionId: existingConnection?.id ?? null,
        mode,
      });
      return {
        sessionId: session.id,
        providerName: 'plaid',
        status: 'redirect-required',
        linkToken: linkResult.linkToken,
        expiration: linkResult.expiration ?? null,
        mode,
        connectionId: existingConnection?.id ?? null,
      };
    },

    async completeConnection(principal, input) {
      const configuration = readPlaidPilotConfiguration();
      if (!input.sessionId) {
        throw new OpenBankingConfigurationError('A server-issued Link session is required.');
      }
      const session = dependencies.linkSessions.consume(input.sessionId, principal.userId);
      const existingConnection = session.connectionId
        ? await requireOwnedConnection(
            dependencies.store,
            principal,
            session.connectionId,
            configuration
          )
        : null;
      const liveItem = session.mode === 'update' && existingConnection
        ? requireLiveProviderItem(existingConnection)
        : null;
      if (session.mode === 'create' && existingConnection?.providerItemStatus === 'active') {
        throw new OpenBankingConnectionStateError(
          'The connection already has a live Plaid Item.'
        );
      }
      if (session.mode === 'create' && !input.publicToken) {
        throw new OpenBankingConfigurationError('A Plaid public token is required.');
      }

      let exchangedAccessToken: string | null = null;
      let exchangedItemId: string | null = null;
      if (session.mode === 'create') {
        const exchanged = await dependencies.plaid.exchangePublicToken(input.publicToken!);
        exchangedAccessToken = exchanged.access_token;
        exchangedItemId = exchanged.item_id;
      }
      const accessToken = liveItem?.accessToken ?? exchangedAccessToken;
      if (!accessToken) {
        throw new OpenBankingConfigurationError('Plaid access token exchange failed.');
      }

      try {
        const [item, balances] = await Promise.all([
          dependencies.plaid.fetchItem(accessToken),
          dependencies.plaid.fetchBalances(accessToken),
        ]);
        const institutionId = item.item.institution_id ?? balances.item?.institution_id;
        if (
          !institutionId ||
          (configuration.environment !== 'sandbox' &&
            institutionId !== SANTANDER_SPAIN_INSTITUTION_ID)
        ) {
          throw new OpenBankingConfigurationError(
            'The connected institution is not approved for this pilot.'
          );
        }
        if (
          session.mode === 'create' &&
          existingConnection &&
          institutionId !== existingConnection.institutionId
        ) {
          throw new OpenBankingConnectionStateError(
            'Connect again must use the same institution to preserve connection history safely.'
          );
        }
        const institution = await dependencies.plaid.fetchInstitution(institutionId);
        validatePlaidInstitutionForConfiguration(
          institution,
          configuration,
          institutionId
        );

        const syncedAt = now().toISOString();
        const connectionId = existingConnection?.id ?? createConnectionId();
        const selectedAccountIds = balances.accounts.map((account) => account.account_id);
        const accounts = dependencies.plaid.mapAccounts({
          userId: principal.userId,
          connectionId,
          institutionName: institution.name,
          institutionId: institution.institutionId,
          accounts: balances.accounts,
          selectedAccountIds,
          syncedAt,
        });
        const stored = await dependencies.store.save({
          id: connectionId,
          userId: principal.userId,
          providerName: 'plaid',
          institutionName: institution.name,
          institutionId: institution.institutionId,
          accessToken,
          itemId: liveItem?.itemId ?? exchangedItemId ?? item.item.item_id,
          providerItemStatus: 'active',
          disconnectedAt: null,
          revokedItems: existingConnection?.revokedItems ?? [],
          selectedAccountIds,
          consentExpirationTime:
            balances.item?.consent_expiration_time ?? item.item.consent_expiration_time ?? null,
          createdAt: existingConnection?.createdAt ?? syncedAt,
          updatedAt: syncedAt,
        });
        return {
          connection: sanitizeConnection(stored, accounts, syncedAt),
          accounts,
        };
      } catch (error) {
        if (session.mode === 'create' && exchangedAccessToken) {
          try {
            await dependencies.plaid.removeItem(exchangedAccessToken);
          } catch {
            // The original validation/provider error remains authoritative.
          }
        }
        throw error;
      }
    },

    async refreshConnection(principal, connectionId) {
      const configuration = readPlaidPilotConfiguration();
      const stored = await requireOwnedConnection(
        dependencies.store,
        principal,
        connectionId,
        configuration
      );
      const liveItem = requireLiveProviderItem(stored);
      try {
        const balances = await dependencies.plaid.fetchBalances(liveItem.accessToken);
        const syncedAt = now().toISOString();
        const accounts = dependencies.plaid.mapAccounts({
          userId: principal.userId,
          connectionId: stored.id,
          institutionName: stored.institutionName,
          institutionId: stored.institutionId,
          accounts: balances.accounts,
          selectedAccountIds: stored.selectedAccountIds,
          syncedAt,
        });
        const updated = await dependencies.store.updateOwned(principal.userId, stored.id, {
          selectedAccountIds: stored.selectedAccountIds,
          consentExpirationTime: balances.item?.consent_expiration_time ?? null,
          updatedAt: syncedAt,
        });
        return {
          connection: sanitizeConnection(updated, accounts, syncedAt),
          accounts,
        };
      } catch (error) {
        if (!dependencies.plaid.isLoginRequiredError(error)) throw error;
        const updatedAt = now().toISOString();
        const updated = await dependencies.store.updateOwned(principal.userId, stored.id, {
          updatedAt,
        });
        return {
          connection: {
            id: updated.id,
            userId: updated.userId,
            providerName: updated.providerName,
            institutionName: updated.institutionName,
            institutionId: updated.institutionId,
            connectionStatus: 'needs-reauthentication',
            syncStatus: 'needs-reauth',
            lastSyncedAt: null,
            needsReauth: true,
            errorMessage: 'Connection requires reauthentication.',
            linkedAccountIds: [],
            createdAt: updated.createdAt,
            updatedAt,
          },
          accounts: [],
        };
      }
    },

    async disconnectConnection(principal, connectionId) {
      const configuration = readPlaidPilotConfiguration();
      const stored = await requireOwnedConnection(
        dependencies.store,
        principal,
        connectionId,
        configuration
      );
      if (stored.providerItemStatus === 'disconnected') {
        return { ok: true, connectionId: stored.id };
      }
      const liveItem = requireLiveProviderItem(stored);
      await dependencies.plaid.removeItem(liveItem.accessToken);
      const revokedAt = now().toISOString();
      await dependencies.store.markDisconnectedOwned(principal.userId, stored.id, {
        revokedAt,
        expectedItemId: liveItem.itemId,
      });
      return { ok: true, connectionId: stored.id };
    },

    async deleteDisconnectedConnection(principal, connectionId) {
      const stored = await dependencies.store.loadOwned(principal.userId, connectionId);
      if (!stored) return { ok: true, connectionId, deleted: false };
      if (stored.providerItemStatus !== 'disconnected') {
        throw new OpenBankingConnectionStateError(
          'Only a disconnected open banking connection can be deleted.'
        );
      }
      const deleted = await dependencies.store.deleteOwned(principal.userId, connectionId);
      return { ok: true, connectionId, deleted };
    },
  };
};
