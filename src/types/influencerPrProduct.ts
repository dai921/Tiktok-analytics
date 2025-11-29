export interface InfluencerPrProduct {
  product_id: number;
  product_name: string;
  product_brand: string | null;
  product_category: string | null;
  source_url: string | null;
  is_pr?: number | boolean;
}

export interface InfluencerPrProductUpdate {
  product_name?: string | null;
  product_brand?: string | null;
  product_category?: string | null;
  source_url?: string | null;
}
