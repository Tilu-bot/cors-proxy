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
  const type = searchParams.get('type'); // optional filter (error, success, incoming, etc.)

  try {
    let baseQuery = `
      SELECT
        id,
        url,
        status,
        type,
        duration,
        bytes,
        timestamp,
        sanitized,
        format,
        cached,
        cors_added,
        error_message,
        chunk_rewrite
      FROM proxy_logs
    `;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [limit, offset]; // Updated type and changed to const

    if (type === 'error') {
      conditions.push('status >= 400');
    } else if (type === 'success') {
      conditions.push('status BETWEEN 200 AND 299');
    } else if (type === 'incoming') {
      conditions.push("type = 'incoming'");
    } else if (type === 'outgoing') {
      conditions.push("type = 'outgoing'");
    } else if (type === 'edge-cache') {
      conditions.push('cached = true');
    }

    if (conditions.length > 0) {
      baseQuery += ' WHERE ' + conditions.join(' AND ');
    }

    baseQuery += ' ORDER BY timestamp DESC LIMIT $1 OFFSET $2';

    const result = await pool.query(baseQuery, values);
    return NextResponse.json({ logs: result.rows });
  } catch (err) {
    console.error('Dashboard Logs Error:', err);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
