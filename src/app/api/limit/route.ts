import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(console.error);

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100');
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW_MS || '60000');

export async function GET(request: NextRequest) {
  const ipRaw = request.headers.get('x-forwarded-for') || '';
  const ip = ipRaw.split(',')[0].trim();

  if (!ip) {
    return new NextResponse('IP address not found', { status: 400 });
  }

  const key = `rate-limit:${ip}`;

  try {
    const tx = redis.multi();
    tx.incr(key);
    tx.pTTL(key);
    const [count, ttl] = await tx.exec() as [number, number];

    if (count === 1) {
      await redis.pExpire(key, RATE_WINDOW);
    }

    if (count > RATE_LIMIT) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': `${Math.ceil((ttl || RATE_WINDOW) / 1000)}`
        },
      });
    }

    return new NextResponse(`✅ Allowed: ${count}/${RATE_LIMIT}`, {
      status: 200,
      headers: {
        'X-RateLimit-Limit': RATE_LIMIT.toString(),
        'X-RateLimit-Remaining': (RATE_LIMIT - count).toString(),
        'X-RateLimit-Reset': `${Date.now() + (ttl || RATE_WINDOW)}`
      }
    });

  } catch (error) {
    console.error('Redis Rate Limiting Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
