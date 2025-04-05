// TypeScript - Edge Compatible Proxy API
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response("❌ Missing 'url' query parameter", { status: 400 });
    }

    const range = req.headers.get("range");
    const userAgent = req.headers.get("user-agent") ?? "";
    const referer = targetUrl;

    const forwardedHeaders: HeadersInit = {
      "User-Agent": userAgent,
      "Referer": referer,
    };

    if (range) {
      forwardedHeaders["Range"] = range;
    }

    const targetRes = await fetch(targetUrl, {
      method: "GET",
      headers: forwardedHeaders,
    });

    // Extract key headers to preserve streaming & file integrity
    const passHeaders = [
      "content-type",
      "content-length",
      "content-disposition",
      "content-range",
      "accept-ranges",
      "cache-control",
      "last-modified",
      "etag",
    ];

    const newHeaders = new Headers();

    for (const h of passHeaders) {
      const val = targetRes.headers.get(h);
      if (val) {
        newHeaders.set(h, val);
      }
    }

    // Append universal CORS & Access headers
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "*");
    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

    // Stream the body directly
    return new Response(targetRes.body, {
      status: targetRes.status,
      headers: newHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response("❌ Proxy Error: " + msg, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response("🟢 Proxy OPTIONS OK", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
