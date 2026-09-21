import { randomBytes, randomUUID } from 'node:crypto';
import type { BankConnection, CashAccount, PlaidEnvironment } from '../src/common/types';
import type { ProviderTransactionPage } from '../src/common/utils/bankTransactions';
import type { AuthenticatedOpenBankingPrincipal } from './openBankingAuth';
import type {
  OpenBankingLinkSessionIntent,
  OpenBankingLinkSessionStore,
} from './openBankingLinkSessions';
import { OpenBankingLinkSessionError } from './openBankingLinkSessions';
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
  OpenBankingEnvironmentMismatchError,
  type OpenBankingConnectionStore,
  type StoredOpenBankingConnection,
} from './openBankingStore';
import type { PlaidAccount, PlaidAccountsBalanceResponse, PlaidItemGetResponse } from './plaid';
import {
  createMemoryOAuthRecoveryStore,
  type OAuthRecoveryRecord,
  type OAuthRecoveryStore,
} from './operationalStore';

export interface SanitizedProviderConnectionResult {
  connection: BankConnection;
  accounts: CashAccount[];
}

export interface SanitizedOwnedProviderConnection {
  id: string;
  providerName: 'plaid';
  providerEnvironment: PlaidEnvironment;
  institutionName: string;
  institutionId: string;
  status: StoredOpenBankingConnection['providerItemStatus'];
  recoveryRequired: boolean;
  recoverySafe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlaidPilotGateway {
  createLinkToken(input: {
    userId: string;
    accessToken?: string | null;
    intent?: OpenBankingLinkSessionIntent;
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
  fetchTransactions(
    accessToken: string,
    cursor?: string | null
  ): Promise<ProviderTransactionPage>;
  removeItem(accessToken: string): Promise<unknown>;
  isLoginRequiredError(error: unknown): boolean;
  mapAccounts(input: {
    userId: string;
    providerEnvironment: PlaidEnvironment;
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
    input: {
      providerName?: string;
      connectionId?: string | null;
      connectionEnvironment?: PlaidEnvironment | null;
      intent?: OpenBankingLinkSessionIntent;
    }
  ): Promise<{
    sessionId: string;
    providerName: 'plaid';
    providerEnvironment: PlaidEnvironment;
    status: 'redirect-required';
    createdAt: string;
    linkToken: string;
    expiration: string | null;
    mode: 'create' | 'update';
    connectionId: string | null;
    intent: OpenBankingLinkSessionIntent;
  }>;
  resumeOAuth(
    principal: AuthenticatedOpenBankingPrincipal,
    input: { receivedRedirectUri?: string }
  ): Promise<{
    sessionId: string;
    providerName: 'plaid';
    providerEnvironment: PlaidEnvironment;
    status: 'redirect-required';
    createdAt: string;
    linkToken: string;
    expiration: string;
    mode: 'create' | 'update';
    connectionId: string | null;
    intent: OpenBankingLinkSessionIntent;
    receivedRedirectUri: string;
  }>;
  completeConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    input: {
      sessionId?: string;
      publicToken?: string;
      selectedAccountIds?: string[];
    }
  ): Promise<SanitizedProviderConnectionResult>;
  refreshConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    connectionId: string,
    connectionEnvironment: PlaidEnvironment | null
  ): Promise<SanitizedProviderConnectionResult>;
  syncTransactions(
    principal: AuthenticatedOpenBankingPrincipal,
    connectionId: string,
    connectionEnvironment: PlaidEnvironment | null
  ): Promise<ProviderTransactionPage>;
  disconnectConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    connectionId: string,
    connectionEnvironment: PlaidEnvironment | null
  ): Promise<{ ok: true; connectionId: string }>;
  deleteDisconnectedConnection(
    principal: AuthenticatedOpenBankingPrincipal,
    connectionId: string,
    connectionEnvironment: PlaidEnvironment | null
  ): Promise<{ ok: true; connectionId: string; deleted: boolean }>;
  listOwnedConnections(
    principal: AuthenticatedOpenBankingPrincipal
  ): Promise<{ connections: SanitizedOwnedProviderConnection[] }>;
}

export class OpenBankingConnectionStateError extends Error {
  readonly code = 'OPEN_BANKING_CONNECTION_STATE_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'OpenBankingConnectionStateError';
  }
}

