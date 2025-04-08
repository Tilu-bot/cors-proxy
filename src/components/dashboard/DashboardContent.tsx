'use client';

import { useEffect, useState } from 'react';

export default function DashboardContent() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`/api/proxy/logs?timeframe=24h&page=1&pageSize=50`, {
        headers: {
          Authorization: 'Bearer admin123'
        }
      });

      if (!res.ok) throw new Error('Failed to load dashboard data');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) return <div>Loading dashboard...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  const { stats, logs, pagination } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Total Requests" value={stats.totalRequests} />
        <StatCard label="Success Rate" value={`${stats.successRate}%`} />
        <StatCard label="Total Data" value={stats.bytesFormatted} />
        <StatCard label="Avg Response Time" value={`${stats.avgResponseTime} ms`} />
        <StatCard label="Success" value={stats.successfulRequests} />
        <StatCard label="Failed" value={stats.failedRequests} />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="border px-2 py-1">Time</th>
              <th className="border px-2 py-1">IP</th>
              <th className="border px-2 py-1">Status</th>
              <th className="border px-2 py-1">URL</th>
              <th className="border px-2 py-1">Bytes</th>
              <th className="border px-2 py-1">Duration</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: any, index: number) => (
              <tr key={index} className="hover:bg-gray-100">
                <td className="border px-2 py-1">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="border px-2 py-1">{log.ip}</td>
                <td className="border px-2 py-1">{log.status}</td>
                <td className="border px-2 py-1 truncate max-w-xs">{log.url}</td>
                <td className="border px-2 py-1">{log.bytes}</td>
                <td className="border px-2 py-1">{log.duration} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-sm text-gray-600">
          Showing page {pagination.page} of {Math.ceil(pagination.total / pagination.pageSize)}
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="p-4 bg-white rounded-lg shadow text-center">
      <div className="text-lg font-semibold">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
