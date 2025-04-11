'use server';

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
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
    // Check Redis cache first (to reduce load)
    const cachedStats = await redis.get('dashboard:proxyStats');
    if (cachedStats) return NextResponse.json(cachedStats);

    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalRequests",
        COUNT(CASE WHEN status BETWEEN 200 AND 299 THEN 1 END)::int AS "successfulRequests",
        COUNT(CASE WHEN status >= 400 THEN 1 END)::int AS "failedRequests",
        AVG(duration)::float AS "avgResponseTime",
        MAX(duration)::int AS "maxResponseTime",
        COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 minute')::int AS "requestsPerMinute",
        COUNT(*) FILTER (WHERE "type" IN ('m3u8', 'vtt', 'ts')) AS "streamRequests",
        COUNT(*) FILTER (WHERE "status" = 200 AND "type" IN ('m3u8', 'ts')) AS "edgeCacheHits"
      FROM proxy_logs
    `);

    const row = result.rows[0] || {};

    const total = row.totalRequests || 0;
    const success = row.successfulRequests || 0;

    const successRate = total > 0 ? Math.round((success / total) * 100) : 100;
    const errorRate = 100 - successRate;

    const data = {
      totalRequestsPerMin: row.requestsPerMinute || 0,
      successRate,
      errorRate,
      avgResponseTime: Math.round(row.avgResponseTime || 0),
      maxResponseTime: row.maxResponseTime || 0,
      edgeCacheHits: row.edgeCacheHits || 0,
      incomingCount: row.streamRequests || 0,
      outgoingCount: total,
    };

    // Cache in Redis for 5 minutes
    await redis.set('dashboard:proxyStats', data, { ex: 300 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Stats API error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
