// 注文モデルの型定義

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

/** 注文明細エンティティ */
export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

/** 注文エンティティ（DBレコードと対応） */
export interface Order {
  id: number;
  user_id: number;
  status: OrderStatus;
  total_amount: number;
  shipping_address: string;
  created_at: Date;
  updated_at: Date;
}

/** 注文明細を含む注文詳細 */
export interface OrderWithItems extends Order {
  items: OrderItem[];
}

/** 注文明細の入力 */
export interface OrderItemInput {
  product_id: number;
  quantity: number;
}

/** 注文作成リクエスト */
export interface CreateOrderInput {
  shipping_address: string;
  items: OrderItemInput[];
}

/** 注文ステータス更新リクエスト */
export interface UpdateOrderStatusInput {
  status: OrderStatus;
}
