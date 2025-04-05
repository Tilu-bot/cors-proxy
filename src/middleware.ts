import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ALLOWED_ORIGINS } from './lib/origins';

export function middleware(request: NextRequest) {
  // Get the origin from the request
  const origin = request.headers.get('origin');
  
  // Check if the origin is allowed
  const isAllowedOrigin = origin && ALLOWED_ORIGINS.includes(origin);
  
  // Get the response from the target endpoint
  const response = NextResponse.next();
  
  // Set CORS headers
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
