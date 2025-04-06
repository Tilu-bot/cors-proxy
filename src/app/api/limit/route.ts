import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

// ✅ Connect to Redis (use .env variable for security)
const redis = createClient({
  url: process.env.REDIS_URL,
});
redis.connect().catch(console.error);

// ✅ Rate-limiting configuration
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100');       // max requests
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW_MS || '60000'); // time window in ms

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  if (ip === 'unknown') {
    return new NextResponse('IP address not found', { status: 400 });
  }

  const key = `rate-limit:${ip}`;

  try {
    // Create Redis transaction
    const tx = redis.multi();
    tx.incr(key);        // increase request count
    tx.pTTL(key);        // get remaining TTL in ms
    const [count, ttl] = await tx.exec() as [number, number];

    // First request → set expiry
    if (count === 1) {
      await redis.pExpire(key, RATE_WINDOW);
    }

    // If limit exceeded
    if (count > RATE_LIMIT) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': `${Math.ceil((ttl || RATE_WINDOW) / 1000)}`,
        },
      });
    }

    // Success
    return new NextResponse(`✅ Allowed: ${count}/${RATE_LIMIT}`, {
      status: 200,
    });

  } catch (error) {
    console.error('Redis Rate Limiting Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
