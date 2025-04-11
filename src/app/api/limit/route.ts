import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

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

async function logImageRequest(details: {
  id: string;
  url: string;
  status: number;
  size: number;
  duration: number;
}) {
  try {
    await pool.query(
      `INSERT INTO image_logs (uuid, url, status, bytes, duration, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [details.id, details.url, details.status, details.size, details.duration]
    );
  } catch (err) {
    console.error('[DB Image Log Error]', err);
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const start = Date.now();
  const id = crypto.randomUUID();

  if (!url || !/^https?:\/\//.test(url)) {
    return new NextResponse('Invalid or missing url parameter', { status: 400 });
  }

  try {
    const cached = await redis.get<string>(url);
    if (cached) {
      const buffer = Buffer.from(cached, 'base64');
      const duration = Date.now() - start;
      await logImageRequest({
        id,
        url,
        status: 200,
        size: buffer.byteLength,
        duration
      });

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': getContentType(url),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=600, stale-while-revalidate=60',
        },
      });
    }

    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('Content-Type') || getContentType(url);
    const size = buffer.byteLength;

    await redis.set(url, Buffer.from(buffer).toString('base64'), { ex: 1800 });

    const duration = Date.now() - start;

    await logImageRequest({
      id,
      url,
      status: res.status,
      size,
      duration,
    });

    return new NextResponse(buffer, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[Image Proxy Error]', err);
    const msg = 'Image fetch failed';
    const duration = Date.now() - start;

    await logImageRequest({
      id,
      url,
      status: 500,
      size: msg.length,
      duration,
    });

    return new NextResponse(msg, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
