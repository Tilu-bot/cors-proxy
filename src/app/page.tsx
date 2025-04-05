export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">CORS Proxy Service</h1>
      <p className="mb-4">
        Use this service to proxy requests to APIs that don&apos;t support CORS.
      </p>
      <p className="text-sm text-gray-500">
        Example usage: <code>/api/proxy?url=https://api.example.com/data</code>
      </p>
    </main>
  );
}
