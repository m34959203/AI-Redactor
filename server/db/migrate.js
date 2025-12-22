/**
 * Database Migration Runner
 * Automatically applies SQL migrations on startup
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, getClient } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Ensure migrations tracking table exists
 */
async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

/**
 * Get list of applied migrations
 * @returns {Promise<string[]>}
 */
async function getAppliedMigrations() {
  try {
    const result = await query('SELECT name FROM _migrations ORDER BY id');
    return result.rows.map(row => row.name);
  } catch (error) {
    // Table might not exist yet
    return [];
  }
}

/**
 * Get list of pending migrations
 * @returns {Promise<string[]>}
 */
async function getPendingMigrations() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = await getAppliedMigrations();
  return sqlFiles.filter(f => !applied.includes(f));
}

/**
 * Run a single migration
 * @param {string} filename - Migration filename
 */
async function runMigration(filename) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Read and execute migration
    const migrationPath = path.join(MIGRATIONS_DIR, filename);
    const sql = await fs.readFile(migrationPath, 'utf8');

    console.log(`📝 Running migration: ${filename}`);
    await client.query(sql);

    // Record migration
    await client.query(
      'INSERT INTO _migrations (name) VALUES ($1)',
      [filename]
    );

    await client.query('COMMIT');
    console.log(`✅ Migration ${filename} applied successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Migration ${filename} failed:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run all pending migrations
 * @returns {Promise<number>} - Number of migrations applied
 */
export async function runMigrations() {
  console.log('🔄 Checking for database migrations...');

  await ensureMigrationsTable();
  const pending = await getPendingMigrations();

  if (pending.length === 0) {
    console.log('✅ Database is up to date');
    return 0;
  }

  console.log(`📦 Found ${pending.length} pending migration(s)`);

  for (const migration of pending) {
    await runMigration(migration);
  }

  console.log(`✅ Applied ${pending.length} migration(s)`);
  return pending.length;
}

/**
 * Check if database is ready (has tables)
 * @returns {Promise<boolean>}
 */
export async function isDatabaseReady() {
  try {
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sessions'
      ) as ready
    `);
    return result.rows[0]?.ready || false;
  } catch {
    return false;
  }
}

export default runMigrations;
