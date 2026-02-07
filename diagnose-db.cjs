// diagnose-db.cjs - Database connection diagnostic for Plesk
// Run via: npm run diagnose-db

const net = require('net');

const DB_URL = process.env.DATABASE_URL || '';
console.log('=== DATABASE DIAGNOSTIC ===');
console.log('DATABASE_URL set:', !!DB_URL);
if (DB_URL) {
  console.log('URL:', DB_URL.replace(/:[^@]+@/, ':***@'));
}

// Parse host and port from URL
let host = '';
let port = 5432;
try {
  const url = new URL(DB_URL);
  host = url.hostname;
  port = parseInt(url.port) || 5432;
} catch (e) {
  console.log('URL parse error:', e.message);
  process.exit(1);
}

console.log('\n--- Test 1: TCP connection to', host + ':' + port, '---');

const s = net.createConnection(port, host, () => {
  console.log('RESULT: PORT', port, 'is OPEN (connection successful)');
  s.end();
  runPgTest();
});

s.on('error', (e) => {
  console.log('RESULT: PORT', port, 'BLOCKED or ERROR:', e.message);
  console.log('\n--- Trying port 443 ---');
  testPort443();
});

s.setTimeout(15000, () => {
  console.log('RESULT: PORT', port, 'TIMEOUT (firewall likely blocking)');
  s.destroy();
  console.log('\n--- Trying port 443 ---');
  testPort443();
});

function testPort443() {
  const s2 = net.createConnection(443, host, () => {
    console.log('RESULT: PORT 443 is OPEN');
    console.log('SOLUTION: Use Neon serverless driver or add :443 to DATABASE_URL');
    s2.end();
    process.exit(0);
  });
  s2.on('error', (e) => {
    console.log('PORT 443 also blocked:', e.message);
    process.exit(1);
  });
  s2.setTimeout(15000, () => {
    console.log('PORT 443 also TIMEOUT');
    s2.destroy();
    process.exit(1);
  });
}

function runPgTest() {
  console.log('\n--- Test 2: PostgreSQL connection ---');
  import('pg').then(({ default: pg }) => {
    const pool = new pg.Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30000
    });
    pool.query('SELECT NOW() as time')
      .then(r => {
        console.log('RESULT: Database connected!', r.rows[0].time);
        pool.end();
        process.exit(0);
      })
      .catch(e => {
        console.log('RESULT: PostgreSQL error:', e.message);
        pool.end();
        process.exit(1);
      });
  }).catch(e => {
    console.log('pg module not found:', e.message);
    process.exit(1);
  });
}
