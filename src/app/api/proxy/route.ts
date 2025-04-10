import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = Redis.fromEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const REDIS_TTL = 600; // 10 minutes

function rewriteM3U8Urls(m3u8: string, originalUrl: string, proxyUrl: string): string {
  const base = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
  return m3u8.replace(/^(?!#)(.+)$/gm, (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return trimmed;
    try {
      const absolute = new URL(trimmed, base).href;
      return `${proxyUrl}?url=${encodeURIComponent(absolute)}`;
    } catch {
      return trimmed;
    }
  });
}

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
  try {
    await pool.query(
      `INSERT INTO proxy_logs 
       (uuid, url, status, bytes, duration, type, sanitized, from_cache, edge_cached, ip, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [
        details.id,
        details.url,
        details.status,
        details.bytes,
        details.duration,
        details.type,
        details.sanitized,
        details.fromCache,
        details.edgeCached,
        details.ip,
      ]
    );
  } catch (err) {
    console.error('[DB Log Error]', err);
  }
}

async function updateRealtimeMetrics({
  type,
  status,
  edgeCached,
  duration,
}: {
  type: string;
  status: number;
  edgeCached: boolean;
  duration: number;
}) {
  const minuteKey = Math.floor(Date.now() / 60000); // Current minute
  const ops: Promise<any>[] = [];

  const metrics: [string, boolean][] = [
    [`rpm:total:${minuteKey}`, true],
    [`rpm:outgoing:${minuteKey}`, type === 'm3u8' || type === 'ts'],
    [`rpm:edgeHit:${minuteKey}`, edgeCached],
    [`rpm:success:${minuteKey}`, status >= 200 && status < 300],
    [`rpm:error:${minuteKey}`, status >= 400],
  ];

  for (const [key, shouldRun] of metrics) {
    if (shouldRun) {
      ops.push(redis.incr(key));
      ops.push(redis.expire(key, REDIS_TTL));
    }
  }

  if (status < 500) {
    ops.push(redis.incrby(`rpm:durationSum:${minuteKey}`, duration));
    ops.push(redis.incr(`rpm:durationCount:${minuteKey}`));
    ops.push(redis.expire(`rpm:durationSum:${minuteKey}`, REDIS_TTL));
    ops.push(redis.expire(`rpm:durationCount:${minuteKey}`, REDIS_TTL));
  }

  await Promise.all(ops);
}

async function handleProxyRequest(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'Invalid or missing url parameter' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
  const id = crypto.randomUUID();
  const start = Date.now();
  const sanitized = url !== sanitizeUrl(url);

  try {
    const fetchRes = await fetch(url, {
      method: request.method,
      headers: Object.fromEntries(
        [...request.headers.entries()].filter(
          ([k]) => !['host', 'origin', 'referer', 'connection', 'content-length'].includes(k.toLowerCase())
        )
      ),
    });

    const contentType = fetchRes.headers.get('Content-Type') || '';
    const fileType = detectFileType(url, contentType);

    let body: string | ArrayBuffer;
    if (fileType === 'm3u8') {
      const text = await fetchRes.text();
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || '';
      const proxyBase = `${proto}://${host}/api/proxy`;
      body = rewriteM3U8Urls(text, url, proxyBase);
    } else if (fileType === 'vtt' || contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) {
      body = await fetchRes.text();
    } else {
      body = await fetchRes.arrayBuffer();
    }

    const bytes = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength;
    const duration = Date.now() - start;

    const headers = new Headers(fetchRes.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=60');

    const edgeCached = true;

    await Promise.all([
      logRequest({
        id,
        url,
        status: fetchRes.status,
        bytes,
        duration,
        type: fileType,
        sanitized,
        fromCache: false,
        edgeCached,
        ip,
      }),
      updateRealtimeMetrics({
        type: fileType,
        status: fetchRes.status,
        edgeCached,
        duration,
      }),
    ]);

    return new NextResponse(body, {
      status: fetchRes.status,
      headers,
    });
  } catch (err) {
    const duration = Date.now() - start;
    console.error('[Proxy Error]', err);

    await Promise.all([
      logRequest({
        id,
        url,
        status: 500,
        bytes: 0,
        duration,
        type: 'error',
        sanitized,
        fromCache: false,
        edgeCached: false,
        ip,
      }),
      updateRealtimeMetrics({
        type: 'error',
        status: 500,
        edgeCached: false,
        duration,
      }),
    ]);

    return new NextResponse('Proxy fetch failed', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// Export all HTTP methods
export async function GET(req: NextRequest) {
  return handleProxyRequest(req);
}
export async function POST(req: NextRequest) {
  return handleProxyRequest(req);
}
export async function PUT(req: NextRequest) {
  return handleProxyRequest(req);
}
export async function DELETE(req: NextRequest) {
  return handleProxyRequest(req);
}
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
