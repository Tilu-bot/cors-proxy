import type { NextRequest } from "next/server";
import { verifyProxyToken } from '@/lib/token';
import { checkRateLimit, trackBandwidth } from '@/lib/rate-limiter';
import { logProxyRequest } from '@/lib/logger';

const ALLOWED_ORIGINS = [
  'your-main-site.com',
  'your-app.vercel.app',
  'localhost:3000'
];

export const config = {
  runtime: 'edge', // Use Edge runtime for better performance
};

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const userAgent = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';

  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");
    const token = searchParams.get("token");

    if (!targetUrl) {
      return new Response("❌ Missing 'url' query parameter", { status: 400 });
    }

    // Token validation (disable in development for easier testing)
    if (process.env.NODE_ENV === 'production') {
      if (!token || !verifyProxyToken(token, targetUrl)) {
        return new Response("❌ Invalid or expired token", { status: 403 });
      }
    }

    // URL validation for media types
    if (!/^https?:\/\//.test(targetUrl) || !/\.(m3u8|ts|mp4|m4s|webm|mp3|aac)(\?|$)/.test(targetUrl)) {
      return new Response("❌ Invalid or unsupported media URL", { status: 403 });
    }

    const origin = req.headers.get('origin');
    
    // Skip origin check in development
    if (process.env.NODE_ENV !== 'development') {
      const isAllowed = referer && ALLOWED_ORIGINS.some(domain => 
        referer.includes(domain)
      ) || origin && ALLOWED_ORIGINS.some(domain => 
        origin.includes(domain)
      );
      
      if (!isAllowed) {
        return new Response("❌ Unauthorized origin", { status: 403 });
      }
    }

    // Check rate limit after validating the request is legitimate
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.allowed) {
      return new Response("❌ Rate limit exceeded", {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          'X-RateLimit-Limit': String(100),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': String(rateLimit.reset)
        }
      });
    }

    const range = req.headers.get("range");
    const forwardedHeaders: HeadersInit = {
      "User-Agent": userAgent || "Mozilla/5.0",
      "Referer": new URL(targetUrl).origin,
      "Origin": new URL(targetUrl).origin,
    };

    if (range) forwardedHeaders["Range"] = range;

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: forwardedHeaders,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok && response.status !== 206) {
      // Log failed requests
      await logProxyRequest({
        timestamp: new Date().toISOString(),
        ip,
        url: targetUrl,
        status: response.status,
        bytes: 0,
        userAgent,
        referer: referer || 'unknown',
        duration: Date.now() - startTime
      });
      
      return new Response(`❌ Upstream error: ${response.status}`, { status: response.status });
    }

    const passHeaders = [
      "content-type",
      "content-length",
      "content-disposition",
      "content-range",
      "accept-ranges",
      "cache-control",
      "last-modified",
      "etag",
      "expires",
    ];

    const newHeaders = new Headers();

    for (const h of passHeaders) {
      const val = response.headers.get(h);
      if (val) newHeaders.set(h, val);
    }

    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "*");
    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

    // Apply caching rules
    const extension = new URL(targetUrl).pathname.split(".").pop()?.toLowerCase();
    if (["mp4", "mp3", "webm", "ogg", "jpg", "png", "gif"].includes(extension || "")) {
      newHeaders.set("Cache-Control", "public, max-age=86400");
    } else if (extension === "m3u8") {
      newHeaders.set("Cache-Control", "public, max-age=60");
    } else if (extension === "ts") {
      newHeaders.set("Cache-Control", "public, max-age=604800");
    }

    // Get response as buffer to calculate size and track bandwidth
    const buffer = await response.arrayBuffer();
    const duration = Date.now() - startTime;
    const contentLength = buffer.byteLength;

    // Bandwidth limit (track only large files)
    if (contentLength > 1024 * 1024) {
      const bandwidth = await trackBandwidth(ip, contentLength);
      if (!bandwidth.allowed) {
        return new Response("❌ Bandwidth limit exceeded", { status: 429 });
      }
    }

    // Log request
    await logProxyRequest({
      timestamp: new Date().toISOString(),
      ip,
      url: targetUrl,
      status: response.status,
      bytes: contentLength,
      userAgent,
      referer: referer || "",
      duration,
    });

    return new Response(buffer, {
      status: response.status,
      headers: newHeaders,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response("❌ Proxy error: " + message, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
