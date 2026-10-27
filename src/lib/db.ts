import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { ProductItem, SearchSession } from '@/types/marketplace';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'marketplace.db');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!dbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      marketplaces TEXT NOT NULL,
      total_items INTEGER NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0,
      min_price INTEGER NOT NULL DEFAULT 0,
      max_price INTEGER NOT NULL DEFAULT 0,
      total_sold INTEGER NOT NULL DEFAULT 0,
      total_estimated_revenue REAL NOT NULL DEFAULT 0,
      avg_discount_pct REAL NOT NULL DEFAULT 0,
      discounted_items_count INTEGER NOT NULL DEFAULT 0,
      unique_cities_count INTEGER NOT NULL DEFAULT 0,
      unique_shops_count INTEGER NOT NULL DEFAULT 0,
      data_source_note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,
      external_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_url TEXT NOT NULL,
      image_url TEXT NOT NULL,
      shop_name TEXT NOT NULL,
      shop_city TEXT NOT NULL,
      shop_badge TEXT NOT NULL,
      price_final INTEGER NOT NULL,
      price_original INTEGER NOT NULL,
      discount_pct REAL NOT NULL,
      sold_count INTEGER NOT NULL,
      sold_text_raw TEXT NOT NULL,
      rating REAL NOT NULL,
      review_count INTEGER NOT NULL DEFAULT 0,
      estimated_revenue REAL NOT NULL DEFAULT 0,
      scraped_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES search_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_session ON product_snapshots(session_id);
    CREATE INDEX IF NOT EXISTS idx_product_city ON product_snapshots(shop_city);
  `);
}

export function saveSearchSession(
  keyword: string,
  marketplaces: string[],
  products: ProductItem[],
  dataSourceNote = ''
): SearchSession {
  const db = getDb();
  const now = new Date().toISOString();

  const validPrices = products.map((p) => p.price_final).filter((p) => p > 0);
  const totalItems = products.length;
  const avgPrice =
    validPrices.length > 0
      ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
      : 0;
  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
  const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;

  const totalSold = products.reduce((acc, p) => acc + (p.sold_count || 0), 0);
  const totalEstimatedRevenue = products.reduce(
    (acc, p) => acc + (p.price_final || 0) * (p.sold_count || 0),
    0
  );

  const discountedProducts = products.filter((p) => p.discount_pct > 0);
  const discountedItemsCount = discountedProducts.length;
  const avgDiscountPct =
    discountedItemsCount > 0
      ? Number(
          (
            discountedProducts.reduce((acc, p) => acc + p.discount_pct, 0) /
            discountedItemsCount
          ).toFixed(1)
        )
      : 0;

  const uniqueCities = new Set(
    products
      .map((p) => (p.shop_city || '').trim())
      .filter((c) => c && c !== 'Tidak Diketahui')
  );
  const uniqueShops = new Set(
    products.map((p) => `${p.marketplace}:${(p.shop_name || '').trim()}`)
  );

  const insertSession = db.prepare(`
    INSERT INTO search_sessions (
      keyword, marketplaces, total_items, avg_price, min_price, max_price,
      total_sold, total_estimated_revenue, avg_discount_pct,
      discounted_items_count, unique_cities_count, unique_shops_count,
      data_source_note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertSession.run(
    keyword,
    marketplaces.join(','),
    totalItems,
    avgPrice,
    minPrice,
    maxPrice,
    totalSold,
    totalEstimatedRevenue,
    avgDiscountPct,
    discountedItemsCount,
    uniqueCities.size,
    uniqueShops.size,
    dataSourceNote,
    now
  );

  const sessionId = Number(result.lastInsertRowid);

  const insertProduct = db.prepare(`
    INSERT INTO product_snapshots (
      session_id, marketplace, external_id, product_name, product_url, image_url,
      shop_name, shop_city, shop_badge, price_final, price_original, discount_pct,
      sold_count, sold_text_raw, rating, review_count, estimated_revenue, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN TRANSACTION');
  try {
    for (const item of products) {
      const estRev = (item.price_final || 0) * (item.sold_count || 0);
      insertProduct.run(
        sessionId,
        item.marketplace,
        item.external_id || '',
        item.product_name,
        item.product_url,
        item.image_url || '',
        item.shop_name || 'Toko Marketplace',
        item.shop_city || 'Tidak Diketahui',
        item.shop_badge || 'Reguler',
        item.price_final,
        item.price_original || item.price_final,
        item.discount_pct || 0,
        item.sold_count || 0,
        item.sold_text_raw || `${item.sold_count || 0} terjual`,
        item.rating || 0,
        item.review_count || 0,
        estRev,
        item.scraped_at || now
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getSearchSessionById(sessionId)!;
}

export function getSearchSessions(): SearchSession[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM search_sessions
    ORDER BY id DESC
    LIMIT 100
  `);
  return stmt.all() as unknown as SearchSession[];
}

export function getSearchSessionById(id: number): SearchSession | null {
  const db = getDb();
  const sessionStmt = db.prepare(`SELECT * FROM search_sessions WHERE id = ?`);
  const session = sessionStmt.get(id) as unknown as SearchSession | undefined;
  if (!session) return null;

  const productsStmt = db.prepare(`
    SELECT * FROM product_snapshots
    WHERE session_id = ?
    ORDER BY sold_count DESC, price_final ASC
  `);
  const products = productsStmt.all(id) as unknown as ProductItem[];

  return {
    ...session,
    products,
  };
}

export function deleteSearchSession(id: number): boolean {
  const db = getDb();
  db.prepare(`DELETE FROM product_snapshots WHERE session_id = ?`).run(id);
  const res = db.prepare(`DELETE FROM search_sessions WHERE id = ?`).run(id);
  return Number(res.changes) > 0;
}
