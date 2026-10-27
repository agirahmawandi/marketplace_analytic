export type MarketplaceId = 'tokopedia' | 'shopee' | 'blibli';

export interface ProductItem {
  id?: number;
  session_id?: number;
  marketplace: MarketplaceId;
  external_id: string;
  product_name: string;
  product_url: string;
  image_url: string;
  shop_name: string;
  shop_city: string;
  shop_badge: string;
  price_final: number;
  price_original: number;
  discount_pct: number;
  sold_count: number;
  sold_text_raw: string;
  rating: number;
  review_count: number;
  estimated_revenue: number;
  is_live_scraped?: boolean;
  scraped_at: string;
}

export interface SearchSession {
  id: number;
  keyword: string;
  marketplaces: string; // comma-separated e.g. "tokopedia,shopee,blibli"
  total_items: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  total_sold: number;
  total_estimated_revenue: number;
  avg_discount_pct: number;
  discounted_items_count: number;
  unique_cities_count: number;
  unique_shops_count: number;
  data_source_note?: string;
  created_at: string;
  products?: ProductItem[];
}

export interface SearchRequestPayload {
  keyword: string;
  marketplaces: MarketplaceId[];
  location?: string;
  limitPerMarketplace?: number;
  sortBy?: 'relevancy' | 'sales' | 'price_asc' | 'price_desc';
}
