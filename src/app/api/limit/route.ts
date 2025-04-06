import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL,
});

await redis.connect().catch(console.error);

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100');
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW_MS || '60000');

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const key = `rate-limit:${ip}`;

  try {
    const tx = redis.multi();
    tx.incr(key);
    tx.pttl(key);
    const [count, ttl] = await tx.exec() as [number, number];

    if (count === 1) {
      await redis.pexpire(key, RATE_WINDOW);
    }

    if (count > RATE_LIMIT) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': `${Math.ceil((ttl || RATE_WINDOW) / 1000)}`,
        },
      });
    }

    return new NextResponse(JSON.stringify({
      message: 'Request allowed',
      requestsMade: count,
      requestsRemaining: RATE_LIMIT - count,
      retryAfterSeconds: Math.ceil((ttl || RATE_WINDOW) / 1000),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error('API rate limiter error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
