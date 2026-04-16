import { PoolClient } from 'pg';
import { withTransaction, query } from '../utils/db';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import {
  Order,
  OrderWithItems,
  OrderItem,
  CreateOrderInput,
  UpdateOrderStatusInput,
} from '../models/order';
import { Product } from '../models/product';

/**
 * 注文を作成する（在庫チェックと減算をトランザクションで実行）
 */
export const createOrder = async (
  userId: number,
  input: CreateOrderInput
): Promise<OrderWithItems> => {
  return withTransaction(async (client: PoolClient) => {
    let totalAmount = 0;
    const itemsData: Array<{
      product: Product;
      quantity: number;
    }> = [];

    // 各商品の在庫チェックと合計金額の計算
    for (const item of input.items) {
      const result = await client.query<Product>(
        'SELECT * FROM products WHERE id = $1 AND is_active = true FOR UPDATE',
        [item.product_id]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`商品ID ${item.product_id} が見つかりません`);
      }

      const product = result.rows[0];

      if (product.stock < item.quantity) {
        throw new BadRequestError(
          `商品「${product.name}」の在庫が不足しています（在庫: ${product.stock}）`
        );
      }

      totalAmount += product.price * item.quantity;
      itemsData.push({ product, quantity: item.quantity });
    }

    // 注文レコードを作成
    const orderResult = await client.query<Order>(
      `INSERT INTO orders (user_id, status, total_amount, shipping_address)
       VALUES ($1, 'pending', $2, $3)
       RETURNING *`,
      [userId, totalAmount, input.shipping_address]
    );
    const order = orderResult.rows[0];

    // 注文明細の作成と在庫の減算
    const orderItems: OrderItem[] = [];
    for (const { product, quantity } of itemsData) {
      // 注文明細を挿入
      const itemResult = await client.query<OrderItem>(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [order.id, product.id, product.name, quantity, product.price, product.price * quantity]
      );
      orderItems.push(itemResult.rows[0]);

      // 在庫を減算
      await client.query(
        'UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
        [quantity, product.id]
      );
    }

    return { ...order, items: orderItems };
  });
};

/**
 * ユーザーの注文一覧を取得する
 */
export const getOrdersByUserId = async (userId: number): Promise<Order[]> => {
  try {
    const rows = await query<Order>(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

/**
 * 注文詳細を取得する（注文明細を含む）
 */
export const getOrderById = async (
  orderId: number,
  userId: number,
  isAdmin: boolean
): Promise<OrderWithItems> => {
  try {
    const rows = await query<Order>(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('注文が見つかりません');
    }

    const order = rows[0];

    // 管理者でない場合は自分の注文のみ閲覧可能
    if (!isAdmin && order.user_id !== userId) {
      throw new ForbiddenError('この注文にアクセスする権限がありません');
    }

    const items = await query<OrderItem>(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId]
    );

    return { ...order, items };
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) throw err;
    throw err;
  }
};

/**
 * 注文ステータスを更新する（管理者専用）
 */
export const updateOrderStatus = async (
  orderId: number,
  input: UpdateOrderStatusInput
): Promise<Order> => {
  try {
    const rows = await query<Order>(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [input.status, orderId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('注文が見つかりません');
    }

    return rows[0];
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw err;
  }
};
