import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const proxyRes = await pool.query(`DELETE FROM proxy_logs WHERE timestamp < NOW() - INTERVAL '15 days'`);
    const imageRes = await pool.query(`DELETE FROM image_logs WHERE timestamp < NOW() - INTERVAL '15 days'`);

    return NextResponse.json({
      message: 'Old logs pruned successfully',
      deleted: {
        proxy_logs: proxyRes.rowCount,
        image_logs: imageRes.rowCount,
      }
    });
  } catch (err) {
    console.error('[Prune Error]', err);
    return NextResponse.json({ error: 'Pruning failed' }, { status: 500 });
  }
}
