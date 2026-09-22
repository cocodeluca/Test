import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { PlaidEnvironment } from '../src/common/types';
import {
  assertCurrentDatabaseMigrations,
  asDatabasePool,
  type DatabasePool,
  type DatabaseQueryable,
} from './databaseMigrations';
import {
  OpenBankingLinkSessionError,
  type OpenBankingLinkSession,
  type OpenBankingLinkSessionStore,
} from './openBankingLinkSessions';
import { readPlaidPilotConfiguration } from './openBankingPolicy';
import { readOpenBankingMode } from './openBankingMode';
import {
  OpenBankingConnectionOwnershipError,
  OpenBankingCursorStateError,
  OpenBankingEnvironmentMismatchError,
  OpenBankingVaultError,
  type OpenBankingConnectionStore,
  type OpenBankingRecordScope,
  type StoredOpenBankingConnection,
} from './openBankingStore';
import {
  type OAuthRecoveryRecord,
  type OAuthRecoveryStore,
  type OperationalStores,
  OperationalStoreConfigurationError,
} from './operationalStore';
import {
  ServerAuthConflictError,
  ServerAuthStoreError,
  type ServerSessionStore,
  type ServerUserStore,
  type StoredPasswordHash,
  type StoredServerUser,
} from './serverAuth';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LINK_SESSION_TTL_MS = 5 * 60 * 1000;

interface SecretEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: 1;
}

interface SecretContext {
  ownerUserId: string;
  providerName: 'plaid';
  environment: PlaidEnvironment;
  institutionId: string;
  connectionId: string | null;
  itemId: string | null;
  purpose: 'access-token' | 'transaction-cursor' | 'link-token';
}

const iso = (value: string | Date): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

const parseMasterKey = (encoded: string | undefined): Buffer => {
  const normalized = encoded?.trim();
  if (!normalized || !/^[A-Za-z0-9+/]{43}=$/.test(normalized)) {
    throw new OpenBankingVaultError('OPEN_BANKING_VAULT_KEY must be a base64-encoded 32-byte key.');
  }
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== 32 || key.toString('base64') !== normalized) {
    throw new OpenBankingVaultError('OPEN_BANKING_VAULT_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
};

const aad = (context: SecretContext) => JSON.stringify({
  ownerUserId: context.ownerUserId,
  providerName: context.providerName,
  environment: context.environment,
  institutionId: context.institutionId,
  connectionId: context.connectionId,
  itemId: context.itemId,
  purpose: context.purpose,
});

const encrypt = (plaintext: string, key: Buffer, context: SecretContext): SecretEnvelope => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad(context)));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: 1,
  };
};

const decrypt = (secret: SecretEnvelope, key: Buffer, context: SecretContext): string => {
  try {
    if (secret.keyVersion !== 1) throw new Error('unsupported key version');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad(context)));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new OpenBankingVaultError('Encrypted operational secret authentication failed.');
  }
};

const withTransaction = async <T>(pool: DatabasePool, operation: (client: DatabaseQueryable) => Promise<T>) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const mapUser = (row: QueryResultRow): StoredServerUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: iso(row.created_at),
  passwordHash: {
    algorithm: row.password_algorithm,
    salt: row.password_salt,
    hash: row.password_hash,
    keyLength: row.password_key_length,
    N: row.password_scrypt_n,
    r: row.password_scrypt_r,
    p: row.password_scrypt_p,
  } as StoredPasswordHash,
});

const createUsers = (pool: DatabasePool): ServerUserStore => ({
  async findById(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rowCount ? mapUser(result.rows[0]) : null;
  },
  async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    return result.rowCount ? mapUser(result.rows[0]) : null;
  },
  async create(input) {
    try {
      const result = await pool.query(`
        INSERT INTO users(
          id, email, name, password_algorithm, password_salt, password_hash,
          password_key_length, password_scrypt_n, password_scrypt_r, password_scrypt_p, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `, [
        input.id, input.email, input.name, input.passwordHash.algorithm,
        input.passwordHash.salt, input.passwordHash.hash, input.passwordHash.keyLength,
        input.passwordHash.N, input.passwordHash.r, input.passwordHash.p, input.createdAt,
      ]);
      return mapUser(result.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ServerAuthConflictError();
      throw new ServerAuthStoreError();
    }
  },
});

const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');

