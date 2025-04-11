'use client';

import { useEffect, useState } from 'react';

interface DashboardStats {
  totalRequestsPerMin: number;
  successRate: number;
  errorRate: number;
  avgResponseTime: number;
}

interface DetailedLog {
  id: number;
  type: string;
  url?: string;
  duration?: number;
  status?: number;
  bytes?: number;
  cache_status?: string;
  sanitized?: boolean;
  timestamp: string;
}

export default function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [popupData, setPopupData] = useState<DetailedLog[]>([]);
  const [popupTitle, setPopupTitle] = useState('');
  const [showPopup, setShowPopup] = useState(false);

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
    const intervalId = setInterval(fetchStats, 30000);
    return () => clearInterval(intervalId);
  }, []);

  async function handleBoxClick(type: string, title: string) {
    try {
      const res = await fetch(`/api/stats/details?type=${type}`, {
        headers: { Authorization: 'Bearer admin123' },
      });
      const data = await res.json();
      setPopupData(data);
      setPopupTitle(title);
      setShowPopup(true);
    } catch (err) {
      console.error('Failed to fetch detail logs:', err);
    }
  }

  if (loading || !stats) {
    return <div className="loading-text">Fetching stats...</div>;
  }

  return (
    <>
      <div className="dashboard-grid">
        <StatCard title="Requests/Min" value={stats.totalRequestsPerMin} onClick={() => handleBoxClick('incoming', 'Incoming Requests')} />
        <StatCard title="Success Rate" value={`${stats.successRate}%`} circle progress={stats.successRate} color="green" onClick={() => handleBoxClick('success', 'Success Logs')} />
        <StatCard title="Error Rate" value={`${stats.errorRate}%`} circle progress={stats.errorRate} color="red" onClick={() => handleBoxClick('error', 'Error Logs')} />
        <StatCard title="Avg Response Time" value={`${stats.avgResponseTime} ms`} onClick={() => handleBoxClick('avg', 'Highest Response Times')} />
        <StatCard title="Outgoing" value="Tap to view" onClick={() => handleBoxClick('outgoing', 'Outgoing Requests')} />
        <StatCard title="Edge Cached" value="Tap to view" onClick={() => handleBoxClick('cache', 'Edge Cache Hits')} />
      </div>

      {showPopup && (
        <div className="popup-overlay">
          <div className="popup">
            <h2>{popupTitle}</h2>
            <button onClick={() => setShowPopup(false)}>Close</button>
            <div className="popup-content">
              {popupData.length === 0 && <p>No data found.</p>}
              {popupData.map((item) => (
                <div key={item.id} className="log-entry">
                  <code>#{item.id}</code> — <b>{item.type}</b> — {item.url?.slice(0, 60) || 'N/A'}
                  <div className="sub-details">
                    {item.status && <span>Status: {item.status}</span>}
                    {item.duration && <span>Time: {item.duration}ms</span>}
                    {item.sanitized !== undefined && <span>Sanitized: {item.sanitized ? 'Yes' : 'No'}</span>}
                    {item.cache_status && <span>Cache: {item.cache_status}</span>}
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({
  title,
  value,
  circle = false,
  progress = 0,
  color = 'blue',
  onClick,
}: {
  title: string;
  value: string | number;
  circle?: boolean;
  progress?: number;
  color?: 'blue' | 'green' | 'red';
  onClick?: () => void;
}) {
  return (
    <div className="stat-card glow" onClick={onClick} style={{ cursor: 'pointer' }}>
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
