'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Define interfaces for strongly typed data
interface ProxyLog {
  timestamp: string;
  ip: string;
  url: string;
  status: number;
  bytes: number;
  userAgent: string;
  referer: string;
  duration: number;
}

interface ProxyStats {
  totalRequests: number;
  totalBytes: number;
  bytesFormatted: string;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  avgResponseTime: number;
}

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export default function ProxyDashboard() {
  const [stats, setStats] = useState<ProxyStats | null>(null);
  const [logs, setLogs] = useState<ProxyLog[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 50, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const timeframe = searchParams.get('timeframe') || '24h';
  const page = parseInt(searchParams.get('page') || '1');
  const status = searchParams.get('status');
  const ip = searchParams.get('ip');
  
  const fetchStats = useCallback(async (currentToken: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        timeframe,
        page: page.toString(),
        pageSize: '50'
      });
      
      if (status) params.append('status', status);
      if (ip) params.append('ip', ip);
      
      const res = await fetch(`/api/proxy-stats?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      setStats(data.stats);
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [timeframe, page, status, ip]);
  
  useEffect(() => {
    // Load token from localStorage 
    const savedToken = localStorage.getItem('admin_token') || '';
    setToken(savedToken);
    
    if (savedToken) {
      fetchStats(savedToken);
    }
  }, [timeframe, page, status, ip, fetchStats]);
  
  const handleTokenSave = () => {
    localStorage.setItem('admin_token', token);
    fetchStats(token);
  };
  
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    router.push(`?${params.toString()}`);
  };
  
  const handleTimeframeChange = (newTimeframe: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('timeframe', newTimeframe);
    params.delete('page'); // Reset to page 1
    router.push(`?${params.toString()}`);
  };
  
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">CORS Proxy Dashboard</h1>
      
      {!localStorage.getItem('admin_token') && (
        <div className="mb-6 p-4 bg-gray-100 rounded">
          <h2 className="text-lg font-semibold mb-2">Admin Authentication</h2>
          <div className="flex gap-2">
            <input 
              type="password" 
              value={token} 
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter admin token" 
              className="border p-2 flex-1"
            />
            <button 
              onClick={handleTokenSave}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Save
            </button>
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="mb-6">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleTimeframeChange('24h')}
            className={`px-3 py-1 rounded ${timeframe === '24h' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Last 24 Hours
          </button>
          <button
            onClick={() => handleTimeframeChange('7d')}
            className={`px-3 py-1 rounded ${timeframe === '7d' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handleTimeframeChange('all')}
            className={`px-3 py-1 rounded ${timeframe === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            All Time
          </button>
        </div>
      </div>
      
      {stats && (
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded shadow">
            <h3 className="text-sm text-gray-500">Total Requests</h3>
            <p className="text-2xl font-bold">{stats.totalRequests}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <h3 className="text-sm text-gray-500">Total Bandwidth</h3>
            <p className="text-2xl font-bold">{stats.bytesFormatted}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <h3 className="text-sm text-gray-500">Success Rate</h3>
            <p className="text-2xl font-bold">{stats.successRate}%</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <h3 className="text-sm text-gray-500">Avg Response Time</h3>
            <p className="text-2xl font-bold">{stats.avgResponseTime} ms</p>
          </div>
        </div>
      )}
      
      <h2 className="text-xl font-bold mb-4">Request Logs</h2>
      
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">Time</th>
                  <th className="border p-2 text-left">IP</th>
                  <th className="border p-2 text-left">URL</th>
                  <th className="border p-2 text-left">Status</th>
                  <th className="border p-2 text-left">Size</th>
                  <th className="border p-2 text-left">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                    <td className="border p-2">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="border p-2">{log.ip}</td>
                    <td className="border p-2 truncate max-w-[200px]">{log.url}</td>
                    <td className="border p-2">
                      <span className={`px-2 py-1 rounded text-white ${
                        log.status >= 200 && log.status < 300 ? 'bg-green-500' :
                        log.status >= 400 && log.status < 500 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="border p-2">{formatBytes(log.bytes)}</td>
                    <td className="border p-2">{log.duration} ms</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border p-4 text-center text-gray-500">
                      No logs found for the selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {pagination.total > pagination.pageSize && (
            <div className="flex justify-between items-center">
              <p>Showing {((page - 1) * pagination.pageSize) + 1} to {Math.min(page * pagination.pageSize, pagination.total)} of {pagination.total} logs</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className={`px-3 py-1 rounded ${page === 1 ? 'bg-gray-200' : 'bg-blue-500 text-white'}`}
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page * pagination.pageSize >= pagination.total}
                  className={`px-3 py-1 rounded ${page * pagination.pageSize >= pagination.total ? 'bg-gray-200' : 'bg-blue-500 text-white'}`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Helper function for formatting bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}