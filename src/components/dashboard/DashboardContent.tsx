'use client';

import { useEffect, useState } from 'react';

type PopupType = 'incoming' | 'success' | 'error' | 'avg' | 'outgoing' | 'cache' | 'edge';

interface DetailedLog {
  id: number;
  type: string;
  url?: string;
  duration?: number;
  status?: number;
  bytes?: number;
  cache_status?: boolean;
  sanitized?: boolean;
  timestamp: string;
}

interface DashboardStats {
  totalRequestsPerMin: number;
  successPerMin: number;
  errorPerMin: number;
  outgoingPerMin: number;
  edgeHitsPerMin: number;
  avgResponseTime: number;
  avgSpeedPerMin: number;
  maxResponseTime: number;
  edgeActiveCount: number;
  incomingCount: number;
  outgoingCount: number;
  successLogs: DetailedLog[];
  errorLogs: DetailedLog[];
  incomingLogs: DetailedLog[];
  outgoingLogs: DetailedLog[];
  cacheLogs: DetailedLog[];
  slowestLogs: DetailedLog[];
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
          headers: { Authorization: 'Bearer admin123' },
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
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleBoxClick = (type: PopupType, title: string) => {
    if (!stats) return;
    const map: Record<PopupType, DetailedLog[]> = {
      incoming: stats.incomingLogs,
      success: stats.successLogs,
      error: stats.errorLogs,
      outgoing: stats.outgoingLogs,
      cache: stats.cacheLogs,
      avg: stats.slowestLogs,
      edge: stats.cacheLogs,
    };
    setPopupTitle(title);
    setPopupData(map[type] || []);
    setShowPopup(true);
  };

  if (loading || !stats) {
    return <div className="loading-text">Fetching stats...</div>;
  }

  return (
    <>
      <div className="dashboard-grid">
        <StatCard
          title="Requests/Min"
          value={stats.totalRequestsPerMin}
          circle
          progress={Math.min((stats.totalRequestsPerMin / 200) * 100, 100)}
          color="blue"
          onClick={() => handleBoxClick('incoming', 'Incoming Requests')}
        />
        <StatCard
          title="Success/Min"
          value={stats.successPerMin}
          circle
          progress={Math.min((stats.successPerMin / 200) * 100, 100)}
          color="green"
          onClick={() => handleBoxClick('success', 'Success Logs')}
        />
        <StatCard
          title="Errors/Min"
          value={stats.errorPerMin}
          circle
          progress={Math.min((stats.errorPerMin / 100) * 100, 100)}
          color="red"
          onClick={() => handleBoxClick('error', 'Error Logs')}
        />
        <StatCard
          title="Avg Time"
          value={`${stats.avgResponseTime} ms`}
          onClick={() => handleBoxClick('avg', 'Slowest Responses')}
        />
        <StatCard
          title="Avg Speed/Min"
          value={`${stats.avgSpeedPerMin} ms`}
          circle
          progress={Math.min((stats.avgSpeedPerMin / 5000) * 100, 100)}
          color={
            stats.avgSpeedPerMin < 1000
              ? 'green'
              : stats.avgSpeedPerMin < 3000
              ? 'blue'
              : 'red'
          }
        />
        <StatCard
          title="Outgoing/Min"
          value={stats.outgoingPerMin}
          circle
          progress={Math.min((stats.outgoingPerMin / 200) * 100, 100)}
          color="blue"
          onClick={() => handleBoxClick('outgoing', 'Outgoing Requests')}
        />
        <StatCard
          title="Edge Hits/Min"
          value={stats.edgeHitsPerMin}
          circle
          progress={Math.min((stats.edgeHitsPerMin / 200) * 100, 100)}
          color="green"
          onClick={() => handleBoxClick('cache', 'Edge Cache Hits')}
        />
        <StatCard
          title="Edge Active"
          value={stats.edgeActiveCount}
          circle
          progress={Math.min((stats.edgeActiveCount / 200) * 100, 100)}
          color="blue"
          onClick={() => handleBoxClick('edge', 'Active Edge Cached Logs')}
        />
      </div>

      {showPopup && (
        <div className="popup-overlay">
          <div className="popup">
            <h2>{popupTitle}</h2>
            <button onClick={() => setShowPopup(false)}>Close</button>
            <div className="popup-content">
              {popupData.length === 0 ? (
                <p>No data found.</p>
              ) : (
                popupData.map((item) => (
                  <div key={item.id} className="log-entry">
                    <code>#{item.id}</code> — <b>{item.type}</b> —{' '}
                    {item.url?.slice(0, 60) || 'N/A'}
                    <div className="sub-details">
                      {item.status !== undefined && <span>Status: {item.status}</span>}
                      {item.duration !== undefined && <span>Time: {item.duration}ms</span>}
                      {item.sanitized !== undefined && (
                        <span>Sanitized: {item.sanitized ? 'Yes' : 'No'}</span>
                      )}
                      {item.cache_status !== undefined && (
                        <span>Edge Cached: {item.cache_status ? 'Yes' : 'No'}</span>
                      )}
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
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
    <div className="stat-card glow" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
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
