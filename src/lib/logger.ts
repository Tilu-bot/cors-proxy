import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

// Define the ProxyLog interface
export interface ProxyLog {
  timestamp: string;
  ip: string;
  url: string;
  status: number;
  bytes: number;
  userAgent: string;
  referer: string;
  duration: number;
}

// Initialize Redis client with Vercel-provided env variables
const redis = Redis.fromEnv();

// Keys for Redis
const LOG_LIST_KEY = 'proxy:logs';
const STATS_HASH_KEY = 'proxy:stats';
const MAX_LOGS = 10000; // Maximum logs to keep in Redis

/**
 * Log a proxy request to Redis
 */
export async function logProxyRequest(data: ProxyLog): Promise<void> {
  try {
    // Store log as JSON string
    const logData = JSON.stringify(data);
    
    // Use a transaction to perform multiple operations
    await redis.pipeline()
      // Add log to the beginning of the list (newest first)
      .lpush(LOG_LIST_KEY, logData)
      // Trim list to prevent it from growing too large
      .ltrim(LOG_LIST_KEY, 0, MAX_LOGS - 1)
      .exec();
    
    // Increment counters for stats
    const today = new Date().toISOString().split('T')[0];
    const isSuccess = data.status >= 200 && data.status < 400;
    
    await redis.pipeline()
      // Increment total requests for today
      .hincrby(`${STATS_HASH_KEY}:${today}`, 'totalRequests', 1)
      // Add bytes transferred
      .hincrby(`${STATS_HASH_KEY}:${today}`, 'totalBytes', data.bytes)
      // Increment success/failure counters
      .hincrby(`${STATS_HASH_KEY}:${today}`, isSuccess ? 'successfulRequests' : 'failedRequests', 1)
      // Add to total duration for average calculation
      .hincrby(`${STATS_HASH_KEY}:${today}`, 'totalDuration', data.duration)
      // Set expiry on daily stats (30 days)
      .expire(`${STATS_HASH_KEY}:${today}`, 60 * 60 * 24 * 30)
      .exec();
    
    // Optional: Send to external logging service
    if (process.env.LOG_ENDPOINT) {
      try {
        await fetch(process.env.LOG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } catch (err) {
        console.error('Failed to send log to external service:', err);
      }
    }
  } catch (err) {
    console.error('Failed to save log to Redis:', err);
  }
}

/**
 * Fetch proxy logs with pagination and filters
 */
export async function fetchProxyLogs(
  timeframe: string,
  page: number,
  pageSize: number,
  statusFilter?: string,
  ipFilter?: string
) {
  try {
    // Get total count of logs (for pagination)
    const totalLogs = await redis.llen(LOG_LIST_KEY);
    
    // Get logs for the current page
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize - 1;
    
    // Get logs from Redis (LRANGE is inclusive of end index)
    const rawLogs = await redis.lrange(LOG_LIST_KEY, startIndex, endIndex);
    
    // Parse and filter logs
    let logs = rawLogs.map(log => JSON.parse(log) as ProxyLog);
    
    // Apply time filter
    if (timeframe !== 'all') {
      const cutoffDate = new Date();
      if (timeframe === '24h') {
        cutoffDate.setDate(cutoffDate.getDate() - 1);
      } else if (timeframe === '7d') {
        cutoffDate.setDate(cutoffDate.getDate() - 7);
      }
      
      logs = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
    }
    
    // Apply status filter if provided
    if (statusFilter) {
      logs = logs.filter(log => log.status.toString() === statusFilter);
    }
    
    // Apply IP filter if provided
    if (ipFilter) {
      logs = logs.filter(log => log.ip === ipFilter);
    }
    
    return {
      logs,
      total: totalLogs // This is an approximation since we filter after fetching
    };
  } catch (err) {
    console.error('Failed to fetch logs from Redis:', err);
    return { logs: [], total: 0 };
  }
}

/**
 * Get proxy statistics
 */
export async function getProxyStats(timeframe: string) {
  try {
    // Determine how many days to look back
    const daysToLookBack = timeframe === '24h' ? 1 : 
                          timeframe === '7d' ? 7 : 
                          timeframe === 'all' ? 30 : 1;
    
    // Initialize counters
    let totalRequests = 0;
    let totalBytes = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalDuration = 0;
    
    // Generate array of days to query
    const days = [];
    for (let i = 0; i < daysToLookBack; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    
    // Get stats for each day
    for (const day of days) {
      const stats = await redis.hgetall(`${STATS_HASH_KEY}:${day}`) as Record<string, string>;
      
      if (stats) {
        totalRequests += parseInt(stats.totalRequests || '0', 10);
        totalBytes += parseInt(stats.totalBytes || '0', 10);
        successfulRequests += parseInt(stats.successfulRequests || '0', 10);
        failedRequests += parseInt(stats.failedRequests || '0', 10);
        totalDuration += parseInt(stats.totalDuration || '0', 10);
      }
    }
    
    return {
      totalRequests,
      totalBytes,
      bytesFormatted: formatBytes(totalBytes),
      successfulRequests,
      failedRequests, 
      successRate: totalRequests ? Math.round((successfulRequests / totalRequests) * 100) : 0,
      avgResponseTime: totalRequests ? Math.round((totalDuration / totalRequests) * 100) / 100 : 0
    };
  } catch (err) {
    console.error('Failed to get stats from Redis:', err);
    return {
      totalRequests: 0,
      totalBytes: 0,
      bytesFormatted: '0 B',
      successfulRequests: 0,
      failedRequests: 0,
      successRate: 0,
      avgResponseTime: 0
    };
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Handle GET request for proxy stats and logs
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get('timeframe') || '24h';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const statusFilter = searchParams.get('statusFilter') || undefined;
    const ipFilter = searchParams.get('ipFilter') || undefined;
    
    // Check authentication with admin token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const stats = await getProxyStats(timeframe);
    const logsData = await fetchProxyLogs(timeframe, page, pageSize, statusFilter, ipFilter);
    
    return new Response(JSON.stringify({
      stats,
      logs: logsData.logs,
      pagination: {
        page,
        pageSize,
        total: logsData.total
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to get stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}