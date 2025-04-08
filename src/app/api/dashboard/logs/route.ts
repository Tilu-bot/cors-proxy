import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  try {
    const result = await pool.query(`SELECT * FROM proxy_logs ORDER BY timestamp DESC LIMIT 100`);
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('[Dashboard API Error]', err);
    return new NextResponse('Failed to fetch logs', { status: 500 });
  }
}
