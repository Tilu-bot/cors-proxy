import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get('url');

  if (!urlParam) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  try {
    const targetUrl = decodeURIComponent(urlParam);
    const response = await fetch(targetUrl);

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image`, { status: response.status });
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    const res = new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        // Actual content type
        'Content-Type': contentType,

        // CORS headers
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',

        // Optional caching
        'Cache-Control': 'public, max-age=86400',
      },
    });

    return res;
  } catch (err) {
    console.error('[Image Proxy Error]', err);
    return new NextResponse('Error fetching image', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
      }
