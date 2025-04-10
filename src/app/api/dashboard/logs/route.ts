import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';

function isValidToken(token: string | null): boolean {
  return token === ADMIN_TOKEN;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!isValidToken(token ?? null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    const result = await pool.query(`
      SELECT
        method,
        url,
        status,
        duration,
        bytes,
        timestamp
      FROM proxy_logs
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return NextResponse.json({ logs: result.rows });
  } catch (err) {
    console.error('Log fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
