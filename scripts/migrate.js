import { Pool } from 'pg';
import { runMigrations } from '../server/migrate.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required; no migration was run.');
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await runMigrations(pool);
    console.log('Migration 001_durable_repository applied; existing rows preserved.');
  } catch (error) {
    // Never print a connection string, SQL statement or credentials.
    console.error(`Migration failed (${/^[A-Z0-9_]{2,12}$/.test(error.code || '') ? error.code : 'DATABASE_ERROR'}). Check database connectivity and owner privileges.`);
    process.exitCode = 1;
  } finally { await pool.end(); }
}