const createSessions = (pool: DatabasePool, now: () => Date): ServerSessionStore => ({
  async create(userId) {
    const token = randomBytes(32).toString('base64url');
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
    await pool.query(
      'INSERT INTO auth_sessions(token_digest,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)',
      [digestToken(token), userId, createdAt.toISOString(), expiresAt.toISOString()]
    );
    return { token, expiresAt: expiresAt.toISOString() };
  },
  async resolve(token) {
    if (!token) return null;
    const digest = digestToken(token);
    const result = await pool.query(`
      DELETE FROM auth_sessions
      WHERE token_digest = $1 AND expires_at <= $2
    `, [digest, now().toISOString()]);
    void result;
    const active = await pool.query(
      'SELECT token_digest,user_id,created_at,expires_at FROM auth_sessions WHERE token_digest = $1 AND expires_at > $2',
      [digest, now().toISOString()]
    );
    if (!active.rowCount) return null;
    const row = active.rows[0];
    return {
      tokenDigest: row.token_digest,
      userId: row.user_id,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
    };
  },
  async revoke(token) {
    if (token) await pool.query('DELETE FROM auth_sessions WHERE token_digest = $1', [digestToken(token)]);
  },
  async revokeUser(userId) {
    await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
  },
});

const mapLinkSession = (row: QueryResultRow): OpenBankingLinkSession => Object.freeze({
  id: row.id,
  ownerUserId: row.owner_user_id,
  providerName: 'plaid',
  environment: row.environment,
  countryCode: 'ES',
  institutionId: 'ins_65',
  intent: row.intent,
  connectionId: row.connection_id,
  mode: row.mode,
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
});

const createLinkSessions = (pool: DatabasePool, now: () => Date): OpenBankingLinkSessionStore => ({
  async create(input) {
    const createdAt = now();
    const requested = input.expiresAt ? Date.parse(input.expiresAt) : Number.NaN;
    const expiresAt = Number.isFinite(requested) && requested > createdAt.getTime()
      ? new Date(requested)
      : new Date(createdAt.getTime() + LINK_SESSION_TTL_MS);
    const mode = input.mode ?? (input.connectionId ? 'update' : 'create');
    const result = await pool.query(`
      INSERT INTO link_sessions(
        id,owner_user_id,provider_name,environment,country_code,institution_id,intent,
        connection_id,mode,created_at,expires_at
      ) VALUES ($1,$2,'plaid',$3,'ES','ins_65',$4,$5,$6,$7,$8) RETURNING *
    `, [
      randomUUID(), input.ownerUserId, input.environment,
      input.intent ?? (mode === 'update' ? 'reauthentication' : 'connect'),
      input.connectionId ?? null, mode, createdAt.toISOString(), expiresAt.toISOString(),
    ]);
    return mapLinkSession(result.rows[0]);
  },
  async loadOwned(sessionId, ownerUserId) {
    const result = await pool.query(`
      SELECT * FROM link_sessions
      WHERE id = $1 AND owner_user_id = $2 AND consumed_at IS NULL AND expires_at > $3
    `, [sessionId, ownerUserId, now().toISOString()]);
    return result.rowCount ? mapLinkSession(result.rows[0]) : null;
  },
  async consume(sessionId, ownerUserId) {
    const result = await pool.query(`
      UPDATE link_sessions SET consumed_at = $3
      WHERE id = $1 AND owner_user_id = $2 AND consumed_at IS NULL AND expires_at > $3
      RETURNING *
    `, [sessionId, ownerUserId, now().toISOString()]);
    if (!result.rowCount) throw new OpenBankingLinkSessionError();
    return mapLinkSession(result.rows[0]);
  },
});

const connectionSecretContext = (
  row: Pick<StoredOpenBankingConnection, 'userId' | 'providerName' | 'environment' | 'institutionId' | 'id' | 'itemId'>,
  purpose: SecretContext['purpose']
): SecretContext => ({
  ownerUserId: row.userId,
  providerName: 'plaid',
  environment: row.environment,
  institutionId: row.institutionId,
  connectionId: row.id,
  itemId: row.itemId,
  purpose,
});

