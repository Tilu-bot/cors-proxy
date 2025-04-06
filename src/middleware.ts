import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL,
});

const redisConnectPromise = redis.connect().catch(console.error);

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100');        // Max 100 requests
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW_MS || '60000'); // 60 seconds

export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  if (ip === 'unknown') {
    return NextResponse.next(); // Optional: block if needed
  }

  const key = `rate-limit:${ip}`;

  try {
    await redisConnectPromise;

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

    return NextResponse.next({
      headers: {
        'X-RateLimit-Limit': RATE_LIMIT.toString(),
        'X-RateLimit-Remaining': (RATE_LIMIT - count).toString(),
        'X-RateLimit-Reset': `${Math.ceil((ttl || RATE_WINDOW) / 1000)}`,
      },
    });
  } catch (error) {
    console.error('Rate limiter middleware error:', error);
    return NextResponse.next(); // Fail-open
  }
}
