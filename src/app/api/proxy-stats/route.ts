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
    const cached = await redis.get('dashboard:proxyStatsWithLogs');
    if (cached) return NextResponse.json(cached);

    const summaryRes = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalRequests",
        COUNT(CASE WHEN status BETWEEN 200 AND 299 THEN 1 END)::int AS "successfulRequests",
        COUNT(CASE WHEN status >= 400 THEN 1 END)::int AS "failedRequests",
        COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 minute')::int AS "outgoingPerMin",
        COUNT(*) FILTER (WHERE status BETWEEN 200 AND 299 AND timestamp > NOW() - INTERVAL '1 minute')::int AS "successPerMin",
        COUNT(*) FILTER (WHERE status >= 400 AND timestamp > NOW() - INTERVAL '1 minute')::int AS "errorPerMin",
        COUNT(*) FILTER (WHERE edge_cached = true AND timestamp > NOW() - INTERVAL '5 minutes')::int AS "edgeActiveCount",
        AVG(duration)::float AS "avgResponseTime",
        MAX(duration)::int AS "maxResponseTime",
        COUNT(*) FILTER (WHERE type IN ('m3u8', 'vtt', 'ts')) AS "streamRequests",
        COUNT(*) FILTER (WHERE status = 200 AND type IN ('m3u8', 'ts')) AS "edgeCacheHits"
      FROM proxy_logs
    `);

    const summary = summaryRes.rows[0] || {};
    const total = summary.totalRequests || 0;
    const success = summary.successfulRequests || 0;

    const summaryStats = {
      totalRequestsPerMin: summary.outgoingPerMin || 0,
      successPerMin: summary.successPerMin || 0,
      errorPerMin: summary.errorPerMin || 0,
      successRate: total > 0 ? Math.round((success / total) * 100) : 100,
      errorRate: total > 0 ? 100 - Math.round((success / total) * 100) : 0,
      avgResponseTime: Math.round(summary.avgResponseTime || 0),
      maxResponseTime: summary.maxResponseTime || 0,
      edgeCacheHits: summary.edgeCacheHits || 0,
      edgeActiveCount: summary.edgeActiveCount || 0,
      incomingCount: summary.streamRequests || 0,
      outgoingCount: total,
    };

    const [successLogs, errorLogs, outgoingLogs, incomingLogs, cacheLogs, slowestLogs] = await Promise.all([
      pool.query(`SELECT id, type, url, status, duration, sanitized, timestamp FROM proxy_logs WHERE status BETWEEN 200 AND 299 ORDER BY timestamp DESC LIMIT 30`),
      pool.query(`SELECT id, type, url, status, duration, sanitized, timestamp FROM proxy_logs WHERE status >= 400 ORDER BY timestamp DESC LIMIT 30`),
      pool.query(`SELECT id, type, url, status, duration, sanitized, timestamp FROM proxy_logs ORDER BY timestamp DESC LIMIT 30`),
      pool.query(`SELECT id, type, url, status, duration, sanitized, timestamp FROM proxy_logs WHERE type IN ('m3u8', 'vtt', 'ts') ORDER BY timestamp DESC LIMIT 30`),
      pool.query(`SELECT id, type, url, status, duration, sanitized, edge_cached AS "cache_status", timestamp FROM proxy_logs WHERE edge_cached = true ORDER BY timestamp DESC LIMIT 30`),
      pool.query(`SELECT id, type, url, status, duration, sanitized, timestamp FROM proxy_logs ORDER BY duration DESC LIMIT 30`),
    ]);

    const responsePayload = {
      ...summaryStats,
      successLogs: successLogs.rows,
      errorLogs: errorLogs.rows,
      outgoingLogs: outgoingLogs.rows,
      incomingLogs: incomingLogs.rows,
      cacheLogs: cacheLogs.rows,
      slowestLogs: slowestLogs.rows,
    };

    await redis.set('dashboard:proxyStatsWithLogs', responsePayload, { ex: 300 }); // cache for 5 minutes

    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error('[ProxyStats Error]', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
