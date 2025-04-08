import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function rewriteM3U8Urls(m3u8Content: string, originalUrl: string, proxyBaseUrl: string): string {
  const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
  return m3u8Content.replace(/^(?!#)(.+\.(ts|m3u8))$/gm, line => {
    const absoluteUrl = new URL(line, baseUrl).href;
    return `${proxyBaseUrl}?url=${encodeURIComponent(absoluteUrl)}`;
  });
}

async function logRequest(ip: string, url: string, status: number, bytes: number, userAgent: string, referer: string, duration: number) {
  try {
    await pool.query(
      `INSERT INTO proxy_logs (ip, url, status, bytes, user_agent, referer, duration, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [ip, url, status, bytes, userAgent, referer, duration]
    );
  } catch (err) {
    console.error('DB log error:', err);
  }
}

async function handleProxyRequest(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';
  const start = Date.now();

  if (!url) return new NextResponse('Missing url parameter', { status: 400 });

  try {
    const cached = await redis.get(url);
    if (cached) {
      return new NextResponse(cached as string, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
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
    let body;
    let size = 0;

    const isM3U8 = contentType.includes('mpegurl') || url.endsWith('.m3u8');

    if (isM3U8) {
      const txt = await res.text();
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || '';
      const proxyUrl = `${proto}://${host}/api/proxy`;
      body = rewriteM3U8Urls(txt, url, proxyUrl);
      await redis.set(url, body, { ex: 60 * 10 }); // cache 10 mins
    } else if (contentType.includes('text/') || contentType.includes('json')) {
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
    logRequest(ip, url, res.status, size, userAgent, referer, duration);

    return finalRes;
  } catch (err) {
    const msg = 'Fetch failed';
    const duration = Date.now() - start;
    logRequest(ip, url, 500, msg.length, userAgent, referer, duration);

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

