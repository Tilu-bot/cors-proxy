import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';

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

function rewriteVTTUrls(vttContent: string): string {
  // Placeholder for future VTT cue/image rewrites
  return vttContent;
}

async function logRequest(
  ip: string,
  url: string,
  status: number,
  bytes: number,
  ua: string,
  referer: string,
  duration: number,
  type: string
) {
  try {
    await pool.query(
      `INSERT INTO proxy_logs (ip, url, status, bytes, user_agent, referer, duration, type, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [ip, url, status, bytes, ua, referer, duration, type]
    );
  } catch (err) {
    console.error('[Log Error]', err);
  }
}

function detectFileType(url: string, type: string): string {
  if (url.endsWith('.m3u8') || type.includes('mpegurl')) return 'm3u8';
  if (url.endsWith('.vtt') || type.includes('text/vtt')) return 'vtt';
  if (url.endsWith('.mpd') || type.includes('application/dash+xml')) return 'mpd';
  if (type.includes('image')) return 'image';
  if (type.includes('json')) return 'json';
  if (type.includes('html')) return 'html';
  return 'other';
}

async function handleProxyRequest(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';
  const start = Date.now();

  if (!url || !/^https?:\/\//.test(url)) {
    return new NextResponse('Invalid or missing url parameter', { status: 400 });
  }

  const rateKey = `rate:${ip}`;
  const rate = (await redis.incr(rateKey)) || 0;
  if (rate === 1) await redis.expire(rateKey, 60);
  if (rate > 100) return new NextResponse('Rate limit exceeded', { status: 429 });

  try {
    const cached = await redis.get(url);
    if (cached) {
      return new NextResponse(cached as string, {
        status: 200,
        headers: {
          'Content-Type': url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=60, public',
        },
      });
    }

    const headers = new Headers();
    request.headers.forEach((val, key) => {
      if (!['host', 'origin', 'referer'].includes(key)) headers.set(key, val);
    });

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: await request.blob() } : {})
    };

    const res = await fetch(url, fetchOptions);
    const contentType = res.headers.get('Content-Type') || '';
    const fileType = detectFileType(url, contentType);

    let body;
    let size = 0;

    if (fileType === 'm3u8') {
      const text = await res.text();
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || '';
      const proxyBase = `${proto}://${host}/api/proxy`;
      body = rewriteM3U8Urls(text, url, proxyBase);
      await redis.set(url, body, { ex: 600 });
    } else if (fileType === 'vtt') {
      const text = await res.text();
      body = rewriteVTTUrls(text);
      await redis.set(url, body, { ex: 600 });
    } else if (fileType === 'json' || contentType.includes('text/') || contentType.includes('application/xml')) {
      body = await res.text();
    } else {
      body = await res.arrayBuffer();
    }

    size = typeof body === 'string' ? body.length : body.byteLength || 0;

    const responseHeaders = new Headers();
    res.headers.forEach((val, key) => {
      if (!key.startsWith('access-control-')) responseHeaders.set(key, val);
    });

    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    responseHeaders.set('Cache-Control', 'public, max-age=60'); // Edge cache hint

    const finalRes = new NextResponse(body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });

    const duration = Date.now() - start;
    logRequest(ip, url, res.status, size, userAgent, referer, duration, fileType);

    return finalRes;
  } catch (err) {
    console.error('[Proxy Error]', err);
    const msg = 'Fetch failed';
    const duration = Date.now() - start;
    logRequest(ip, url, 500, msg.length, userAgent, referer, duration, 'error');

    return new NextResponse(msg, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
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
      'Access-Control-Max-Age': '86400',
    },
  });
}
