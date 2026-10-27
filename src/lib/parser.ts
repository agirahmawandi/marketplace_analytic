/**
 * Utilitas normalisasi data harga, diskon penjual, jumlah terjual, dan nama kota penjual
 * lintas marketplace (Tokopedia, Shopee, Blibli).
 */

export function parsePrice(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') {
    // Shopee internal API kadang menyimpan harga dikali 100.000 (misal 45000 -> 4500000000)
    if (raw > 500_000_000 && raw % 100000 === 0) {
      return Math.round(raw / 100000);
    }
    return Math.round(raw);
  }

  const str = String(raw).trim();
  if (!str) return 0;

  // Jika ada rentang harga "Rp40.000 - Rp50.000", ambil harga pertama
  const firstPart = str.split('-')[0].trim();

  // Hapus semua karakter selain angka
  const digits = firstPart.replace(/[^\d]/g, '');
  if (!digits) return 0;

  const val = parseInt(digits, 10);
  return isNaN(val) ? 0 : val;
}

export function calculateDiscountPct(
  priceFinal: number,
  priceOriginal?: number,
  rawDiscountText?: string
): { priceOriginal: number; discountPct: number } {
  let orig = priceOriginal && priceOriginal > priceFinal ? priceOriginal : priceFinal;
  let pct = 0;

  if (rawDiscountText) {
    const match = String(rawDiscountText).match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (match) {
      pct = parseFloat(match[1].replace(',', '.'));
    }
  }

  if (orig > priceFinal && priceFinal > 0) {
    pct = Number((((orig - priceFinal) / orig) * 100).toFixed(1));
  } else if (pct > 0 && pct < 99 && priceFinal > 0 && orig <= priceFinal) {
    // Jika halaman hanya menampilkan % diskon dan harga final, hitung estimasi harga asli
    orig = Math.round(priceFinal / (1 - pct / 100));
  }

  if (pct <= 0 || orig <= priceFinal) {
    return { priceOriginal: priceFinal, discountPct: 0 };
  }

  return {
    priceOriginal: orig,
    discountPct: Number(pct.toFixed(1)),
  };
}

export function parseSoldCount(raw: string | number | undefined | null): {
  soldCount: number;
  soldTextRaw: string;
} {
  if (typeof raw === 'number') {
    return {
      soldCount: Math.max(0, Math.round(raw)),
      soldTextRaw: `${Math.max(0, Math.round(raw))} terjual`,
    };
  }

  const text = String(raw || '').trim();
  if (!text) {
    return { soldCount: 0, soldTextRaw: '0 terjual' };
  }

  const lower = text.toLowerCase();

  // Tangani format ribuan / jutaan Indonesia: "1,2rb", "10rb+", "500+", "2.5k"
  const match = lower.match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?/);
  if (!match) {
    return { soldCount: 0, soldTextRaw: text };
  }

  let numStr = match[1];
  const unit = match[2] || '';

  if (unit === 'rb' || unit === 'ribu' || unit === 'k') {
    const floatVal = parseFloat(numStr.replace(',', '.'));
    const count = Math.round(floatVal * 1000);
    return { soldCount: count, soldTextRaw: text };
  }

  if (unit === 'jt' || unit === 'juta') {
    const floatVal = parseFloat(numStr.replace(',', '.'));
    const count = Math.round(floatVal * 1_000_000);
    return { soldCount: count, soldTextRaw: text };
  }

  // Jika angka biasa seperti "1.250" atau "250+"
  const cleanDigits = numStr.replace(/[^\d]/g, '');
  const count = parseInt(cleanDigits, 10) || 0;
  return { soldCount: count, soldTextRaw: text };
}

export function normalizeCityName(rawCity: string | undefined | null): string {
  if (!rawCity) return 'Tidak Diketahui';
  let city = String(rawCity)
    .replace(/dikirim dari/gi, '')
    .replace(/lokasi\s*:/gi, '')
    .replace(/kota administrasi/gi, '')
    .replace(/^\s*[-•|]\s*/, '')
    .trim();

  if (!city) return 'Tidak Diketahui';

  const lower = city.toLowerCase();

  // Normalisasi kapitalisasi kata ("KOTA JAKARTA SELATAN" -> "Jakarta Selatan")
  city = city
    .toLowerCase()
    .replace(/\b(kota)\s+/gi, '')
    .replace(/\b(kabupaten)\s+/gi, 'Kab. ')
    .replace(/\b(kab\.?)\s+/gi, 'Kab. ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

  if (lower.includes('dki jakarta') || lower === 'jakarta') {
    return 'Jakarta';
  }

  return city || 'Tidak Diketahui';
}

export function parseRating(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') {
    return raw > 0 && raw <= 5 ? Number(raw.toFixed(2)) : 0;
  }
  if (!raw) return 0;
  const match = String(raw).replace(',', '.').match(/([0-5]\.\d+|[1-5])/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  return val >= 0 && val <= 5 ? Number(val.toFixed(2)) : 0;
}
