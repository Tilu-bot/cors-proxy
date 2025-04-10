import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = Redis.fromEnv();

function getContentType(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}

async function logImageRequest(
  ip: string,
  url: string,
  status: number,
  size: number,
  userAgent: string,
  referer: string,
  duration: number
) {
  try {
    await pool.query(
      `INSERT INTO image_logs (ip, url, status, bytes, user_agent, referer, duration, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [ip, url, status, size, userAgent, referer, duration]
    );
  } catch (err) {
    console.error('[DB Image Log Error]', err);
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const ip = req.headers.get('x-forwarded-for') || '0.0.0.0';
  const referer = req.headers.get('referer') || '';
  const userAgent = req.headers.get('user-agent') || '';
  const start = Date.now();

  if (!url || !/^https?:\/\//.test(url)) {
    return new NextResponse('Invalid or missing url parameter', { status: 400 });
  }

  try {
    const cached = await redis.get<string>(url);
    if (cached) {
      const buffer = Buffer.from(cached, 'base64');
      const contentType = getContentType(url);

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=600, stale-while-revalidate=60', // ✅ Edge cache
        },
      });
    }

    const res = await fetch(url);
    const contentType = res.headers.get('Content-Type') || getContentType(url);
    const buffer = await res.arrayBuffer();
    const size = buffer.byteLength;

    await redis.set(url, Buffer.from(buffer).toString('base64'), { ex: 1800 }); // 30 mins

    const response = new NextResponse(buffer, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=60', // ✅ Edge cache
      },
    });

    const duration = Date.now() - start;
    logImageRequest(ip, url, res.status, size, userAgent, referer, duration);

    return response;
  } catch (err) {
    console.error('[Image Proxy Error]', err);
    const msg = 'Image fetch failed';
    const duration = Date.now() - start;
    logImageRequest(ip, url, 500, msg.length, userAgent, referer, duration);

    return new NextResponse(msg, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
