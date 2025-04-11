import { Pool } from 'pg';

// Neon PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Error handling
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Utility function to test connection (optional)
export async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ DB Connected at:', res.rows[0].now);
    client.release();
  } catch (error) {
    console.error('❌ Database connection error:', error);
  }
}

export { pool };
