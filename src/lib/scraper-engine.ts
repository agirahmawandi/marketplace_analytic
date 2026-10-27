import path from 'path';
import fs from 'fs';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { MarketplaceId, ProductItem } from '@/types/marketplace';
import {
  parsePrice,
  calculateDiscountPct,
  parseSoldCount,
  normalizeCityName,
  parseRating,
} from '@/lib/parser';

const PROFILE_DIR = path.join(process.cwd(), '.browser-profile');
const CDP_PROFILE_DIR = path.join(process.cwd(), '.chrome-cdp-profile');
const CDP_PORT = 9222;
const CDP_ENDPOINT = `http://127.0.0.1:${CDP_PORT}`;

function ensureDirs() {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
  if (!fs.existsSync(CDP_PROFILE_DIR)) {
    fs.mkdirSync(CDP_PROFILE_DIR, { recursive: true });
  }
}

/**
 * Mengecek apakah Chrome aktif dengan Remote Debugging Port 9222 (CDP)
 */
export async function checkCdpStatus(): Promise<{
  connected: boolean;
  browser?: string;
  endpoint: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${CDP_ENDPOINT}/json/version`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return {
        connected: true,
        browser: data.Browser || 'Google Chrome (CDP)',
        endpoint: CDP_ENDPOINT,
      };
    }
  } catch {
    // Belum berjalan
  }
  return {
    connected: false,
    endpoint: CDP_ENDPOINT,
  };
}

const COMMON_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--window-size=1366,900',
];

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

async function createScraperContext(headless = true): Promise<{
  context: BrowserContext;
  usingCdp: boolean;
  closeAll: () => Promise<void>;
}> {
  ensureDirs();

  // 1. PRIORITAS UTAMA: Hubungkan langsung ke Chrome Aktif milik pengguna via CDP (Port 9222)
  const cdpStatus = await checkCdpStatus();
  if (cdpStatus.connected) {
    try {
      const browser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 20000 });
      const existingContext = browser.contexts()[0] || (await browser.newContext());
      return {
        context: existingContext,
        usingCdp: true,
        closeAll: async () => {
          // Jangan tutup Chrome milik pengguna
        },
      };
    } catch {
      // Jika gagal connect CDP, lanjut ke fallback
    }
  }

  // 2. Fallback: Gunakan Persistent Context dengan Chrome / Edge lokal
  for (const channel of ['chrome', 'msedge'] as const) {
    try {
      const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless,
        channel,
        viewport: { width: 1366, height: 900 },
        userAgent: DEFAULT_UA,
        locale: 'id-ID',
        timezoneId: 'Asia/Jakarta',
        args: COMMON_ARGS,
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      return {
        context,
        usingCdp: false,
        closeAll: async () => {
          await context.close().catch(() => {});
        },
      };
    } catch {
      // Lanjut ke fallback browser instance baru
    }
  }

  // 3. Fallback terakhir: Buka instance browser Chrome / Edge baru
  let browser: Browser | null = null;
  for (const channel of ['chrome', 'msedge', undefined] as const) {
    try {
      browser = await chromium.launch({
        headless,
        channel,
        args: COMMON_ARGS,
      });
      break;
    } catch {
      // Coba channel berikutnya
    }
  }

  if (!browser) {
    throw new Error('Tidak dapat menemukan browser Chrome/Edge/Chromium di sistem.');
  }

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: DEFAULT_UA,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return {
    context,
    usingCdp: false,
    closeAll: async () => {
      await context.close().catch(() => {});
      await browser?.close().catch(() => {});
    },
  };
}

/**
 * Cek apakah nama kota toko cocok dengan filter lokasi yang dipilih pengguna
 */
function matchesLocationFilter(shopCity: string, targetLocation?: string): boolean {
  if (!targetLocation || targetLocation === 'all') return true;
  const cleanTarget = targetLocation
    .toLowerCase()
    .replace(/\b(kota|kab\.?|kabupaten)\b/g, '')
    .trim();
  if (!cleanTarget) return true;

  const cleanShopCity = (shopCity || '')
    .toLowerCase()
    .replace(/\b(kota|kab\.?|kabupaten)\b/g, '')
    .trim();

  if (!cleanShopCity || cleanShopCity === 'tidak diketahui') return false;

  return (
    cleanShopCity.includes(cleanTarget) || cleanTarget.includes(cleanShopCity)
  );
}

/**
 * Membuka tab baru di Chrome CDP jika sudah terhubung, atau memberi petunjuk membuka start-chrome-cdp.bat
 */
export async function openInteractiveBrowserSession(targetUrl?: string): Promise<{
  success: boolean;
  connected: boolean;
  message: string;
}> {
  ensureDirs();
  const urlToOpen = targetUrl || 'https://shopee.co.id';

  try {
    const status = await checkCdpStatus();
    if (status.connected) {
      const res = await fetch(
        `${CDP_ENDPOINT}/json/new?${encodeURI(urlToOpen)}`,
        { method: 'PUT', cache: 'no-store' }
      );
      if (!res.ok) {
        throw new Error(`Chrome menolak membuka tab baru (HTTP ${res.status})`);
      }
      return {
        success: true,
        connected: true,
        message: `Terhubung ke Chrome Aktif (Port 9222)! Tab ${urlToOpen} telah dibuka di Chrome Anda.`,
      };
    }

    return {
      success: false,
      connected: false,
      message:
        'Chrome CDP belum terbuka di layar Anda. Silakan tekan Windows+R lalu jalankan E:\\Project\\Marketplace-analytic\\start-chrome-cdp.bat (atau klik 2x file start-chrome-cdp.bat di File Explorer).',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      connected: false,
      message: `Gagal membuka Chrome CDP: ${msg}`,
    };
  }
}

/**
 * Scrape Tokopedia: Mengambil produk & link produk spesifik langsung (https://www.tokopedia.com/<toko>/<produk>)
 */
async function scrapeTokopediaPage(
  page: Page,
  keyword: string,
  limit: number,
  location?: string
): Promise<ProductItem[]> {
  const results: ProductItem[] = [];
  const now = new Date().toISOString();
  const hasLoc = Boolean(location && location !== 'all');

  try {
    const effectiveQuery = hasLoc ? `${keyword} ${location}` : keyword;
    const searchUrl = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(
      effectiveQuery
    )}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);

    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(900);
    }

    const domItems = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="tokopedia.com/"]'));
      const extracted: Array<{
        url: string;
        img: string;
        lines: string[];
      }> = [];
      const seenUrls = new Set<string>();

      for (const a of anchors) {
        const anchorEl = a as HTMLAnchorElement;
        const rawHref = anchorEl.href || '';
        if (!rawHref) continue;

        let cleanUrl = rawHref;
        try {
          const u = new URL(rawHref);
          if (u.pathname.includes('/promo/')) {
            const rParam = u.searchParams.get('r');
            if (rParam) cleanUrl = rParam.split('?')[0];
          } else {
            cleanUrl = `${u.origin}${u.pathname}`;
          }
        } catch {
          cleanUrl = rawHref.split('?')[0];
        }

        const pathParts = cleanUrl
          .replace(/^https?:\/\/(www\.)?tokopedia\.com\/?/i, '')
          .split('/')
          .filter(Boolean);
        if (
          pathParts.length < 2 ||
          ['search', 'discovery', 'help', 'p', 'find', 'rekomendasi'].includes(
            pathParts[0].toLowerCase()
          )
        ) {
          continue;
        }

        if (seenUrls.has(cleanUrl)) continue;

        const fullText = anchorEl.innerText || anchorEl.textContent || '';
        if (!fullText.includes('Rp')) continue;

        const lines = fullText
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean);
        if (lines.length < 3) continue;

        const imgEl = anchorEl.querySelector('img');
        const img = imgEl ? imgEl.src : '';

        seenUrls.add(cleanUrl);
        extracted.push({
          url: cleanUrl,
          img,
          lines,
        });
      }
      return extracted;
    });

    const allParsed: ProductItem[] = [];

    for (const item of domItems) {
      const lines = item.lines.filter((l) => l.toLowerCase() !== 'ad');
      if (lines.length < 2) continue;

      const productName =
        lines.find((l) => !l.startsWith('Rp') && l.length > 8) || lines[0];

      const priceLines = lines.filter((l) => /Rp\s*\d/i.test(l));
      if (priceLines.length === 0) continue;

      const priceFinal = parsePrice(priceLines[0]);
      if (priceFinal <= 0) continue;

      let rawOrig = priceLines.length > 1 ? parsePrice(priceLines[1]) : priceFinal;
      const discLine =
        lines.find((l) => /^\d{1,2}%$/.test(l) || /diskon\s*\d+%/i.test(l)) || '';

      if (rawOrig <= priceFinal) {
        const priceIdx = lines.indexOf(priceLines[0]);
        if (priceIdx >= 0 && priceIdx + 1 < lines.length) {
          const nextLine = lines[priceIdx + 1];
          if (/^(Rp)?\s*\d{1,3}(\.\d{3})+$/i.test(nextLine)) {
            const candidateOrig = parsePrice(nextLine);
            if (candidateOrig > priceFinal) rawOrig = candidateOrig;
          }
        }
      }

      const { priceOriginal, discountPct } = calculateDiscountPct(
        priceFinal,
        rawOrig,
        discLine
      );

      const soldLine =
        lines.find((l) => l.toLowerCase().includes('terjual')) || '0 terjual';
      const { soldCount, soldTextRaw } = parseSoldCount(soldLine);

      const ratingLine = lines.find((l) => /^[1-5][.,]\d$/.test(l)) || '';
      const rating = parseRating(ratingLine);

      const metaFiltered = lines.filter(
        (l) =>
          l !== productName &&
          !l.includes('Rp') &&
          !/^\d{1,2}%$/.test(l) &&
          !l.toLowerCase().includes('terjual') &&
          !/^[0-5][.,]\d$/.test(l) &&
          !/bisa cod|cashback|grosir|preOrder|dilayani tokopedia/i.test(l)
      );

      const urlParts = item.url
        .replace(/^https?:\/\/(www\.)?tokopedia\.com\/?/i, '')
        .split('/');
      const shopSlug = urlParts[0] || 'toko-tokopedia';

      let shopCity = 'Tidak Diketahui';
      let shopName = shopSlug;

      if (metaFiltered.length >= 2) {
        shopCity = normalizeCityName(metaFiltered[metaFiltered.length - 1]);
        shopName = metaFiltered[metaFiltered.length - 2];
      } else if (metaFiltered.length === 1) {
        shopCity = normalizeCityName(metaFiltered[0]);
      }

      allParsed.push({
        marketplace: 'tokopedia',
        external_id: `tkp-${allParsed.length + 1}`,
        product_name: productName,
        product_url: item.url,
        image_url: item.img,
        shop_name: shopName,
        shop_city: shopCity,
        shop_badge: '',
        price_final: priceFinal,
        price_original: priceOriginal,
        discount_pct: discountPct,
        sold_count: soldCount,
        sold_text_raw: soldTextRaw,
        rating,
        review_count: 0,
        estimated_revenue: priceFinal * soldCount,
        is_live_scraped: true,
        scraped_at: now,
      });
    }

    if (hasLoc) {
      const matched = allParsed.filter((p) =>
        matchesLocationFilter(p.shop_city, location)
      );
      results.push(...matched);
    } else {
      results.push(...allParsed);
    }
  } catch {
    // Ditangani oleh orchestrator
  }

  return results.slice(0, limit);
}

/**
 * Scrape Blibli: Mengambil produk & link produk spesifik langsung dari in-page API (/backend/search/products)
 * maupun fallback DOM (https://www.blibli.com/p/<slug>/ps--...)
 */
async function scrapeBlibliPage(
  page: Page,
  keyword: string,
  limit: number,
  location?: string
): Promise<ProductItem[]> {
  const results: ProductItem[] = [];
  const now = new Date().toISOString();
  const hasLoc = Boolean(location && location !== 'all');

  try {
    const effectiveQuery = hasLoc ? `${keyword} ${location}` : keyword;
    const searchUrl = `https://www.blibli.com/cari/${encodeURIComponent(
      effectiveQuery
    )}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    // 1. Panggil langsung endpoint internal Blibli dari dalam konteks halaman Blibli (sangat cepat & akurat)
    const apiProducts = await page.evaluate(async (q: string) => {
      try {
        const apiUrl = `https://www.blibli.com/backend/search/products?searchTerm=${encodeURIComponent(
          q
        )}&page=1&start=0&merchantSearch=true&multiCategory=true&intent=true&channelId=web`;
        const res = await fetch(apiUrl, { credentials: 'include' });
        if (!res.ok) return [];
        const json = await res.json();
        return json?.data?.products || [];
      } catch {
        return [];
      }
    }, effectiveQuery);

    if (Array.isArray(apiProducts) && apiProducts.length > 0) {
      for (const p of apiProducts) {
        if (results.length >= limit) break;
        const name = p.name || '';
        if (!name) continue;

        const priceFinal = parsePrice(
          p.price?.salePrice || p.price?.minPrice || p.price?.priceDisplay
        );
        if (priceFinal <= 0) continue;

        const rawOrig = parsePrice(
          p.price?.listPrice ||
            p.price?.strikeThroughPriceDisplay ||
            priceFinal
        );
        const { priceOriginal, discountPct } = calculateDiscountPct(
          priceFinal,
          rawOrig,
          p.price?.discount ? `${p.price.discount}%` : ''
        );

        const soldRaw =
          p.soldRangeCount?.id || p.soldRangeCount?.en || p.soldCount || '';
        const { soldCount, soldTextRaw } = parseSoldCount(soldRaw);

        const shopName = p.merchantName || 'Merchant Blibli';
        const shopCity = normalizeCityName(p.location || p.cityName || '');
        if (hasLoc && !matchesLocationFilter(shopCity, location)) {
          continue;
        }

        const rating = parseRating(
          p.review?.rating || p.review?.absoluteRating || 0
        );
        const reviewCount = Number(p.review?.count || 0);

        const rawUrl = p.url || '';
        const cleanPath = rawUrl.split('?')[0];
        const prodUrl = cleanPath
          ? cleanPath.startsWith('http')
            ? cleanPath
            : `https://www.blibli.com${cleanPath}`
          : '';
        if (!prodUrl.includes('/p/')) continue;

        results.push({
          marketplace: 'blibli',
          external_id: String(p.id || p.sku || results.length + 1),
          product_name: name,
          product_url: prodUrl,
          image_url: Array.isArray(p.images) ? p.images[0] : p.image || '',
          shop_name: shopName,
          shop_city: shopCity,
          shop_badge: p.official ? 'Official Store' : '',
          price_final: priceFinal,
          price_original: priceOriginal,
          discount_pct: discountPct,
          sold_count: soldCount,
          sold_text_raw: soldTextRaw,
          rating,
          review_count: reviewCount,
          estimated_revenue: priceFinal * soldCount,
          is_live_scraped: true,
          scraped_at: now,
        });
      }
    }

    // 2. Fallback DOM jika diperlukan
    if (results.length === 0) {
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(900);
      }

      const domItems = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/p/"]'));
        const extracted: Array<{ url: string; img: string; lines: string[] }> = [];
        const seen = new Set<string>();

        for (const a of anchors) {
          const anchorEl = a as HTMLAnchorElement;
          const rawHref = anchorEl.href || '';
          if (!rawHref) continue;

          const cleanUrl = rawHref.split('?')[0];
          if (seen.has(cleanUrl)) continue;

          const text = anchorEl.innerText || anchorEl.textContent || '';
          if (!text.includes('Rp')) continue;

          const lines = text
            .split('\n')
            .map((t) => t.trim())
            .filter(Boolean);
          if (lines.length < 3) continue;

          const img = anchorEl.querySelector('img')?.src || '';
          seen.add(cleanUrl);
          extracted.push({ url: cleanUrl, img, lines });
        }
        return extracted;
      });

      for (const item of domItems) {
        if (results.length >= limit) break;
        const lines = item.lines.filter((l) => l.toLowerCase() !== 'ad');
        if (lines.length < 2) continue;

        const productName =
          lines.find((l) => !l.startsWith('Rp') && l.length > 6) || lines[0];

        const priceLineIdx = lines.findIndex((l) => /Rp\s*\d/i.test(l));
        if (priceLineIdx === -1) continue;

        const priceFinal = parsePrice(lines[priceLineIdx]);
        if (priceFinal <= 0) continue;

        let rawOrig = priceFinal;
        if (priceLineIdx + 1 < lines.length) {
          const nextLine = lines[priceLineIdx + 1];
          if (/^(Rp)?\s*\d{1,3}(\.\d{3})+$/i.test(nextLine)) {
            const parsedNext = parsePrice(nextLine);
            if (parsedNext > priceFinal) rawOrig = parsedNext;
          }
        }

        const discLine = lines.find((l) => /^\d{1,2}%$/.test(l)) || '';
        const { priceOriginal, discountPct } = calculateDiscountPct(
          priceFinal,
          rawOrig,
          discLine
        );

        const soldLine =
          lines.find((l) => l.toLowerCase().includes('terjual')) || '0 terjual';
        const { soldCount, soldTextRaw } = parseSoldCount(soldLine);

        const ratingLine = lines.find((l) => /^[1-5]([.,]\d)?$/.test(l)) || '';
        const rating = parseRating(ratingLine);

        const lastLine = lines[lines.length - 1] || '';
        const secondLastLine =
          lines.length >= 2 ? lines[lines.length - 2] : 'Merchant Blibli';

        const cleanCityRaw = lastLine.replace(/&\s*kota\s*lainnya/gi, '').trim();
        const shopCity = normalizeCityName(cleanCityRaw);
        if (hasLoc && !matchesLocationFilter(shopCity, location)) {
          continue;
        }

        const shopName =
          secondLastLine &&
          !secondLastLine.toLowerCase().includes('terjual') &&
          !secondLastLine.includes('Rp')
            ? secondLastLine
            : 'Merchant Blibli';

        results.push({
          marketplace: 'blibli',
          external_id: `bli-${results.length + 1}`,
          product_name: productName,
          product_url: item.url,
          image_url: item.img,
          shop_name: shopName,
          shop_city: shopCity,
          shop_badge: '',
          price_final: priceFinal,
          price_original: priceOriginal,
          discount_pct: discountPct,
          sold_count: soldCount,
          sold_text_raw: soldTextRaw,
          rating,
          review_count: 0,
          estimated_revenue: priceFinal * soldCount,
          is_live_scraped: true,
          scraped_at: now,
        });
      }
    }
  } catch {
    // Ditangani oleh orchestrator
  }

  return results.slice(0, limit);
}

