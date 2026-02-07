/**
 * Database Configuration
 * Supports PostgreSQL via Neon Serverless (WebSocket, port 443)
 * with fallback to standard pg driver (port 5432)
 */

import pg from 'pg';

// Try to use Neon serverless driver (works on port 443, bypasses firewalls)
let Pool;
let usingNeon = false;

try {
  const neon = await import('@neondatabase/serverless');
  const ws = await import('ws');
  neon.neonConfig.webSocketConstructor = ws.default;
  Pool = neon.Pool;
  usingNeon = true;
  console.log('Using Neon serverless driver (WebSocket, port 443)');
} catch {
  // Fallback to standard pg driver
  Pool = pg.Pool;
  console.log('Using standard pg driver (TCP, port 5432)');
}

/**
 * Parse database URL or use individual environment variables
 */
function getDatabaseConfig() {
  // Check for DATABASE_URL first (Railway, Heroku, Render, etc.)
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : {
        rejectUnauthorized: false // Required for most cloud providers
      }
    };
  }

  // Fall back to individual variables
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'ai_redactor',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false
  };
}

// Create connection pool
const pool = new Pool({
  ...getDatabaseConfig(),
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 30000, // 30s timeout for Neon.tech cold starts
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DB_LOG === 'true') {
      console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Test database connection
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const result = await query('SELECT NOW() as time');
    console.log('Database connection successful:', result.rows[0].time);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

/**
 * Close all connections
 */
export async function closePool() {
  await pool.end();
  console.log('Database pool closed');
}

export { usingNeon };
export default pool;
