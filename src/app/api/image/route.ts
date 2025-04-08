import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Pool } from '@neondatabase/serverless';

const redis = Redis.fromEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function logRequest(
  ip: string,
  url: string,
  status: number,
  bytes: number,
  userAgent: string,
  referer: string,
  duration: number,
  type: string = 'image'
) {
  try {
    await pool.query(
      `INSERT INTO proxy_logs (ip, url, status, bytes, user_agent, referer, duration, type, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [ip, url, status, bytes, userAgent, referer, duration, type]
    );
  } catch (err) {
    console.error('[Image Log Error]', err);
  }
}

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get('url');
  const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';
  const start = Date.now();

  if (!urlParam) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  const targetUrl = decodeURIComponent(urlParam);

  try {
    const cached = await redis.get(targetUrl);
    if (cached) {
      const buf = Buffer.from(cached as string, 'base64');
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const res = await fetch(targetUrl);
    if (!res.ok) {
      return new NextResponse(`Failed to fetch image`, { status: res.status });
    }

    const contentType = res.headers.get('Content-Type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const duration = Date.now() - start;
    const byteLength = arrayBuffer.byteLength;

    // Cache in Redis (base64 to safely store binary)
    await redis.set(targetUrl, Buffer.from(arrayBuffer).toString('base64'), { ex: 86400 });

    // Log to DB
    logRequest(ip, targetUrl, res.status, byteLength, userAgent, referer, duration);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[Image Proxy Error]', err);
    return new NextResponse('Error fetching image', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