/**
 * Helper mem-parsing kartu DOM Shopee (menggabungkan baris "Rp" dengan angka di baris berikutnya)
 */
function parseShopeeDomCards(
  rawCards: Array<{ href: string; img: string; lines: string[]; topShopName?: string }>,
  limit: number,
  location?: string
): ProductItem[] {
  const results: ProductItem[] = [];
  const now = new Date().toISOString();
  const hasLoc = Boolean(location && location !== 'all');

  for (const card of rawCards) {
    if (results.length >= limit) break;
    if (!card.href || !/-i\.\d+\.\d+/.test(card.href)) continue;

    const fullUrl = card.href.startsWith('http')
      ? card.href.split('?')[0]
      : `https://shopee.co.id${card.href.split('?')[0]}`;

    if (results.some((r) => r.product_url === fullUrl)) continue;

    // Gabungkan baris yang hanya berisi "Rp" dengan baris angka setelahnya
    const mergedLines: string[] = [];
    for (let i = 0; i < card.lines.length; i++) {
      const cur = card.lines[i];
      if (cur === 'Rp' && i + 1 < card.lines.length) {
        mergedLines.push(`Rp${card.lines[i + 1]}`);
        i++;
      } else {
        mergedLines.push(cur);
      }
    }

    const priceLines = mergedLines.filter((l) => /^Rp\s*\d/i.test(l));
    if (priceLines.length === 0) continue;

    const priceFinal = parsePrice(priceLines[0]);
    if (priceFinal <= 0) continue;

    const rawOrig =
      priceLines.length > 1 ? parsePrice(priceLines[1]) : priceFinal;
    const discLine =
      mergedLines.find((l) => /^-?\d{1,2}%$/.test(l)) || '';
    const { priceOriginal, discountPct } = calculateDiscountPct(
      priceFinal,
      rawOrig,
      discLine
    );

    const soldLine =
      mergedLines.find((l) => l.toLowerCase().includes('terjual')) || '0 terjual';
    const { soldCount, soldTextRaw } = parseSoldCount(soldLine);

    const ratingLine =
      mergedLines.find((l) => /^[1-5][.,]\d$/.test(l)) || '';
    const rating = parseRating(ratingLine);

    // Cari nama produk (baris panjang yang bukan harga / diskon / terjual / badge)
    const productName =
      mergedLines.find(
        (l) =>
          !l.startsWith('Rp') &&
          !/^-?\d{1,2}%$/.test(l) &&
          !l.toLowerCase().includes('terjual') &&
          l.length > 8
      ) || 'Produk Shopee';

    // Baris terakhir pada kartu pencarian utama Shopee adalah Kota Penjual (misal "Jakarta Barat", "Kab. Tangerang")
    const lastLine = mergedLines[mergedLines.length - 1] || '';
    const isLastLineCity =
      lastLine &&
      !lastLine.startsWith('Rp') &&
      !lastLine.toLowerCase().includes('terjual') &&
      !/^-?\d{1,2}%$/.test(lastLine) &&
      !/^[1-5][.,]\d$/.test(lastLine) &&
      lastLine !== productName;

    const shopCity = isLastLineCity
      ? normalizeCityName(lastLine)
      : 'Tidak Diketahui';

    if (hasLoc && !matchesLocationFilter(shopCity, location)) {
      continue;
    }

    // Ekstrak shopId & itemId dari URL -i.<shopId>.<itemId>
    const idMatch = fullUrl.match(/-i\.(\d+)\.(\d+)/);
    const shopId = idMatch ? idMatch[1] : '';
    const itemId = idMatch ? idMatch[2] : `${results.length + 1}`;

    // Cek apakah judul produk mencantumkan "by <NamaToko>"
    const byMatch = productName.match(/\bby\s+([A-Za-z0-9_.\s]{3,25})$/i);
    const shopName = byMatch
      ? byMatch[1].trim()
      : card.topShopName || (shopId ? `Toko Shopee #${shopId.slice(-5)}` : 'Seller Shopee');

    const hasMallBadge = mergedLines.some((l) => /mall|official/i.test(l));
    const hasStarPlus = mergedLines.some((l) => /star\+/i.test(l));

    results.push({
      marketplace: 'shopee',
      external_id: itemId,
      product_name: productName,
      product_url: fullUrl,
      image_url: card.img,
      shop_name: shopName,
      shop_city: shopCity,
      shop_badge: hasMallBadge ? 'Shopee Mall' : hasStarPlus ? 'Star+' : '',
      price_final: priceFinal,
      price_original: priceOriginal,
      discount_pct: discountPct,
      sold_count: soldCount,
      sold_text_raw: soldTextRaw,
      rating,
      review_count: 0,
      estimated_revenue: priceFinal * soldCount,
      is_live_scraped: true,
      scraped_at: now,
    });
  }

  return results;
}

