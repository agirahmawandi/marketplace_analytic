import { NextRequest, NextResponse } from 'next/server';
import { MarketplaceId } from '@/types/marketplace';
import { runMarketplaceScrape } from '@/lib/scraper-engine';
import { saveSearchSession } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const keyword = String(body.keyword || '').trim();
    if (!keyword) {
      return NextResponse.json(
        { error: 'Kata kunci pencarian tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const validMps: MarketplaceId[] = ['tokopedia', 'shopee', 'blibli'];
    const marketplaces: MarketplaceId[] = Array.isArray(body.marketplaces)
      ? body.marketplaces.filter((m: string) => validMps.includes(m as MarketplaceId))
      : validMps;

    if (marketplaces.length === 0) {
      return NextResponse.json(
        { error: 'Pilih minimal satu marketplace (Tokopedia, Shopee, atau Blibli).' },
        { status: 400 }
      );
    }

    const locationRaw = String(body.location || '').trim();
    const location =
      locationRaw && locationRaw.toLowerCase() !== 'all' ? locationRaw : undefined;

    const limitPerMarketplace = Math.min(
      Math.max(Number(body.limitPerMarketplace) || 10, 5),
      50
    );

    const { products, sourceNotes } = await runMarketplaceScrape(
      keyword,
      marketplaces,
      limitPerMarketplace,
      location
    );

    const sessionLabel = location ? `${keyword} (${location})` : keyword;

    const session = saveSearchSession(
      sessionLabel,
      marketplaces,
      products,
      sourceNotes.join(' | ')
    );

    return NextResponse.json({
      success: true,
      session,
      sourceNotes,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Terjadi kesalahan saat menganalisa produk: ${msg}` },
      { status: 500 }
    );
  }
}
