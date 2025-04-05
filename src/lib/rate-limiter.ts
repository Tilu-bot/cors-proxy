import { Redis } from '@upstash/redis';

// Initialize Redis client (you'll need to install @upstash/redis)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL || '',
  token: process.env.UPSTASH_REDIS_TOKEN || ''
});

// Rate limit configuration
const RATE_LIMIT = {
  requests: 100, // Max requests per window
  window: 60 * 60, // Window in seconds (1 hour)
  bandwidth: 500 * 1024 * 1024, // 500MB per window
};

export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  reset: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / RATE_LIMIT.window);
  const key = `rate:${ip}:${window}`;
  
  // Increment and get the request count
  const count = await redis.incr(key);
  
  // Set expiration if this is the first request in this window
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT.window);
  }
  
  // Calculate reset time
  const reset = (window + 1) * RATE_LIMIT.window;
  
  return {
    allowed: count <= RATE_LIMIT.requests,
    remaining: Math.max(0, RATE_LIMIT.requests - count),
    reset
  };
}

export async function trackBandwidth(ip: string, bytes: number): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / RATE_LIMIT.window);
  const key = `bandwidth:${ip}:${window}`;
  
  // Increment bandwidth usage
  const usage = await redis.incrby(key, bytes);
  
  // Set expiration if this is the first request
  if (usage === bytes) {
    await redis.expire(key, RATE_LIMIT.window);
  }
  
  return {
    allowed: usage <= RATE_LIMIT.bandwidth,
    remaining: Math.max(0, RATE_LIMIT.bandwidth - usage)
  };
}