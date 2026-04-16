// 商品モデルの型定義

/** 商品エンティティ（DBレコードと対応） */
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  image_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** 商品作成リクエスト */
export interface CreateProductInput {
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  image_url?: string;
}

/** 商品更新リクエスト */
export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string;
  image_url?: string;
  is_active?: boolean;
}

/** 商品検索条件 */
export interface ProductSearchParams {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  keyword?: string;
  page?: number;
  limit?: number;
}

/** ページネーション付き商品一覧レスポンス */
export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
