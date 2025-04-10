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
    // Function to fetch stats from the API
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

    // Initial fetch on component mount
    fetchStats();

    // Polling every 30 seconds to update stats
    const intervalId = setInterval(fetchStats, 30000); // 30 seconds

    // Cleanup function to clear the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, []);

  if (loading || !stats) {
    return <div className="loading-text">Fetching stats...</div>;
  }

  return (
    <div className="dashboard-grid">
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
    <div className="stat-card">
      <h3 className="stat-title">{title}</h3>
      {circle ? (
        <div className="circle-container">
          <svg className="circle-svg" viewBox="0 0 100 100">
            <circle className="circle-background" cx="50" cy="50" r="45" />
            <circle
              className={`circle-progress ${color}`}
              cx="50"
              cy="50"
              r="45"
              strokeDasharray="283"
              strokeDashoffset={283 - (progress / 100) * 283}
            />
          </svg>
          <div className="circle-value">{value}</div>
        </div>
      ) : (
        <p className="stat-value">{value}</p>
      )}
    </div>
  );
}
