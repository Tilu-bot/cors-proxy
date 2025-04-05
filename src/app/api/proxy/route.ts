// TypeScript - Compatible with Vercel/Edge Functions
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response("❌ Missing 'url' parameter", { status: 400 });
    }

    const headers: HeadersInit = {
      "User-Agent": req.headers.get("user-agent") || "",
      "Referer": targetUrl,
    };

    const range = req.headers.get("range");
    if (range) {
      headers["Range"] = range;
    }

    const res = await fetch(targetUrl, {
      headers,
    });

    const responseHeaders = new Headers();
    [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
      "content-disposition",
      "cache-control",
      "etag",
      "last-modified",
    ].forEach(h => {
      const val = res.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    // CORS Headers
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    responseHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });

  } catch (err) {
    return new Response("❌ Proxy failed: " + (err as any).message, { status: 500 });
  }
}

export function OPTIONS() {
  return new Response("🟢 OK", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
