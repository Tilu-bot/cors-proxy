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
    return <div className="text-center text-purple-300 animate-pulse">✨ Fetching stats from the cosmos...</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard title="Requests/Min" value={stats.totalRequestsPerMin} color="from-cyan-500 to-blue-500" />
      <StatCard title="Success Rate" value={stats.successRate} circle progress={stats.successRate} color="from-green-400 to-lime-400" />
      <StatCard title="Error Rate" value={stats.errorRate} circle progress={stats.errorRate} color="from-rose-400 to-pink-500" />
      <StatCard title="Avg Response Time" value={stats.avgResponseTime + ' ms'} color="from-purple-500 to-indigo-500" />
    </div>
  );
}

function StatCard({
  title,
  value,
  circle = false,
  progress = 0,
  color = 'from-blue-500 to-indigo-500',
}: {
  title: string;
  value: string | number;
  circle?: boolean;
  progress?: number;
  color?: string;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (typeof value === 'number') {
      let current = 0;
      const target = value;
      const increment = target / 60; // To make the progress bar smooth
      const interval = setInterval(() => {
        current += increment;
        if (current >= target) {
          current = target;
          clearInterval(interval);
        }
        setCount(Math.round(current));
      }, 15);
      return () => clearInterval(interval);
    }
  }, [value]);

  return (
    <div
      className={`bg-gradient-to-br ${color} text-white rounded-lg p-6 text-center shadow-lg transform transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:ring-2 hover:ring-purple-400`}
    >
      <h3 className="text-md font-medium mb-2 tracking-wide uppercase">{title}</h3>
      {circle ? (
        <div className="relative flex justify-center items-center h-24">
          {/* Outer Ring (circle animation) */}
          <svg className="w-24 h-24 animate-spin-slow absolute opacity-20" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" stroke="#fff" strokeWidth="10" fill="none" opacity="0.1" />
          </svg>
          {/* Inner Progress Circle */}
          <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.2)" strokeWidth="10" fill="none" />
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="white"
              strokeWidth="10"
              strokeDasharray="283"
              strokeDashoffset={283 - (progress / 100) * 283}
              fill="none"
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute text-xl font-bold drop-shadow-lg">{`${count}%`}</div>
        </div>
      ) : (
        <div className="relative">
          <div
            className="h-2 w-full bg-gray-200 rounded-full relative overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          >
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-400 to-lime-400"
              style={{
                width: `${progress}%`,
                transition: 'width 1s ease-out',
              }}
            ></div>
          </div>
          <p className="text-3xl font-bold drop-shadow mt-3">{count}</p>
        </div>
      )}
    </div>
  );
}
