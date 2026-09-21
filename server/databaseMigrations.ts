import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface DatabaseQueryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<R>>;
}

export interface DatabasePool extends DatabaseQueryable {
  connect(): Promise<Pick<PoolClient, 'query' | 'release'>>;
  end(): Promise<void>;
}

export interface DatabaseMigration {
  version: string;
  checksum: string;
  sql: string;
}

export class DatabaseMigrationError extends Error {
  readonly code = 'DATABASE_MIGRATION_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'DatabaseMigrationError';
  }
}

export const defaultMigrationsDirectory = () => {
  const sourceDirectory = path.resolve(process.cwd(), 'server', 'migrations');
  return existsSync(sourceDirectory)
    ? sourceDirectory
    : path.resolve(process.cwd(), 'dist-server', 'migrations');
};

export const loadDatabaseMigrations = async (
  directory = defaultMigrationsDirectory()
): Promise<DatabaseMigration[]> => {
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (names.length === 0) throw new DatabaseMigrationError('No database migrations were found.');
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(path.join(directory, name), 'utf8');
    return {
      version: name.slice(0, 3),
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    };
  }));
};

const ensureMigrationTable = (database: DatabaseQueryable) => database.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    checksum_sha256 char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const readApplied = async (database: DatabaseQueryable) => {
  await ensureMigrationTable(database);
  return database.query<{ version: string; checksum_sha256: string }>(
    'SELECT version, checksum_sha256 FROM schema_migrations ORDER BY version'
  );
};

const validateHistory = (
  known: DatabaseMigration[],
  applied: Array<{ version: string; checksum_sha256: string }>
) => {
  const knownByVersion = new Map(known.map((migration) => [migration.version, migration]));
  for (const row of applied) {
    const migration = knownByVersion.get(row.version);
    if (!migration) {
      throw new DatabaseMigrationError(`Database contains unknown migration ${row.version}.`);
    }
    if (migration.checksum !== row.checksum_sha256.trim()) {
      throw new DatabaseMigrationError(`Database migration ${row.version} checksum does not match.`);
    }
  }
};

export const migrateDatabase = async (
  pool: DatabasePool,
  migrations?: DatabaseMigration[]
): Promise<void> => {
  migrations ??= await loadDatabaseMigrations();
  const applied = await readApplied(pool);
  validateHistory(migrations, applied.rows);
  const appliedVersions = new Set(applied.rows.map((row) => row.version));
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureMigrationTable(client);
      const current = await client.query<{ version: string; checksum_sha256: string }>(
        'SELECT version, checksum_sha256 FROM schema_migrations ORDER BY version FOR UPDATE'
      );
      validateHistory(migrations, current.rows);
      if (!current.rows.some((row) => row.version === migration.version)) {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations(version, checksum_sha256) VALUES ($1, $2)',
          [migration.version, migration.checksum]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

export const assertCurrentDatabaseMigrations = async (
  database: DatabaseQueryable,
  migrations?: DatabaseMigration[]
): Promise<void> => {
  migrations ??= await loadDatabaseMigrations();
  const applied = await readApplied(database);
  validateHistory(migrations, applied.rows);
  const appliedVersions = new Set(applied.rows.map((row) => row.version));
  const missing = migrations.filter((migration) => !appliedVersions.has(migration.version));
  if (missing.length > 0) {
    throw new DatabaseMigrationError(`Database migration ${missing[0].version} has not been applied.`);
  }
};

export const asDatabasePool = (pool: Pool): DatabasePool => pool as unknown as DatabasePool;
