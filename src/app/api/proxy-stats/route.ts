import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = Redis.fromEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const REDIS_TTL = 600; // 10 min

function detectFileType(url: string, contentType: string): string {
  if (url.endsWith('.m3u8') || contentType.includes('mpegurl')) return 'm3u8';
  if (url.endsWith('.vtt') || contentType.includes('text/vtt')) return 'vtt';
  if (url.endsWith('.ts')) return 'ts';
  if (url.endsWith('.mpd')) return 'mpd';
  if (contentType.includes('image')) return 'image';
  if (contentType.includes('json')) return 'json';
  return 'other';
}

function sanitizeUrl(url: string): string {
  return url.split('?')[0];
}

async function logRequest(details: {
  id: string;
  url: string;
  status: number;
  bytes: number;
  duration: number;
  type: string;
  sanitized: boolean;
  fromCache: boolean;
  edgeCached: boolean;
  ip: string;
}) {
  const { id, url, status, bytes, duration, type, sanitized, fromCache, edgeCached, ip } = details;
  try {
    await pool.query(`
      INSERT INTO proxy_logs
        (uuid, url, status, bytes, duration, type, sanitized, from_cache, edge_cached, ip, timestamp)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
    `, [id, url, status, bytes, duration, type, sanitized, fromCache, edgeCached, ip]);
  } catch (err) {
    console.error('[DB Log Error]', err);
  }
}

async function updateRealtimeMetrics({ type, status, edgeCached, duration }: {
  type: string;
  status: number;
  edgeCached: boolean;
  duration: number;
}) {
  const ops: Promise<any>[] = [];
  const metrics: [string, boolean][] = [
    ['rpm:total', true],
    ['rpm:outgoing', type === 'm3u8' || type === 'ts'],
    ['rpm:edgeHit', edgeCached],
    ['rpm:success', status >= 200 && status < 300],
    ['rpm:error', status >= 400]
  ];

  for (const [key, cond] of metrics) {
    if (cond) {
      ops.push(redis.incr(key), redis.expire(key, REDIS_TTL));
    }
  }

  // duration tracking for avg
  if (status < 500) {
    ops.push(redis.incrby('rpm:totalDuration', duration));
    ops.push(redis.incr('rpm:durationCount'));
    ops.push(redis.expire('rpm:totalDuration', REDIS_TTL));
    ops.push(redis.expire('rpm:durationCount', REDIS_TTL));
  }

  await Promise.all(ops);
}

async function handleProxyRequest(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  const url = await redis.get<string>(`short:${key}`);
  if (!url) return NextResponse.json({ error: 'Invalid or expired key' }, { status: 404 });

  const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
  const id = crypto.randomUUID();
  const start = Date.now();
  const sanitized = url !== sanitizeUrl(url);

  try {
    const fetchRes = await fetch(url, {
      method: request.method,
      headers: Object.fromEntries([...request.headers.entries()].filter(([k]) => !['host', 'origin', 'referer'].includes(k))),
    });

    const contentType = fetchRes.headers.get('Content-Type') || '';
    const fileType = detectFileType(url, contentType);
    const edgeCached = true;

    let body: string | ArrayBuffer;
    if (fileType === 'm3u8' || fileType === 'vtt' || contentType.includes('text')) {
      body = await fetchRes.text();
    } else {
      body = await fetchRes.arrayBuffer();
    }

    const bytes = typeof body === 'string' ? body.length : body.byteLength;
    const duration = Date.now() - start;

    const headers = new Headers(fetchRes.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=60');

    await Promise.all([
      logRequest({ id, url, status: fetchRes.status, bytes, duration, type: fileType, sanitized, fromCache: false, edgeCached, ip }),
      updateRealtimeMetrics({ type: fileType, status: fetchRes.status, edgeCached, duration }),
    ]);

    return new NextResponse(body, { status: fetchRes.status, headers });
  } catch (err) {
    const duration = Date.now() - start;
    console.error('[Proxy Error]', err);
    await Promise.all([
      logRequest({ id, url, status: 500, bytes: 0, duration, type: 'error', sanitized, fromCache: false, edgeCached: false, ip }),
      updateRealtimeMetrics({ type: 'error', status: 500, edgeCached: false, duration }),
    ]);
    return new NextResponse('Proxy fetch failed', {
      status: 500,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// Export all HTTP methods
export async function GET(req: NextRequest) { return handleProxyRequest(req); }
export async function POST(req: NextRequest) { return handleProxyRequest(req); }
export async function PUT(req: NextRequest) { return handleProxyRequest(req); }
export async function DELETE(req: NextRequest) { return handleProxyRequest(req); }
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    },
  });
}

