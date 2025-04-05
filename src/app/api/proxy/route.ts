export async function GET(req: Request) {
    try {
      const { searchParams } = new URL(req.url);
      const target = searchParams.get("url");
  
      if (!target) {
        return new Response("❌ Missing 'url' query parameter", { status: 400 });
      }
  
      const response = await fetch(target, {
        headers: {
          "User-Agent": req.headers.get("user-agent") ?? "",
          "Referer": target,
        },
      });
  
      const contentType = response.headers.get("content-type") ?? "text/plain";
  
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return new Response("❌ Proxy Error: " + errorMessage, { status: 500 });
    }
  }
  
  export async function OPTIONS() {
    return new Response("OK", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }
  