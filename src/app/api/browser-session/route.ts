import { NextRequest, NextResponse } from 'next/server';
import {
  openInteractiveBrowserSession,
  checkCdpStatus,
} from '@/lib/scraper-engine';

export async function GET() {
  try {
    const status = await checkCdpStatus();
    return NextResponse.json(status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { connected: false, error: msg },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUrl = body?.targetUrl || 'https://shopee.co.id';
    const result = await openInteractiveBrowserSession(targetUrl);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, connected: false, message: msg },
      { status: 500 }
    );
  }
}
