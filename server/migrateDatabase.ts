import { Pool } from 'pg';
import { asDatabasePool, migrateDatabase } from './databaseMigrations';
import { OperationalStoreConfigurationError } from './operationalStore';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new OperationalStoreConfigurationError('DATABASE_URL is required to run migrations.');
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await migrateDatabase(asDatabasePool(pool));
  console.info('[database] Migrations are current.');
} finally {
  await pool.end();
}
