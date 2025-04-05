import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

async function logRequest(ip: string | null, url: string, status: number, bytes: number, userAgent: string | null, referer: string | null, duration: number) {
  try {
    const query = `
      INSERT INTO proxy_logs (ip, url, status, bytes, user_agent, referer, duration, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;
    
    await pool.query(query, [
      ip || '0.0.0.0',
      url,
      status,
      bytes,
      userAgent || '',
      referer || '',
      duration
    ]);
  } catch (error) {
    console.error('Failed to log request:', error);
  }
}

async function handleProxyRequest(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get('url');
  const startTime = Date.now();
  let status = 400;
  let responseSize = 0;
  
  if (!targetUrl) {
    return new NextResponse('Missing url parameter', { status });
  }
  
  try {
    // Copy original request headers and method
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      // Skip host-specific headers
      if (!['host', 'origin', 'referer'].includes(key.toLowerCase())) {
        headers.append(key, value);
      }
    });
    
    // Forward the request with the same method and body
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      // Only include body for methods that support it
      ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: await request.blob() } : {})
    };
    
    const response = await fetch(targetUrl, fetchOptions);
    status = response.status;
    
    // Get response data based on content type
    const contentType = response.headers.get('Content-Type') || '';
    let responseData;
    
    if (contentType.includes('application/json')) {
      responseData = await response.text(); // Keep as text to avoid parsing errors
    } else if (contentType.includes('text/')) {
      responseData = await response.text();
    } else {
      responseData = await response.arrayBuffer();
    }
    
    responseSize = typeof responseData === 'string' ? responseData.length : responseData.byteLength || 0;
    
    // Create response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip CORS headers from the original response
      if (!key.toLowerCase().startsWith('access-control-')) {
        responseHeaders.append(key, value);
      }
    });
    
    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    // Create the response
    const res = new NextResponse(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
    
    // Log the request after it's processed
    const duration = Date.now() - startTime;
    const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
    const userAgent = request.headers.get('user-agent');
    const referer = request.headers.get('referer');
    
    // Log asynchronously without waiting
    logRequest(ip, targetUrl, status, responseSize, userAgent, referer, duration);
    
    return res;
  } catch {
    status = 500;
    const errorMessage = 'Error fetching from target URL';
    responseSize = errorMessage.length;
    
    // Log failed request
    const duration = Date.now() - startTime;
    const ip = request.headers.get('x-forwarded-for') || '0.0.0.0';
    const userAgent = request.headers.get('user-agent');
    const referer = request.headers.get('referer');
    
    // Log asynchronously without waiting
    logRequest(ip, targetUrl, status, responseSize, userAgent, referer, duration);
    
    return new NextResponse(errorMessage, { 
      status,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      }
    });
  }
}

export async function GET(request: NextRequest) {
  return handleProxyRequest(request);
}

export async function POST(request: NextRequest) {
  return handleProxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return handleProxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleProxyRequest(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    },
  });
}