const readConnection = async (
  database: DatabaseQueryable,
  key: Buffer,
  scope: OpenBankingRecordScope,
  forUpdate = false
): Promise<StoredOpenBankingConnection | null> => {
  const result = await database.query(`
    SELECT * FROM provider_connections
    WHERE id = $1 AND owner_user_id = $2${forUpdate ? ' FOR UPDATE' : ''}
  `, [scope.id, scope.userId]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  if (row.provider_name !== scope.providerName || row.environment !== scope.environment) {
    throw new OpenBankingEnvironmentMismatchError();
  }
  const accounts = await database.query(
    'SELECT provider_account_id,currency FROM provider_connection_accounts WHERE connection_id = $1 ORDER BY currency',
    [scope.id]
  );
  const revoked = await database.query(
    'SELECT item_id,revoked_at FROM provider_revoked_items WHERE connection_id = $1 ORDER BY revoked_at',
    [scope.id]
  );
  const metadata = {
    id: row.id,
    userId: row.owner_user_id,
    providerName: row.provider_name,
    environment: row.environment,
    institutionId: row.institution_id,
    itemId: row.item_id,
  } as const;
  const envelope = (prefix: 'access_token' | 'cursor'): SecretEnvelope => ({
    ciphertext: row[`${prefix}_ciphertext`],
    iv: row[`${prefix}_iv`],
    authTag: row[`${prefix}_auth_tag`],
    keyVersion: row[`${prefix}_key_version`],
  });
  return {
    ...metadata,
    institutionName: row.institution_name,
    accessToken: row.access_token_ciphertext
      ? decrypt(envelope('access_token'), key, connectionSecretContext(metadata, 'access-token'))
      : null,
    providerItemStatus: row.provider_item_status,
    disconnectedAt: row.disconnected_at ? iso(row.disconnected_at) : null,
    revokedItems: revoked.rows.map((item) => ({ itemId: item.item_id, revokedAt: iso(item.revoked_at) })),
    selectedAccountIds: accounts.rows.map((account) => account.provider_account_id),
    selectedAccountCurrencies: Object.fromEntries(
      accounts.rows.map((account) => [account.provider_account_id, account.currency.trim()])
    ),
    transactionSyncCursor: row.cursor_ciphertext
      ? decrypt(envelope('cursor'), key, connectionSecretContext(metadata, 'transaction-cursor'))
      : null,
    consentExpirationTime: row.consent_expiration_time ? iso(row.consent_expiration_time) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
};

const validateConnection = (connection: StoredOpenBankingConnection, expected: PlaidEnvironment) => {
  if (connection.environment !== expected || connection.providerName !== 'plaid') {
    throw new OpenBankingEnvironmentMismatchError();
  }
  if (connection.selectedAccountIds.length > 1) {
    throw new OpenBankingVaultError('Batch A supports one selected account per connection.');
  }
  if (connection.selectedAccountIds.some((accountId) =>
    !/^[A-Z]{3}$/.test(connection.selectedAccountCurrencies?.[accountId] ?? '')
  )) {
    throw new OpenBankingVaultError('The selected provider account currency is unavailable.');
  }
  if ((connection.providerItemStatus === 'disconnected') !== (!connection.accessToken && !connection.itemId)) {
    throw new OpenBankingVaultError('Open banking provider Item lifecycle is invalid.');
  }
};

const writeConnection = async (
  database: DatabaseQueryable,
  key: Buffer,
  connection: StoredOpenBankingConnection
) => {
  const access = connection.accessToken
    ? encrypt(connection.accessToken, key, connectionSecretContext(connection, 'access-token'))
    : null;
  const cursor = connection.transactionSyncCursor !== null
    ? encrypt(connection.transactionSyncCursor, key, connectionSecretContext(connection, 'transaction-cursor'))
    : null;
  const written = await database.query(`
    INSERT INTO provider_connections(
      id,owner_user_id,provider_name,environment,institution_name,institution_id,item_id,
      access_token_ciphertext,access_token_iv,access_token_auth_tag,access_token_key_version,
      cursor_ciphertext,cursor_iv,cursor_auth_tag,cursor_key_version,provider_item_status,
      consent_expiration_time,disconnected_at,created_at,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT (id) DO UPDATE SET
      institution_name=EXCLUDED.institution_name,institution_id=EXCLUDED.institution_id,
      item_id=EXCLUDED.item_id,access_token_ciphertext=EXCLUDED.access_token_ciphertext,
      access_token_iv=EXCLUDED.access_token_iv,access_token_auth_tag=EXCLUDED.access_token_auth_tag,
      access_token_key_version=EXCLUDED.access_token_key_version,
      cursor_ciphertext=EXCLUDED.cursor_ciphertext,cursor_iv=EXCLUDED.cursor_iv,
      cursor_auth_tag=EXCLUDED.cursor_auth_tag,cursor_key_version=EXCLUDED.cursor_key_version,
      provider_item_status=EXCLUDED.provider_item_status,
      consent_expiration_time=EXCLUDED.consent_expiration_time,
      disconnected_at=EXCLUDED.disconnected_at,updated_at=EXCLUDED.updated_at
    WHERE provider_connections.owner_user_id=EXCLUDED.owner_user_id
      AND provider_connections.provider_name=EXCLUDED.provider_name
      AND provider_connections.environment=EXCLUDED.environment
    RETURNING id
  `, [
    connection.id, connection.userId, connection.providerName, connection.environment,
    connection.institutionName, connection.institutionId, connection.itemId,
    access?.ciphertext ?? null, access?.iv ?? null, access?.authTag ?? null, access?.keyVersion ?? null,
    cursor?.ciphertext ?? null, cursor?.iv ?? null, cursor?.authTag ?? null, cursor?.keyVersion ?? null,
    connection.providerItemStatus, connection.consentExpirationTime ?? null,
    connection.disconnectedAt, connection.createdAt, connection.updatedAt,
  ]);
  if (!written.rowCount) throw new OpenBankingConnectionOwnershipError();
  await database.query('DELETE FROM provider_connection_accounts WHERE connection_id = $1', [connection.id]);
  if (connection.selectedAccountIds[0]) {
    await database.query(`
      INSERT INTO provider_connection_accounts(connection_id,currency,provider_account_id,created_at)
      VALUES ($1,$2,$3,$4)
    `, [
      connection.id,
      connection.selectedAccountCurrencies![connection.selectedAccountIds[0]],
      connection.selectedAccountIds[0],
      connection.createdAt,
    ]);
  }
  for (const revoked of connection.revokedItems) {
    await database.query(`
      INSERT INTO provider_revoked_items(connection_id,item_id,revoked_at) VALUES ($1,$2,$3)
      ON CONFLICT (connection_id,item_id) DO NOTHING
    `, [connection.id, revoked.itemId, revoked.revokedAt]);
  }
};

const createProviderConnections = (
  pool: DatabasePool,
  key: Buffer,
  expectedEnvironment: PlaidEnvironment
): OpenBankingConnectionStore => {
  const scopeFor = (connection: StoredOpenBankingConnection): OpenBankingRecordScope => ({
    id: connection.id,
    userId: connection.userId,
    providerName: connection.providerName,
    environment: connection.environment,
  });
  const requireOwned = async (database: DatabaseQueryable, scope: OpenBankingRecordScope, lock = false) => {
    const connection = await readConnection(database, key, scope, lock);
    if (!connection) throw new OpenBankingConnectionOwnershipError();
    return connection;
  };
  const store: OpenBankingConnectionStore = {
    async list(providerName, environment) {
      if (environment !== expectedEnvironment) throw new OpenBankingEnvironmentMismatchError();
      const rows = await pool.query(
        'SELECT id,owner_user_id FROM provider_connections WHERE provider_name=$1 AND environment=$2 ORDER BY created_at',
        [providerName, environment]
      );
      return Promise.all(rows.rows.map((row) => requireOwned(pool, {
        id: row.id, userId: row.owner_user_id, providerName, environment,
      })));
    },
    async listOwned(input) {
      if (input.environment !== expectedEnvironment) throw new OpenBankingEnvironmentMismatchError();
      const rows = await pool.query(`
        SELECT id FROM provider_connections
        WHERE owner_user_id=$1 AND provider_name=$2 AND environment=$3 ORDER BY created_at
      `, [input.userId, input.providerName, input.environment]);
      return Promise.all(rows.rows.map((row) => requireOwned(pool, { id: row.id, ...input })));
    },
    async loadOwned(scope) {
      if (scope.environment !== expectedEnvironment) throw new OpenBankingEnvironmentMismatchError();
      return readConnection(pool, key, scope);
    },
    async save(connection) {
      validateConnection(connection, expectedEnvironment);
      await withTransaction(pool, async (client) => {
        const existing = await client.query(
          'SELECT owner_user_id,provider_name,environment FROM provider_connections WHERE id=$1 FOR UPDATE',
          [connection.id]
        );
        if (existing.rowCount && existing.rows[0].owner_user_id !== connection.userId) {
          throw new OpenBankingConnectionOwnershipError();
        }
        await writeConnection(client, key, connection);
      });
      return requireOwned(pool, scopeFor(connection));
    },
    async updateOwned(scope, patch) {
      const updated = await withTransaction(pool, async (client) => {
        const existing = await requireOwned(client, scope, true);
        const next: StoredOpenBankingConnection = {
          ...existing,
          ...patch,
          id: existing.id,
          userId: existing.userId,
          providerName: existing.providerName,
          environment: existing.environment,
          accessToken: existing.accessToken,
          transactionSyncCursor: existing.transactionSyncCursor,
          updatedAt: patch.updatedAt ?? new Date().toISOString(),
        };
        validateConnection(next, expectedEnvironment);
        await writeConnection(client, key, next);
        return next;
      });
      return updated;
    },
    async advanceTransactionCursorOwned(scope, input) {
      return withTransaction(pool, async (client) => {
        const existing = await requireOwned(client, scope, true);
        if (existing.providerItemStatus !== 'active' ||
            existing.itemId !== input.expectedItemId ||
            existing.transactionSyncCursor !== input.expectedCursor) {
          throw new OpenBankingCursorStateError();
        }
        const next = { ...existing, transactionSyncCursor: input.nextCursor, updatedAt: input.updatedAt };
        await writeConnection(client, key, next);
        return next;
      });
    },
    async beginDisconnectOwned(scope, input) {
      return withTransaction(pool, async (client) => {
        const existing = await requireOwned(client, scope, true);
        if (existing.providerItemStatus === 'disconnected' ||
            existing.providerItemStatus === 'provider_revoked') return existing;
        if (existing.providerItemStatus !== 'active' || existing.itemId !== input.expectedItemId ||
            !existing.accessToken) throw new OpenBankingVaultError('Open banking provider Item changed during disconnect.');
        const next = { ...existing, providerItemStatus: 'disconnect_requested' as const, updatedAt: input.requestedAt };
        await writeConnection(client, key, next);
        return next;
      });
    },
    async markProviderRevokedOwned(scope, input) {
      return withTransaction(pool, async (client) => {
        const existing = await requireOwned(client, scope, true);
        if (existing.providerItemStatus === 'disconnected' ||
            existing.providerItemStatus === 'provider_revoked') return existing;
        if (existing.providerItemStatus !== 'disconnect_requested' ||
            existing.itemId !== input.expectedItemId || !existing.accessToken) {
          throw new OpenBankingVaultError('Open banking disconnect operation state is invalid.');
        }
        const next = {
          ...existing,
          providerItemStatus: 'provider_revoked' as const,
          disconnectedAt: input.revokedAt,
          updatedAt: input.revokedAt,
        };
        await writeConnection(client, key, next);
        return next;
      });
    },
    async finalizeDisconnectOwned(scope, input) {
      return withTransaction(pool, async (client) => {
        const existing = await requireOwned(client, scope, true);
        if (existing.providerItemStatus === 'disconnected') return existing;
        if (existing.providerItemStatus !== 'provider_revoked' || existing.itemId !== input.expectedItemId) {
          throw new OpenBankingVaultError('Open banking disconnect operation state is invalid.');
        }
        const next: StoredOpenBankingConnection = {
          ...existing,
          accessToken: null,
          itemId: null,
          transactionSyncCursor: null,
          providerItemStatus: 'disconnected',
          disconnectedAt: input.revokedAt,
          revokedItems: existing.revokedItems.some((item) => item.itemId === input.expectedItemId)
            ? existing.revokedItems
            : [...existing.revokedItems, { itemId: input.expectedItemId, revokedAt: input.revokedAt }],
          updatedAt: input.revokedAt,
        };
        await writeConnection(client, key, next);
        return next;
      });
    },
    async markDisconnectedOwned(scope, input) {
      const begun = await store.beginDisconnectOwned(scope, {
        expectedItemId: input.expectedItemId,
        requestedAt: input.revokedAt,
      });
      if (begun.providerItemStatus === 'disconnected') return begun;
      const revoked = await store.markProviderRevokedOwned(scope, input);
      if (revoked.providerItemStatus === 'disconnected') return revoked;
      return store.finalizeDisconnectOwned(scope, input);
    },
    async deleteOwned(scope) {
      const result = await pool.query(`
        DELETE FROM provider_connections
        WHERE id=$1 AND owner_user_id=$2 AND provider_name=$3 AND environment=$4
      `, [scope.id, scope.userId, scope.providerName, scope.environment]);
      return (result.rowCount ?? 0) > 0;
    },
  };
  return store;
};

const recoveryContext = (record: Pick<OAuthRecoveryRecord,
  'ownerUserId' | 'providerName' | 'environment' | 'connectionId'>): SecretContext => ({
  ownerUserId: record.ownerUserId,
  providerName: record.providerName,
  environment: record.environment,
  institutionId: 'ins_65',
  connectionId: record.connectionId,
  itemId: null,
  purpose: 'link-token',
});

const mapRecovery = (row: QueryResultRow, key: Buffer): OAuthRecoveryRecord => {
  const metadata = {
    ownerUserId: row.owner_user_id,
    providerName: 'plaid' as const,
    environment: row.environment as PlaidEnvironment,
    connectionId: row.connection_id,
  };
  return {
    id: row.id,
    ...metadata,
    intent: row.intent,
    linkSessionId: row.link_session_id,
    linkToken: decrypt({
      ciphertext: row.link_token_ciphertext,
      iv: row.link_token_iv,
      authTag: row.link_token_auth_tag,
      keyVersion: row.link_token_key_version,
    }, key, recoveryContext(metadata)),
    redirectUri: row.redirect_uri,
    providerOAuthStateId: row.provider_oauth_state_id,
    receivedRedirectUri: row.received_redirect_uri,
    callbackReceivedAt: row.callback_received_at ? iso(row.callback_received_at) : null,
    completedConnectionId: row.completed_connection_id,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    consumedAt: row.consumed_at ? iso(row.consumed_at) : null,
  };
};

const createOAuthRecovery = (pool: DatabasePool, key: Buffer): OAuthRecoveryStore => {
  const queryOne = async (sql: string, values: unknown[]) => {
    const result = await pool.query(sql, values);
    return result.rowCount ? mapRecovery(result.rows[0], key) : null;
  };
  return {
    async save(record) {
      const secret = encrypt(record.linkToken, key, recoveryContext(record));
      await pool.query(`
        INSERT INTO oauth_recovery_states(
          id,owner_user_id,provider_name,environment,intent,connection_id,link_session_id,
          link_token_ciphertext,link_token_iv,link_token_auth_tag,link_token_key_version,
          redirect_uri,provider_oauth_state_id,received_redirect_uri,callback_received_at,
          completed_connection_id,created_at,expires_at,consumed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      `, [
        record.id, record.ownerUserId, record.providerName, record.environment, record.intent,
        record.connectionId, record.linkSessionId, secret.ciphertext, secret.iv, secret.authTag,
        secret.keyVersion, record.redirectUri, record.providerOAuthStateId,
        record.receivedRedirectUri, record.callbackReceivedAt, record.completedConnectionId,
        record.createdAt, record.expiresAt, record.consumedAt,
      ]);
    },
    loadOwned(input) {
      return queryOne(`
        SELECT * FROM oauth_recovery_states
        WHERE id=$1 AND owner_user_id=$2 AND environment=$3
      `, [input.id, input.ownerUserId, input.environment]);
    },
    loadByLinkSessionOwned(input) {
      return queryOne(`
        SELECT * FROM oauth_recovery_states
        WHERE link_session_id=$1 AND owner_user_id=$2 AND environment=$3
        ORDER BY consumed_at NULLS FIRST LIMIT 1
      `, [input.linkSessionId, input.ownerUserId, input.environment]);
    },
    async recordCallbackOwned(input) {
      return withTransaction(pool, async (client) => {
        const current = await client.query(`
          SELECT * FROM oauth_recovery_states
          WHERE id=$1 AND owner_user_id=$2 AND environment=$3 FOR UPDATE
        `, [input.id, input.ownerUserId, input.environment]);
        if (!current.rowCount) return null;
        const row = current.rows[0];
        if (row.consumed_at || new Date(row.expires_at).getTime() <= input.now.getTime() ||
            (row.provider_oauth_state_id && row.provider_oauth_state_id !== input.providerOAuthStateId) ||
            (row.received_redirect_uri && row.received_redirect_uri !== input.receivedRedirectUri)) return null;
        const updated = await client.query(`
          UPDATE oauth_recovery_states SET
            provider_oauth_state_id=$4,received_redirect_uri=$5,
            callback_received_at=COALESCE(callback_received_at,$6)
          WHERE id=$1 AND owner_user_id=$2 AND environment=$3 RETURNING *
        `, [
          input.id, input.ownerUserId, input.environment, input.providerOAuthStateId,
          input.receivedRedirectUri, input.now.toISOString(),
        ]);
        return mapRecovery(updated.rows[0], key);
      });
    },
    async consumeOwned(input) {
      const result = await pool.query(`
        UPDATE oauth_recovery_states SET consumed_at=$4,completed_connection_id=$5
        WHERE id=$1 AND owner_user_id=$2 AND environment=$3
          AND consumed_at IS NULL AND expires_at>$4
        RETURNING *
      `, [
        input.id, input.ownerUserId, input.environment, input.now.toISOString(),
        input.completedConnectionId,
      ]);
      return result.rowCount ? mapRecovery(result.rows[0], key) : null;
    },
    async listRecoverableOwned(input) {
      const result = await pool.query(`
        SELECT * FROM oauth_recovery_states
        WHERE owner_user_id=$1 AND environment=$2 AND consumed_at IS NULL AND expires_at>$3
        ORDER BY created_at
      `, [input.ownerUserId, input.environment, input.now.toISOString()]);
      return result.rows.map((row) => mapRecovery(row, key));
    },
    async listOwned(input) {
      const result = await pool.query(`
        SELECT * FROM oauth_recovery_states
        WHERE owner_user_id=$1 AND environment=$2 ORDER BY created_at
      `, [input.ownerUserId, input.environment]);
      return result.rows.map((row) => mapRecovery(row, key));
    },
  };
};

export const createPostgresOperationalStoresWithPool = async (options: {
  pool: DatabasePool;
  environment: Readonly<NodeJS.ProcessEnv>;
  now?: () => Date;
  close?: () => Promise<void>;
}): Promise<OperationalStores> => {
  const key = parseMasterKey(options.environment.OPEN_BANKING_VAULT_KEY);
  const openBankingEnabled = readOpenBankingMode(options.environment) === 'enabled';
  const plaidEnvironment = openBankingEnabled
    ? readPlaidPilotConfiguration(options.environment).environment : null;
  const disabledBankingStore = <T extends object>(): T => new Proxy({} as T, {
    get: () => async () => { throw new OperationalStoreConfigurationError('Open Banking is disabled.'); },
  });
  await assertCurrentDatabaseMigrations(options.pool);
  const now = options.now ?? (() => new Date());
  return {
    capabilities: Object.freeze({
      kind: 'production-durable' as const,
      backend: 'postgresql' as const,
      persistsAcrossRestart: true,
      transactionalWrites: true,
      ownerScoped: true,
      environmentScoped: true,
      compareAndSwap: true,
      expiringOneTimeRecords: true,
      encryptedProviderSecrets: true,
    }),
    users: createUsers(options.pool),
    sessions: createSessions(options.pool, now),
    linkSessions: openBankingEnabled ? createLinkSessions(options.pool, now) : disabledBankingStore(),
    providerConnections: plaidEnvironment
      ? createProviderConnections(options.pool, key, plaidEnvironment) : disabledBankingStore(),
    oauthRecovery: openBankingEnabled ? createOAuthRecovery(options.pool, key) : disabledBankingStore(),
    async assertReady() {
      await options.pool.query('SELECT 1');
      await assertCurrentDatabaseMigrations(options.pool);
    },
    close: options.close ?? (async () => {}),
  };
};

export const createOperationalStores = async (input: {
  environment: Readonly<NodeJS.ProcessEnv>;
}): Promise<OperationalStores> => {
  const databaseUrl = input.environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new OperationalStoreConfigurationError('DATABASE_URL is required for PostgreSQL.');
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  try {
    return await createPostgresOperationalStoresWithPool({
      pool: asDatabasePool(pool),
      environment: input.environment,
      close: () => pool.end(),
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
};
