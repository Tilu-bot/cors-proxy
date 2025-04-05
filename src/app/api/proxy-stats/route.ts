import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Verify admin token - for production, use a more secure method
function isValidToken(token: string | null): boolean {
  // In production, use environment variables for secrets
  return token === 'admin123';
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  
  if (!isValidToken(token ?? null)) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const timeframe = searchParams.get('timeframe') || '24h';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '50');
  const status = searchParams.get('status');
  const ip = searchParams.get('ip');
  
  try {
    // Build the SQL WHERE clause based on filters
    let whereClause = '';
    const params: Array<string | number> = [];
    
    // Timeframe filter
    if (timeframe === '24h') {
      whereClause += 'timestamp > NOW() - INTERVAL \'24 hours\'';
    } else if (timeframe === '7d') {
      whereClause += 'timestamp > NOW() - INTERVAL \'7 days\'';
    } else {
      whereClause += 'timestamp > TO_TIMESTAMP(0)'; // all time
    }
    
    // Status filter
    if (status) {
      params.push(parseInt(status));
      whereClause += ' AND status = $' + params.length;
    }
    
    // IP filter
    if (ip) {
      params.push(`%${ip}%`);
      whereClause += ' AND ip LIKE $' + params.length;
    }
    
    // Query for logs with pagination
    const offset = (page - 1) * pageSize;
    params.push(pageSize);
    params.push(offset);
    
    const logsQuery = `
      SELECT timestamp, ip, url, status, bytes, user_agent as "userAgent", referer, duration 
      FROM proxy_logs 
      WHERE ${whereClause} 
      ORDER BY timestamp DESC 
      LIMIT $${params.length - 1} 
      OFFSET $${params.length}
    `;
    
    // Query for total count
    const countQuery = `
      SELECT COUNT(*) as total FROM proxy_logs WHERE ${whereClause}
    `;
    
    // Query for statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as "totalRequests",
        SUM(bytes) as "totalBytes",
        COUNT(CASE WHEN status >= 200 AND status < 300 THEN 1 END) as "successfulRequests",
        COUNT(CASE WHEN status >= 400 THEN 1 END) as "failedRequests",
        AVG(duration) as "avgResponseTime"
      FROM proxy_logs 
      WHERE ${whereClause}
    `;
    
    // Execute all queries
    const [logsResult, countResult, statsResult] = await Promise.all([
      pool.query(logsQuery, params),
      pool.query(countQuery, params.slice(0, params.length - 2)), // exclude limit and offset
      pool.query(statsQuery, params.slice(0, params.length - 2))  // exclude limit and offset
    ]);
    
    // Use only real database data
    const logs = logsResult.rows || [];
    const total = parseInt(countResult.rows[0]?.total || '0');
    const stats = statsResult.rows[0] || {
      totalRequests: 0,
      totalBytes: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0
    };
    
    // Calculate success rate
    const successRate = stats.totalRequests > 0 
      ? Math.round((stats.successfulRequests / stats.totalRequests) * 100) 
      : 100;
    
    // Format the response
    const response = {
      stats: {
        totalRequests: parseInt(stats.totalRequests),
        totalBytes: parseInt(stats.totalBytes) || 0,
        bytesFormatted: formatBytes(parseInt(stats.totalBytes) || 0),
        successfulRequests: parseInt(stats.successfulRequests),
        failedRequests: parseInt(stats.failedRequests),
        successRate,
        avgResponseTime: Math.round(parseFloat(stats.avgResponseTime) || 0)
      },
      logs,
      pagination: {
        page,
        pageSize,
        total
      }
    };
    
    return new NextResponse(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return new NextResponse(JSON.stringify({ error: 'Database error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper function for formatting bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}