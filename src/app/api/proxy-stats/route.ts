import { NextRequest } from 'next/server';
import { fetchProxyLogs, getProxyStats } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get('timeframe') || '24h';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const statusFilter = searchParams.get('status') || undefined;
    const ipFilter = searchParams.get('ip') || undefined;
    
    // Check authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const stats = getProxyStats(timeframe);
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
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    // More detailed errors in development
    if (process.env.NODE_ENV !== 'production') {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching proxy stats:', error);
      return new Response(JSON.stringify({ error: errorMessage, stack: error instanceof Error ? error.stack : null }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generic error in production
    return new Response(JSON.stringify({ error: 'Failed to get stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}