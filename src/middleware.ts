import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL, // This will be auto-injected by Vercel
});

redis.connect().catch(console.error);

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100');
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW_MS || `${60 * 1000}`); // in ms

export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  if (ip === 'unknown') {
    return NextResponse.next(); // Or block unknown IPs if needed
  }

  const key = `rate-limit:${ip}`;
  const currentTime = Date.now();

  try {
    const tx = redis.multi();

    tx.incr(key);                         // Increase the count
    tx.pttl(key);                         // Get remaining TTL
    const [count, ttl] = await tx.exec() as [number, number];

    if (count === 1) {
      // First request, set TTL
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

    return NextResponse.next();
  } catch (err) {
    console.error('Redis Rate Limiter Error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
