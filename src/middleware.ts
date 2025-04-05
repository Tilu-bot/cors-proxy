import type { NextRequest } from 'next/server';

const ipRequests: Record<string, { count: number, resetTime: number }> = {};

const RATE_LIMIT = process.env.RATE_LIMIT ? parseInt(process.env.RATE_LIMIT) : 100;
const RATE_WINDOW = process.env.RATE_WINDOW_MS ? parseInt(process.env.RATE_WINDOW_MS) : 60 * 1000;

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const currentTime = Date.now();

  if (!ipRequests[ip]) {
    ipRequests[ip] = { count: 1, resetTime: currentTime + RATE_WINDOW };
  } else {
    if (currentTime > ipRequests[ip].resetTime) {
      ipRequests[ip] = { count: 1, resetTime: currentTime + RATE_WINDOW };
    } else {
      ipRequests[ip].count++;
    }
  }

  if (ipRequests[ip].count > RATE_LIMIT) {
    return new Response('Too Many Requests', { status: 429 });
  }

  return new Response('OK', { status: 200 });
}
