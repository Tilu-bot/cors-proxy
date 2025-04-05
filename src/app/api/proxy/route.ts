// TypeScript - Edge Compatible Enhanced Proxy API

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
      "Origin": new URL(targetUrl).origin,
    };

    if (range) {
      forwardedHeaders["Range"] = range;
    }

    const targetRes = await fetch(targetUrl, {
      method: "GET",
      headers: forwardedHeaders,
    });

    const contentTypeRaw = targetRes.headers.get("content-type") ?? "";

    // Fix content-type if .m3u8 is wrong
    const finalContentType = targetUrl.includes(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : targetUrl.includes(".ts")
      ? "video/mp2t"
      : contentTypeRaw;

    const newHeaders = new Headers();
    newHeaders.set("Content-Type", finalContentType);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "*");
    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

    // Stream .m3u8 through transformer if needed
    if (targetUrl.includes(".m3u8")) {
      const text = await targetRes.text();

      // Rewrite URLs to go via proxy (handle relative and absolute URLs)
      const base = new URL(targetUrl);
      const transformed = text.replace(
        /^(?!#)(.+)$/gm,
        (line) => {
          try {
            const absoluteUrl = new URL(line, base).toString();
            return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
          } catch {
            return line;
          }
        }
      );

      return new Response(transformed, {
        status: targetRes.status,
        headers: newHeaders,
      });
    }

    // Default: stream body as-is
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

