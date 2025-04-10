'use client';

import { useEffect, useState } from 'react';

interface DashboardStats {
  totalRequestsPerMin: number;
  successRate: number;
  errorRate: number;
  avgResponseTime: number;
}

export default function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/proxy-stats', {
          headers: {
            Authorization: 'Bearer admin123',
          },
        });

        if (!res.ok) throw new Error('Failed to fetch stats');

        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading || !stats) {
    return <div className="text-center text-gray-500">Fetching stats...</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard title="Requests/Min" value={stats.totalRequestsPerMin} />
      <StatCard
        title="Success Rate"
        value={`${stats.successRate}%`}
        circle
        progress={stats.successRate}
        color="green"
      />
      <StatCard
        title="Error Rate"
        value={`${stats.errorRate}%`}
        circle
        progress={stats.errorRate}
        color="red"
      />
      <StatCard title="Avg Response Time" value={`${stats.avgResponseTime} ms`} />
    </div>
  );
}

function StatCard({
  title,
  value,
  circle = false,
  progress = 0,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  circle?: boolean;
  progress?: number;
  color?: 'blue' | 'green' | 'red';
}) {
  return (
    <div className="bg-white shadow rounded-lg p-6 text-center">
      <h3 className="text-md font-semibold mb-2">{title}</h3>
      {circle ? (
        <div className="flex justify-center items-center h-24 relative">
          <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" stroke="#e5e7eb" strokeWidth="10" fill="none" />
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke={
                color === 'green'
                  ? '#10b981'
                  : color === 'red'
                  ? '#ef4444'
                  : '#3b82f6'
              }
              strokeWidth="10"
              strokeDasharray="283"
              strokeDashoffset={283 - (progress / 100) * 283}
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute text-xl font-bold">{value}</div>
        </div>
      ) : (
        <p className="text-2xl font-bold">{value}</p>
      )}
    </div>
  );
}
