import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = Redis.fromEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function rewriteM3U8Urls(m3u8: string, originalUrl: string, proxyUrl: string): string {
  const base = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
  return m3u8.replace(/^(?!#)(.+)$/gm, line => {
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
  const {
    id, url, status, bytes, duration, type,
    sanitized, fromCache, edgeCached, ip,
  } = details;

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

async function updateRealtimeMetrics({
  type,
  status,
  edgeCached,
}: {
  type: string;
  status: number;
  edgeCached: boolean;
}) {
  const promises = [];

  promises.push(redis.incr('rpm:total'), redis.expire('rpm:total', 60));

  if (type === 'm3u8' || type === 'ts') {
    promises.push(redis.incr('rpm:outgoing'), redis.expire('rpm:outgoing', 60));
  }

  if (edgeCached) {
    promises.push(redis.incr('rpm:edgeHit'), redis.expire('rpm:edgeHit', 60));
  }

  if (status >= 200 && status < 300) {
    promises.push(redis.incr('rpm:success'), redis.expire('rpm:success', 60));
  } else if (status >= 400) {
    promises.push(redis.incr('rpm:error'), redis.expire('rpm:error', 60));
  }

  await Promise.all(promises);
}

async function handleProxyRequest(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
  const id = crypto.randomUUID();
  const start = Date.now();

  if (!url || !/^https?:\/\//.test(url)) {
    return new NextResponse('Invalid or missing url parameter', { status: 400 });
  }

  const sanitized = url !== sanitizeUrl(url);

  try {
    const fetchRes = await fetch(url, {
      method: request.method,
      headers: Object.fromEntries(
        [...request.headers.entries()].filter(([k]) => !['host', 'origin', 'referer'].includes(k))
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
    } else if (fileType === 'vtt') {
      body = await fetchRes.text(); // for future: rewriteVTT()
    } else if (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) {
      body = await fetchRes.text();
    } else {
      body = await fetchRes.arrayBuffer();
    }

    const bytes = typeof body === 'string' ? body.length : body.byteLength;
    const duration = Date.now() - start;

    const headers = new Headers(fetchRes.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=60'); // Edge cache

    const edgeCached = true;

    // log + metrics
    await Promise.all([
      logRequest({
        id, url, status: fetchRes.status, bytes,
        duration, type: fileType, sanitized,
        fromCache: false, edgeCached, ip
      }),
      updateRealtimeMetrics({
        type: fileType,
        status: fetchRes.status,
        edgeCached,
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
        id, url, status: 500, bytes: 0,
        duration, type: 'error', sanitized,
        fromCache: false, edgeCached: false, ip
      }),
      updateRealtimeMetrics({
        type: 'error',
        status: 500,
        edgeCached: false,
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