export class OpenBankingAccountScopeError extends Error {
  readonly code = 'OPEN_BANKING_ACCOUNT_SCOPE_CHANGED';

  constructor() {
    super('Plaid account access changed. Review the connection before syncing transactions.');
    this.name = 'OpenBankingAccountScopeError';
  }
}

export class OpenBankingOAuthStateError extends Error {
  constructor(
    readonly code:
      | 'OPEN_BANKING_OAUTH_CALLBACK_INVALID'
      | 'OPEN_BANKING_OAUTH_STATE_INVALID'
      | 'OPEN_BANKING_OAUTH_STATE_EXPIRED'
      | 'OPEN_BANKING_OAUTH_STATE_CONSUMED'
      | 'OPEN_BANKING_OAUTH_STATE_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'OpenBankingOAuthStateError';
  }
}

const requireOwnedConnection = async (
  store: OpenBankingConnectionStore,
  principal: AuthenticatedOpenBankingPrincipal,
  connectionId: string,
  configuration = readPlaidPilotConfiguration()
) => {
  const connection = await store.loadOwned({
    userId: principal.userId,
    id: connectionId,
    providerName: 'plaid',
    environment: configuration.environment,
  });
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

const requireFrontendEnvironment = (
  claimedEnvironment: PlaidEnvironment | null | undefined,
  configuredEnvironment: PlaidEnvironment
) => {
  if (claimedEnvironment !== configuredEnvironment) {
    throw new OpenBankingEnvironmentMismatchError();
  }
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
  providerEnvironment: stored.environment,
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

const sanitizeOwnedProviderConnection = (
  stored: StoredOpenBankingConnection
): SanitizedOwnedProviderConnection => ({
  id: stored.id,
  providerName: 'plaid',
  providerEnvironment: stored.environment,
  institutionName: stored.institutionName,
  institutionId: stored.institutionId,
  status: stored.providerItemStatus,
  recoveryRequired:
    stored.providerItemStatus === 'disconnect_requested' ||
    stored.providerItemStatus === 'provider_revoked',
  recoverySafe: stored.providerItemStatus === 'active',
  createdAt: stored.createdAt,
  updatedAt: stored.updatedAt,
});

export const createOpenBankingService = (dependencies: {
  store: OpenBankingConnectionStore;
  linkSessions: OpenBankingLinkSessionStore;
  oauthRecovery?: OAuthRecoveryStore;
  plaid: PlaidPilotGateway;
  now?: () => Date;
  createConnectionId?: () => string;
  createOAuthStateId?: () => string;
}): OpenBankingService => {
  const now = dependencies.now ?? (() => new Date());
  const createConnectionId = dependencies.createConnectionId ?? (() => `connection-${randomUUID()}`);
  const createOAuthStateId = dependencies.createOAuthStateId ??
    (() => randomBytes(32).toString('base64url'));
  const oauthRecovery = dependencies.oauthRecovery ?? createMemoryOAuthRecoveryStore();

  const requireMatchingOAuthState = (
    record: OAuthRecoveryRecord,
    session: NonNullable<Awaited<ReturnType<OpenBankingLinkSessionStore['loadOwned']>>>
  ) => {
    if (
      record.linkSessionId !== session.id || record.environment !== session.environment ||
      record.intent !== session.intent || record.connectionId !== session.connectionId ||
      record.ownerUserId !== session.ownerUserId
    ) {
      throw new OpenBankingOAuthStateError(
        'OPEN_BANKING_OAUTH_STATE_MISMATCH',
        'The OAuth recovery state does not match its Link session.'
      );
    }
  };

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
      if ((await oauthRecovery.listRecoverableOwned({
        ownerUserId: principal.userId,
        environment: configuration.environment,
        now: now(),
      })).length > 0) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_MISMATCH',
          'Finish or allow the current bank sign-in session to expire before starting another.'
        );
      }

      const existingConnection = input.connectionId
        ? await requireOwnedConnection(
            dependencies.store,
            principal,
            input.connectionId,
            configuration
          )
        : null;
      if (existingConnection) {
        requireFrontendEnvironment(input.connectionEnvironment, configuration.environment);
      }
      if (input.intent === 'transactions-consent') {
        if (
          configuration.environment !== 'sandbox' ||
          !configuration.products.includes('transactions')
        ) {
          throw new OpenBankingConfigurationError(
            'Plaid Transactions consent update mode is available only in configured Sandbox.'
          );
        }
        if (!existingConnection) {
          throw new OpenBankingConnectionStateError(
            'Transactions consent requires an existing bank connection.'
          );
        }
      }
      const mode = input.intent === 'transactions-consent'
        ? 'update'
        : existingConnection?.providerItemStatus === 'active'
        ? 'update'
        : 'create';
      const liveItem = mode === 'update' && existingConnection
        ? requireLiveProviderItem(existingConnection)
        : null;
      const intent: OpenBankingLinkSessionIntent = input.intent ??
        (mode === 'update' ? 'reauthentication' : 'connect');
      if (
        (intent === 'connect' && mode !== 'create') ||
        (intent === 'reauthentication' && mode !== 'update')
      ) {
        throw new OpenBankingConnectionStateError(
          'Plaid Link intent did not match the connection lifecycle.'
        );
      }
      const linkResult = await dependencies.plaid.createLinkToken({
        userId: principal.userId,
        accessToken: liveItem?.accessToken ?? null,
        intent,
      });
      if (linkResult.mode !== mode) {
        throw new OpenBankingConnectionStateError(
          'Plaid Link mode did not match the connection lifecycle.'
        );
      }
      const session = await dependencies.linkSessions.create({
        ownerUserId: principal.userId,
        environment: configuration.environment,
        connectionId: existingConnection?.id ?? null,
        mode,
        intent,
        expiresAt: linkResult.expiration,
      });
      const oauthStateId = createOAuthStateId();
      const oauthExpiresAt = new Date(Math.min(
        Date.parse(session.expiresAt),
        linkResult.expiration ? Date.parse(linkResult.expiration) : Number.POSITIVE_INFINITY
      ));
      await oauthRecovery.save({
        id: oauthStateId,
        ownerUserId: principal.userId,
        providerName: 'plaid',
        environment: configuration.environment,
        intent,
        connectionId: existingConnection?.id ?? null,
        linkSessionId: session.id,
        linkToken: linkResult.linkToken,
        redirectUri: configuration.redirectUri,
        providerOAuthStateId: null,
        receivedRedirectUri: null,
        callbackReceivedAt: null,
        completedConnectionId: null,
        createdAt: session.createdAt,
        expiresAt: Number.isFinite(oauthExpiresAt.getTime())
          ? oauthExpiresAt.toISOString()
          : session.expiresAt,
        consumedAt: null,
      });
      return {
        sessionId: session.id,
        providerName: 'plaid',
        providerEnvironment: configuration.environment,
        status: 'redirect-required',
        createdAt: session.createdAt,
        linkToken: linkResult.linkToken,
        expiration: linkResult.expiration ?? null,
        mode,
        connectionId: existingConnection?.id ?? null,
        intent,
      };
    },

    async resumeOAuth(principal, input) {
      const configuration = readPlaidPilotConfiguration();
      if (!input.receivedRedirectUri || input.receivedRedirectUri.length > 4096) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_CALLBACK_INVALID',
          'The OAuth callback URL is invalid.'
        );
      }
      let received: URL;
      let configured: URL;
      try {
        received = new URL(input.receivedRedirectUri);
        configured = new URL(configuration.redirectUri);
      } catch {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_CALLBACK_INVALID',
          'The OAuth callback URL is invalid.'
        );
      }
      const stateIds = received.searchParams.getAll('oauth_state_id');
      if (
        received.username || received.password || received.hash ||
        received.origin !== configured.origin || received.pathname !== configured.pathname ||
        stateIds.length !== 1 || !/^[A-Za-z0-9_-]{16,256}$/.test(stateIds[0])
      ) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_CALLBACK_INVALID',
          'The OAuth callback URL is invalid.'
        );
      }
      const candidates = await oauthRecovery.listOwned({
        ownerUserId: principal.userId,
        environment: configuration.environment,
      });
      const matchingCandidates = candidates.filter((candidate) =>
        candidate.providerOAuthStateId === stateIds[0] ||
        (candidate.providerOAuthStateId === null && candidate.receivedRedirectUri === null &&
          candidate.consumedAt === null)
      );
      if (matchingCandidates.length !== 1) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_INVALID',
          'The OAuth state is unavailable for this authenticated owner.'
        );
      }
      const record = matchingCandidates[0];
      if (record.consumedAt) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_CONSUMED',
          'The OAuth state was already completed.'
        );
      }
      if (Date.parse(record.expiresAt) <= now().getTime()) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_EXPIRED',
          'The OAuth state expired.'
        );
      }
      if (record.redirectUri !== configuration.redirectUri) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_MISMATCH',
          'The OAuth redirect configuration changed.'
        );
      }
      const session = await dependencies.linkSessions.loadOwned(
        record.linkSessionId,
        principal.userId
      );
      if (!session) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_EXPIRED',
          'The Link session expired.'
        );
      }
      requireMatchingOAuthState(record, session);
      const recorded = await oauthRecovery.recordCallbackOwned({
        id: record.id,
        ownerUserId: principal.userId,
        environment: configuration.environment,
        providerOAuthStateId: stateIds[0],
        receivedRedirectUri: received.href,
        now: now(),
      });
      if (!recorded) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_MISMATCH',
          'The OAuth callback cannot be resumed.'
        );
      }
      return {
        sessionId: session.id,
        providerName: 'plaid',
        providerEnvironment: configuration.environment,
        status: 'redirect-required',
        createdAt: session.createdAt,
        linkToken: recorded.linkToken,
        expiration: recorded.expiresAt,
        mode: session.mode,
        connectionId: session.connectionId,
        intent: session.intent,
        receivedRedirectUri: recorded.receivedRedirectUri!,
      };
    },

    async completeConnection(principal, input) {
      const configuration = readPlaidPilotConfiguration();
      if (!input.sessionId) {
        throw new OpenBankingConfigurationError('A server-issued Link session is required.');
      }
      const pendingSession = await dependencies.linkSessions.loadOwned(
        input.sessionId,
        principal.userId
      );
      if (!pendingSession) throw new OpenBankingLinkSessionError();
      if (pendingSession.environment !== configuration.environment) {
        await dependencies.linkSessions.consume(input.sessionId, principal.userId);
        throw new OpenBankingEnvironmentMismatchError();
      }
      const priorOAuthState = await oauthRecovery.loadByLinkSessionOwned({
        linkSessionId: input.sessionId,
        ownerUserId: principal.userId,
        environment: configuration.environment,
      });
      if (!priorOAuthState) {
        throw new OpenBankingOAuthStateError(
          'OPEN_BANKING_OAUTH_STATE_INVALID',
          'The Link completion state is invalid or expired.'
        );
      }
      requireMatchingOAuthState(priorOAuthState, pendingSession);
      const session = await dependencies.linkSessions.consume(input.sessionId, principal.userId);
      if (session.environment !== configuration.environment) {
        throw new OpenBankingEnvironmentMismatchError();
      }
      if (
        session.intent === 'transactions-consent' &&
        (configuration.environment !== 'sandbox' ||
          !configuration.products.includes('transactions'))
      ) {
        throw new OpenBankingConfigurationError(
          'Plaid Transactions consent update mode is available only in configured Sandbox.'
        );
      }
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
      if (session.intent === 'transactions-consent' && session.mode !== 'update') {
        throw new OpenBankingConnectionStateError(
          'Transactions consent must use Plaid update mode.'
        );
      }
      if (session.intent === 'transactions-consent') {
        const linkSelectedAccountIds = new Set(input.selectedAccountIds ?? []);
        const hasInvalidAccountIdentity = (input.selectedAccountIds ?? []).some(
          (accountId) => typeof accountId !== 'string' || accountId.length === 0
        );
        const missingExistingAccount = existingConnection?.selectedAccountIds.some(
          (accountId) => !linkSelectedAccountIds.has(accountId)
        ) ?? true;
        if (hasInvalidAccountIdentity || missingExistingAccount) {
          throw new OpenBankingAccountScopeError();
        }
      }
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
      let providerRecordPersisted = false;
      let persistedConnectionId: string | null = null;
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
        if (session.intent === 'transactions-consent' && existingConnection) {
          const providerAccountIds = new Set(
            balances.accounts.map((account) => account.account_id)
          );
          if (
            existingConnection.selectedAccountIds.some(
              (accountId) => !providerAccountIds.has(accountId)
            )
          ) {
            throw new OpenBankingAccountScopeError();
          }
        }
        if (
          session.mode === 'update' &&
          liveItem &&
          item.item.item_id !== liveItem.itemId
        ) {
          throw new OpenBankingConnectionStateError(
            'Plaid update mode returned a different provider Item.'
          );
        }
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
        const selectedAccountIds = session.intent === 'transactions-consent' && existingConnection
          ? [...existingConnection.selectedAccountIds]
          : balances.accounts.map((account) => account.account_id);
        const accounts = dependencies.plaid.mapAccounts({
          userId: principal.userId,
          providerEnvironment: configuration.environment,
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
          environment: configuration.environment,
          institutionName: institution.name,
          institutionId: institution.institutionId,
          accessToken,
          itemId: liveItem?.itemId ?? exchangedItemId ?? item.item.item_id,
          providerItemStatus: 'active',
          disconnectedAt: null,
          revokedItems: existingConnection?.revokedItems ?? [],
          selectedAccountIds,
          selectedAccountCurrencies: Object.fromEntries(
            accounts.filter((account) => account.externalAccountId)
              .map((account) => [account.externalAccountId!, account.currency])
          ),
          transactionSyncCursor:
            session.mode === 'update' ? existingConnection?.transactionSyncCursor ?? null : null,
          consentExpirationTime:
            balances.item?.consent_expiration_time ?? item.item.consent_expiration_time ?? null,
          createdAt: existingConnection?.createdAt ?? syncedAt,
          updatedAt: syncedAt,
        });
        providerRecordPersisted = true;
        persistedConnectionId = stored.id;
        const completedOAuthState = await oauthRecovery.consumeOwned({
          id: priorOAuthState.id,
          ownerUserId: principal.userId,
          environment: configuration.environment,
          completedConnectionId: stored.id,
          now: now(),
        });
        if (!completedOAuthState) {
          throw new OpenBankingOAuthStateError(
            'OPEN_BANKING_OAUTH_STATE_INVALID',
            'The OAuth completion state is invalid or expired.'
          );
        }
        return {
          connection: sanitizeConnection(stored, accounts, syncedAt),
          accounts,
        };
      } catch (error) {
        if (session.mode === 'create' && exchangedAccessToken && !providerRecordPersisted) {
          try {
            await dependencies.plaid.removeItem(exchangedAccessToken);
          } catch {
            // The original validation/provider error remains authoritative.
          }
        }
        await oauthRecovery.consumeOwned({
          id: priorOAuthState.id,
          ownerUserId: principal.userId,
          environment: configuration.environment,
          completedConnectionId: persistedConnectionId,
          now: now(),
        });
        throw error;
      }
    },

    async refreshConnection(principal, connectionId, connectionEnvironment) {
      const configuration = readPlaidPilotConfiguration();
      requireFrontendEnvironment(connectionEnvironment, configuration.environment);
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
          providerEnvironment: configuration.environment,
          connectionId: stored.id,
          institutionName: stored.institutionName,
          institutionId: stored.institutionId,
          accounts: balances.accounts,
          selectedAccountIds: stored.selectedAccountIds,
          syncedAt,
        });
        const updated = await dependencies.store.updateOwned({
          userId: principal.userId,
          id: stored.id,
          providerName: 'plaid',
          environment: configuration.environment,
        }, {
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
        const updated = await dependencies.store.updateOwned({
          userId: principal.userId,
          id: stored.id,
          providerName: 'plaid',
          environment: configuration.environment,
        }, {
          updatedAt,
        });
        return {
          connection: {
            id: updated.id,
            userId: updated.userId,
            providerName: updated.providerName,
            providerEnvironment: updated.environment,
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

    async syncTransactions(principal, connectionId, connectionEnvironment) {
      const configuration = readPlaidPilotConfiguration();
      requireFrontendEnvironment(connectionEnvironment, configuration.environment);
      const stored = await requireOwnedConnection(
        dependencies.store,
        principal,
        connectionId,
        configuration
      );
      const liveItem = requireLiveProviderItem(stored);
      if (
        configuration.environment !== 'sandbox' ||
        !configuration.products.includes('transactions')
      ) {
        throw new OpenBankingConfigurationError(
          'Plaid Sandbox transaction sync requires PLAID_PRODUCTS=auth,transactions.'
        );
      }

      const selectedAccountIds = new Set(stored.selectedAccountIds);
      if (selectedAccountIds.size === 0) {
        throw new OpenBankingConnectionStateError(
          'The Plaid connection has no selected accounts for transaction mapping.'
        );
      }

      const transactions: ProviderTransactionPage['transactions'] = [];
      const removedTransactions: NonNullable<ProviderTransactionPage['removedTransactions']> = [];
      const previousCursor = stored.transactionSyncCursor;
      let nextCursor = previousCursor;
      let pageCount = 0;
      let hasMore = false;

      do {
        if (++pageCount > 100) {
          throw new OpenBankingConnectionStateError(
            'Plaid transaction sync exceeded the safe pagination limit.'
          );
        }
        const page = await dependencies.plaid.fetchTransactions(
          liveItem.accessToken,
          nextCursor
        );
        // Plaid may return transactions for accounts additionally selected during
        // consent. The stored account scope remains the ingestion allowlist.
        transactions.push(...page.transactions.filter((transaction) =>
          selectedAccountIds.has(transaction.externalAccountId)
        ));
        removedTransactions.push(...(page.removedTransactions ?? []));
        hasMore = page.hasMore;
        if (hasMore && (!page.nextCursor || page.nextCursor === nextCursor)) {
          throw new OpenBankingConnectionStateError(
            'Plaid transaction sync returned an invalid pagination cursor.'
          );
        }
        nextCursor = page.nextCursor ?? nextCursor;
      } while (hasMore);

      await dependencies.store.advanceTransactionCursorOwned({
        userId: principal.userId,
        id: stored.id,
        providerName: 'plaid',
        environment: configuration.environment,
      }, {
        expectedItemId: liveItem.itemId,
        expectedCursor: previousCursor,
        nextCursor,
        updatedAt: now().toISOString(),
      });

      return {
        transactions,
        removedTransactions,
        hasMore: false,
      };
    },

    async disconnectConnection(principal, connectionId, connectionEnvironment) {
      const configuration = readPlaidPilotConfiguration();
      requireFrontendEnvironment(connectionEnvironment, configuration.environment);
      const stored = await requireOwnedConnection(
        dependencies.store,
        principal,
        connectionId,
        configuration
      );
      if (stored.providerItemStatus === 'disconnected') {
        return { ok: true, connectionId: stored.id };
      }
      if (!stored.accessToken || !stored.itemId) {
        throw new OpenBankingConnectionStateError(
          'Open banking disconnect recovery state is unavailable.'
        );
      }
      const scope = {
        userId: principal.userId,
        id: stored.id,
        providerName: 'plaid' as const,
        environment: configuration.environment,
      };
      const requestedAt = now().toISOString();
      let operation = stored.providerItemStatus === 'active'
        ? await dependencies.store.beginDisconnectOwned(scope, {
            requestedAt,
            expectedItemId: stored.itemId,
          })
        : stored;
      if (operation.providerItemStatus === 'disconnect_requested') {
        await dependencies.plaid.removeItem(operation.accessToken!);
        operation = await dependencies.store.markProviderRevokedOwned(scope, {
          revokedAt: now().toISOString(),
          expectedItemId: operation.itemId!,
        });
      }
      if (operation.providerItemStatus === 'provider_revoked') {
        await dependencies.store.finalizeDisconnectOwned(scope, {
          revokedAt: operation.disconnectedAt ?? now().toISOString(),
          expectedItemId: operation.itemId!,
        });
      }
      return { ok: true, connectionId: stored.id };
    },

    async listOwnedConnections(principal) {
      const configuration = readPlaidPilotConfiguration();
      const connections = await dependencies.store.listOwned({
        userId: principal.userId,
        providerName: 'plaid',
        environment: configuration.environment,
      });
      return { connections: connections.map(sanitizeOwnedProviderConnection) };
    },

    async deleteDisconnectedConnection(principal, connectionId, connectionEnvironment) {
      const configuration = readPlaidPilotConfiguration();
      requireFrontendEnvironment(connectionEnvironment, configuration.environment);
      const scope = {
        userId: principal.userId,
        id: connectionId,
        providerName: 'plaid' as const,
        environment: configuration.environment,
      };
      const stored = await dependencies.store.loadOwned(scope);
      if (!stored) return { ok: true, connectionId, deleted: false };
      if (stored.providerItemStatus !== 'disconnected') {
        throw new OpenBankingConnectionStateError(
          'Only a disconnected open banking connection can be deleted.'
        );
      }
      const deleted = await dependencies.store.deleteOwned(scope);
      return { ok: true, connectionId, deleted };
    },
  };
};