/**
 * Scrape Shopee via Native CDP Tab:
 * Membuka tab via HTTP PUT /json/new terlebih dahulu TANPA debugger terpasang
 * agar anti-bot Shopee tidak memblokir komponen hasil pencarian, lalu membaca DOM setelah produk ter-render.
 */
async function scrapeShopeeNativeCdp(
  keyword: string,
  limit: number,
  location?: string
): Promise<ProductItem[]> {
  const hasLoc = Boolean(location && location !== 'all');
  const locQuery = hasLoc ? `&locations=${encodeURIComponent(location!)}` : '';
  const searchUrl = `https://shopee.co.id/search?keyword=${encodeURIComponent(
    keyword
  )}${locQuery}`;

  let tabId = '';
  try {
    const newTabRes = await fetch(
      `${CDP_ENDPOINT}/json/new?${encodeURI(searchUrl)}`,
      { method: 'PUT', cache: 'no-store' }
    );
    if (!newTabRes.ok) return [];
    const tabInfo = await newTabRes.json();
    tabId = tabInfo.id || '';

    // Tunggu 6.5 detik tanpa debugger agar Shopee merender kartu produk secara utuh
    await new Promise((r) => setTimeout(r, 6500));

    const browser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 15000 });
    const ctx = browser.contexts()[0];
    if (!ctx) return [];

    const pages = ctx.pages();
    const shpPage = pages[pages.length - 1];
    if (!shpPage) return [];

    // Scroll sedikit untuk merender baris produk tambahan
    try {
      await shpPage.mouse.wheel(0, 1200);
      await shpPage.waitForTimeout(1000);
    } catch {
      // Abaikan jika gagal scroll
    }

    const rawCards = await shpPage.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('a[href*="-i."]')
      );
      //Utamakan kartu hasil pencarian utama (yang memiliki informasi kota penjual di bagian bawah)
      const allExtracted = anchors.map((a) => {
        const anchorEl = a as HTMLAnchorElement;
        const img = anchorEl.querySelector('img')?.src || '';
        const text = anchorEl.innerText || anchorEl.textContent || '';
        const lines = text
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        return {
          href: anchorEl.getAttribute('href') || anchorEl.href || '',
          img,
          lines,
        };
      });

      // Urutkan agar kartu yang memiliki baris lebih lengkap (kota + rating + harga) berada di urutan depan
      return allExtracted.sort((a, b) => b.lines.length - a.lines.length);
    });

    return parseShopeeDomCards(rawCards, limit, location);
  } catch {
    return [];
  } finally {
    if (tabId) {
      await fetch(`${CDP_ENDPOINT}/json/close/${tabId}`).catch(() => {});
    }
  }
}

