CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  password_algorithm text NOT NULL CHECK (password_algorithm = 'scrypt'),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  password_key_length integer NOT NULL CHECK (password_key_length = 64),
  password_scrypt_n integer NOT NULL CHECK (password_scrypt_n = 16384),
  password_scrypt_r integer NOT NULL CHECK (password_scrypt_r = 8),
  password_scrypt_p integer NOT NULL CHECK (password_scrypt_p = 1),
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX users_email_normalized_unique ON users (lower(email));
-- Deliberately single-user for the first Production pilot; a future multi-user
-- release must introduce an explicit migration before removing this guard.
CREATE UNIQUE INDEX users_single_pilot_unique ON users ((true));

CREATE TABLE auth_sessions (
  token_digest char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE provider_connections (
  id text PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name text NOT NULL CHECK (provider_name = 'plaid'),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  institution_name text NOT NULL,
  institution_id text NOT NULL,
  item_id text,
  access_token_ciphertext text,
  access_token_iv text,
  access_token_auth_tag text,
  access_token_key_version integer,
  cursor_ciphertext text,
  cursor_iv text,
  cursor_auth_tag text,
  cursor_key_version integer,
  provider_item_status text NOT NULL CHECK (
    provider_item_status IN ('active', 'disconnect_requested', 'provider_revoked', 'disconnected')
  ),
  consent_expiration_time timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(owner_user_id, provider_name, environment),
  CHECK (
    (access_token_ciphertext IS NULL AND access_token_iv IS NULL AND
      access_token_auth_tag IS NULL AND access_token_key_version IS NULL) OR
    (access_token_ciphertext IS NOT NULL AND access_token_iv IS NOT NULL AND
      access_token_auth_tag IS NOT NULL AND access_token_key_version = 1)
  ),
  CHECK (
    (cursor_ciphertext IS NULL AND cursor_iv IS NULL AND
      cursor_auth_tag IS NULL AND cursor_key_version IS NULL) OR
    (cursor_ciphertext IS NOT NULL AND cursor_iv IS NOT NULL AND
      cursor_auth_tag IS NOT NULL AND cursor_key_version = 1)
  ),
  CHECK (
    (provider_item_status = 'disconnected' AND item_id IS NULL AND access_token_ciphertext IS NULL) OR
    (provider_item_status <> 'disconnected' AND item_id IS NOT NULL AND access_token_ciphertext IS NOT NULL)
  )
);

CREATE INDEX provider_connections_owner_idx
  ON provider_connections(owner_user_id, provider_name, environment);

CREATE TABLE provider_connection_accounts (
  connection_id text PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  currency char(3) NOT NULL,
  provider_account_id text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(connection_id, provider_account_id)
);

CREATE TABLE provider_revoked_items (
  connection_id text NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  revoked_at timestamptz NOT NULL,
  PRIMARY KEY(connection_id, item_id)
);

CREATE TABLE link_sessions (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name text NOT NULL CHECK (provider_name = 'plaid'),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  country_code char(2) NOT NULL CHECK (country_code = 'ES'),
  institution_id text NOT NULL CHECK (institution_id = 'ins_65'),
  intent text NOT NULL CHECK (intent IN ('connect', 'reauthentication', 'transactions-consent')),
  connection_id text REFERENCES provider_connections(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('create', 'update')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX link_sessions_owner_idx ON link_sessions(owner_user_id, environment);
CREATE INDEX link_sessions_expires_at_idx ON link_sessions(expires_at);

CREATE TABLE oauth_recovery_states (
  id text PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name text NOT NULL CHECK (provider_name = 'plaid'),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  intent text NOT NULL CHECK (intent IN ('connect', 'reauthentication', 'transactions-consent')),
  connection_id text REFERENCES provider_connections(id) ON DELETE SET NULL,
  link_session_id uuid NOT NULL REFERENCES link_sessions(id) ON DELETE CASCADE,
  link_token_ciphertext text NOT NULL,
  link_token_iv text NOT NULL,
  link_token_auth_tag text NOT NULL,
  link_token_key_version integer NOT NULL CHECK (link_token_key_version = 1),
  redirect_uri text NOT NULL,
  provider_oauth_state_id text,
  received_redirect_uri text,
  callback_received_at timestamptz,
  completed_connection_id text REFERENCES provider_connections(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  UNIQUE(link_session_id),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX oauth_recovery_provider_state_unique
  ON oauth_recovery_states(provider_oauth_state_id)
  WHERE provider_oauth_state_id IS NOT NULL;
CREATE INDEX oauth_recovery_owner_idx
  ON oauth_recovery_states(owner_user_id, environment, expires_at);
