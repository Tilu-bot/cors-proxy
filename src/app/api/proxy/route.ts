import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function rewriteM3U8Urls(m3u8Content: string, originalUrl: string, proxyBaseUrl: string): string {
  const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);

  return m3u8Content.replace(
    /^(?!#)(.+)$/gm,
    line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return trimmed;

      try {
        const absoluteUrl = new URL(trimmed, baseUrl).href;
        return `${proxyBaseUrl}?url=${encodeURIComponent(absoluteUrl)}`;
      } catch {
        return trimmed;
      }
    }
  );
}

function rewriteVTTUrls(vttContent: string, originalUrl: string): string {
  // Optional: Enhance styling or cue images in future
  return vttContent;
}

async function logRequest(
  ip: string,
  url: string,
  status: number,
  bytes: number,
  userAgent: string,
  referer: string,
  duration: number,
  type: string
) {
  try {
    await pool.query(
      `INSERT INTO proxy_logs (ip, url, status, bytes, user_agent, referer, duration, type, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [ip, url, status, bytes, userAgent, referer, duration, type]
    );
  } catch (err) {
    console.error('DB log error:', err);
  }
}

function detectFileType(url: string, contentType: string): string {
  if (url.endsWith('.m3u8') || contentType.includes('mpegurl')) return 'm3u8';
  if (url.endsWith('.vtt') || contentType.includes('text/vtt')) return 'vtt';
  if (url.endsWith('.mpd') || contentType.includes('application/dash+xml')) return 'mpd';
  if (contentType.includes('image')) return 'image';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('html')) return 'html';
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
        },
      });
    }

    const headers = new Headers();
    request.headers.forEach((val, key) => {
      if (!['host', 'origin', 'referer'].includes(key)) headers.append(key, val);
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
      const txt = await res.text();
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || '';
      const proxyUrl = `${proto}://${host}/api/proxy`;
      body = rewriteM3U8Urls(txt, url, proxyUrl);
      await redis.set(url, body, { ex: 600 });
    } else if (fileType === 'vtt') {
      const txt = await res.text();
      body = rewriteVTTUrls(txt, url);
      await redis.set(url, body, { ex: 600 });
    } else if (fileType === 'json' || contentType.includes('text/') || contentType.includes('application/xml')) {
      body = await res.text();
    } else {
      body = await res.arrayBuffer();
    }

    size = typeof body === 'string' ? body.length : body.byteLength || 0;

    const responseHeaders = new Headers();
    res.headers.forEach((val, key) => {
      if (!key.startsWith('access-control-')) responseHeaders.append(key, val);
    });

    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    const finalRes = new NextResponse(body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });

    const duration = Date.now() - start;
    logRequest(ip, url, res.status, size, userAgent, referer, duration, fileType);

    return finalRes;
  } catch (err) {
    console.error('Proxy fetch error:', err);
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
