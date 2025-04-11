import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';

function isValidToken(token: string | null): boolean {
  return token === ADMIN_TOKEN;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!isValidToken(token ?? null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  if (!type) {
    return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
  }

  try {
    const cachedKey = `dash:details:${type}`;
    const cached = await redis.get(cachedKey);
    if (cached) return NextResponse.json(JSON.parse(cached as string));

    let query = '';
    const values: (string | number | boolean)[] = []; // Use const and specific type

    switch (type) {
      case 'avg':
        query = `
          SELECT id, type, duration, status, url, timestamp
          FROM proxy_logs
          ORDER BY duration DESC
          LIMIT 20
        `;
        break;

      case 'success':
        query = `
          SELECT id, type, url, bytes, duration, timestamp
          FROM proxy_logs
          WHERE status BETWEEN 200 AND 299
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        break;

      case 'error':
        query = `
          SELECT id, type, url, status, duration, timestamp
          FROM proxy_logs
          WHERE status >= 400
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        break;

      case 'incoming':
        query = `
          SELECT id, type, url, duration, timestamp, sanitized
          FROM proxy_logs
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        break;

      case 'outgoing':
        query = `
          SELECT id, type, url, duration, status, timestamp
          FROM proxy_logs
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        break;

      case 'cache':
        query = `
          SELECT id, type, url, cache_status, timestamp
          FROM proxy_logs
          WHERE cache_status IS NOT NULL
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        break;

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const result = await pool.query(query, values);
    await redis.set(cachedKey, JSON.stringify(result.rows), { ex: 300 }); // Cache 5 mins

    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('Stats details fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch detailed stats' }, { status: 500 });
  }
}
