import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Just forward the request – no rate limiting here
  return NextResponse.next();
}

// Apply middleware to all routes if needed
export const config = {
  matcher: '/api/:path*', // optional: only run for API routes
};

