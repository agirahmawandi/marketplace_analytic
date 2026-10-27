import { NextResponse } from 'next/server';
import { getSearchSessions, getSearchSessionById } from '@/lib/db';

export async function GET() {
  try {
    const sessions = getSearchSessions();
    const latestSession =
      sessions.length > 0 ? getSearchSessionById(sessions[0].id) : null;

    return NextResponse.json({
      sessions,
      latestSession,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Gagal memuat riwayat pencarian: ${msg}` },
      { status: 500 }
    );
  }
}
