export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response("❌ Missing 'url' query parameter", { status: 400 });
    }

    if (!/^https?:\/\//.test(targetUrl) || !/\.(m3u8|ts|mp4|m4s|webm|mp3|aac)(\?|$)/.test(targetUrl)) {
      return new Response("❌ Invalid or unsupported media URL", { status: 403 });
    }

    const range = req.headers.get("range");
    const userAgent = req.headers.get("user-agent") ?? "";
    const referer = targetUrl;

    const forwardedHeaders: HeadersInit = {
      "User-Agent": userAgent,
      "Referer": referer,
    };

    if (range) forwardedHeaders["Range"] = range;

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: forwardedHeaders,
    });

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

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response("❌ Proxy error: " + message, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response("✅ Proxy OK", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