export async function runMarketplaceScrape(
  keyword: string,
  marketplaces: MarketplaceId[],
  limitPerMarketplace = 15,
  location?: string
): Promise<{
  products: ProductItem[];
  sourceNotes: string[];
}> {
  const allProducts: ProductItem[] = [];
  const sourceNotes: string[] = [];
  const cleanLocation =
    location && location.trim() && location !== 'all' ? location.trim() : undefined;

  const cdpStatus = await checkCdpStatus();
  const resultsByMp = new Map<MarketplaceId, ProductItem[]>();

  // 1. Jika Shopee dipilih & CDP aktif, buka tab pencarian Shopee secara native (TANPA debugger) terlebih dahulu
  //    agar Shopee merender seluruh produk tanpa terhalang anti-bot
  let shopeeTabId = '';
  if (marketplaces.includes('shopee') && cdpStatus.connected) {
    try {
      const hasLoc = Boolean(cleanLocation);
      const locQuery = hasLoc
        ? `&locations=${encodeURIComponent(cleanLocation!)}`
        : '';
      const searchUrl = `https://shopee.co.id/search?keyword=${encodeURIComponent(
        keyword
      )}${locQuery}`;
      const newTabRes = await fetch(
        `${CDP_ENDPOINT}/json/new?${encodeURI(searchUrl)}`,
        { method: 'PUT', cache: 'no-store' }
      );
      if (newTabRes.ok) {
        const tabInfo = await newTabRes.json();
        shopeeTabId = tabInfo.id || '';
        await new Promise((r) => setTimeout(r, 6500));
      }
    } catch {
      shopeeTabId = '';
    }
  }

  // 2. Buat satu koneksi BrowserContext untuk seluruh proses pengambilan data
  let scraperCtx: {
    context: BrowserContext;
    usingCdp: boolean;
    closeAll: () => Promise<void>;
  } | null = null;

  try {
    scraperCtx = await createScraperContext(true);
  } catch {
    scraperCtx = null;
  }

  try {
    // Jika tab native Shopee tadi sudah dibuka, baca isinya terlebih dahulu lalu tutup tabnya
    if (shopeeTabId && scraperCtx) {
      try {
        const pages = scraperCtx.context.pages();
        const shpPage =
          pages.find((p) => p.url().includes('shopee.co.id/search')) ||
          pages[pages.length - 1];
        if (shpPage) {
          try {
            await shpPage.mouse.wheel(0, 1200);
            await shpPage.waitForTimeout(1000);
          } catch {
            // Abaikan
          }
          const rawCards = await shpPage.evaluate(() => {
            const anchors = Array.from(
              document.querySelectorAll('a[href*="-i."]')
            );
            const allExtracted = anchors.map((a) => {
              const anchorEl = a as HTMLAnchorElement;
              const img = anchorEl.querySelector('img')?.src || '';
              const text = anchorEl.innerText || anchorEl.textContent || '';
              const lines = text
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
              return {
                href: anchorEl.getAttribute('href') || anchorEl.href || '',
                img,
                lines,
              };
            });
            return allExtracted.sort((a, b) => b.lines.length - a.lines.length);
          });

          const shpItems = parseShopeeDomCards(
            rawCards,
            limitPerMarketplace,
            cleanLocation
          );
          resultsByMp.set('shopee', shpItems);
        }
      } catch {
        resultsByMp.set('shopee', []);
      } finally {
        await fetch(`${CDP_ENDPOINT}/json/close/${shopeeTabId}`).catch(() => {});
      }
    }

    // 3. Jalankan scraper untuk marketplace lainnya menggunakan koneksi yang sama
    for (const mp of marketplaces) {
      if (mp === 'shopee' && resultsByMp.has('shopee')) {
        continue;
      }

      let scraped: ProductItem[] = [];
      if (scraperCtx) {
        const page = await scraperCtx.context.newPage();
        try {
          if (mp === 'tokopedia') {
            scraped = await scrapeTokopediaPage(
              page,
              keyword,
              limitPerMarketplace,
              cleanLocation
            );
          } else if (mp === 'blibli') {
            scraped = await scrapeBlibliPage(
              page,
              keyword,
              limitPerMarketplace,
              cleanLocation
            );
          }
        } catch {
          scraped = [];
        } finally {
          await page.close().catch(() => {});
        }
      }
      resultsByMp.set(mp, scraped);
    }
  } finally {
    if (scraperCtx) {
      await scraperCtx.closeAll();
    }
  }

  // 4. Gabungkan hasil sesuai urutan marketplace yang dipilih
  for (const mp of marketplaces) {
    const scraped = resultsByMp.get(mp) || [];
    if (scraped.length > 0) {
      allProducts.push(...scraped);
      const modeLabel = cdpStatus.connected ? 'Live Chrome CDP' : 'Live Scrape';
      sourceNotes.push(
        `${mp.toUpperCase()}: ${modeLabel} (${scraped.length} produk${
          cleanLocation ? ` di ${cleanLocation}` : ''
        })`
      );
    } else {
      const hint =
        mp === 'shopee'
          ? 'Pastikan Chrome CDP terbuka & sudah login Shopee'
          : 'Tidak ada produk ditemukan untuk kriteria ini';
      sourceNotes.push(`${mp.toUpperCase()}: Gagal (0 produk - ${hint})`);
    }
  }

  return {
    products: allProducts,
    sourceNotes,
  };
}
