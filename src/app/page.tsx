export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
      <h1 className="text-5xl font-extrabold mb-6 text-center glow">CORS Proxy Service</h1>
      <p className="text-lg mb-6 text-center max-w-lg">
        Use this service to proxy requests to APIs that don&apos;t support CORS, enabling seamless data fetching from restricted APIs.
      </p>
      <p className="text-md text-gray-200 mb-6">
        Example usage: <code className="bg-black px-2 py-1 rounded text-sm">/api/proxy?url=https://api.example.com/data</code>
      </p>
      <div className="text-center">
        <button className="bg-gradient-to-r from-green-400 to-blue-500 text-white py-2 px-6 rounded-full shadow-xl hover:scale-105 transition transform">
          Get Started
        </button>
      </div>
    </main>
  );
}

