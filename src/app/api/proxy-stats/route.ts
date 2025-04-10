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

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalRequests",
        COALESCE(SUM(bytes), 0)::bigint AS "totalBytes",
        COUNT(CASE WHEN status BETWEEN 200 AND 299 THEN 1 END)::int AS "successfulRequests",
        COUNT(CASE WHEN status >= 400 THEN 1 END)::int AS "failedRequests",
        AVG(duration)::float AS "avgResponseTime",
        COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 minute')::int AS "requestsPerMinute"
      FROM proxy_logs
    `);

    const stats = result.rows[0] ?? {};

    const totalRequests = stats.totalRequests || 0;
    const successfulRequests = stats.successfulRequests || 0;

    const successRate = totalRequests > 0
      ? Math.round((successfulRequests / totalRequests) * 100)
      : 100;

    const errorRate = 100 - successRate;

    return NextResponse.json({
      totalRequestsPerMin: stats.requestsPerMinute || 0,
      successRate,
      errorRate,
      avgResponseTime: Math.round(stats.avgResponseTime || 0),
    });
  } catch (err) {
    console.error('Stats API error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
