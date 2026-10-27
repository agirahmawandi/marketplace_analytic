import { NextRequest, NextResponse } from 'next/server';
import { getSearchSessionById, deleteSearchSession } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessionId = parseInt(id, 10);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'ID tidak valid' }, { status: 400 });
    }

    const session = getSearchSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Sesi pencarian tidak ditemukan' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessionId = parseInt(id, 10);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'ID tidak valid' }, { status: 400 });
    }

    const deleted = deleteSearchSession(sessionId);
    return NextResponse.json({ success: deleted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
