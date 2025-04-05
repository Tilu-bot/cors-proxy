import { Pool } from 'pg';

// Create a single shared connection pool for the entire application
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://neondb_owner:npg_CKqk7rTL6WSO@ep-dawn-forest-a1qfzxqf-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
});

// Better error handling for the connection pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit the process in production as it would crash your app
  // Instead, let the connection be re-established
  if (process.env.NODE_ENV === 'development') {
    console.error('Database connection error in development mode, exiting...');
    process.exit(-1);
  }
});

// Add a simple function to test the database connection
export async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT NOW()');
    console.log('Database connection successful');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err);
    return false;
  } finally {
    if (client) client.release();
  }
}

export { pool };
