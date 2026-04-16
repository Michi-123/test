import { Request, Response, NextFunction } from 'express';
import * as orderService from '../services/orderService';
import { BadRequestError } from '../utils/errors';
import { JwtPayload } from '../utils/auth';
import { OrderStatus } from '../models/order';

// 認証済みリクエストの型定義
type AuthRequest = Request & { user: JwtPayload };

const VALID_STATUSES: OrderStatus[] = [
  'pending', 'confirmed', 'shipped', 'delivered', 'cancelled',
];

/**
 * 注文作成
 * POST /api/orders
 */
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthRequest;
    const { shipping_address, items } = req.body as {
      shipping_address: unknown;
      items: unknown;
    };

    if (!shipping_address || typeof shipping_address !== 'string') {
      throw new BadRequestError('shipping_address は必須です');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('items は1件以上の配列で指定してください');
    }

    // 各注文明細のバリデーション
    for (const item of items) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as Record<string, unknown>).product_id !== 'number' ||
        typeof (item as Record<string, unknown>).quantity !== 'number' ||
        (item as Record<string, unknown>).quantity <= 0
      ) {
        throw new BadRequestError('items の各要素に product_id と quantity（1以上）が必要です');
      }
    }

    const order = await orderService.createOrder(user.userId, {
      shipping_address,
      items: items as Array<{ product_id: number; quantity: number }>,
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

/**
 * 自分の注文一覧取得
 * GET /api/orders
 */
export const getMyOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthRequest;
    const orders = await orderService.getOrdersByUserId(user.userId);
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

/**
 * 注文詳細取得
 * GET /api/orders/:id
 */
export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthRequest;
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) throw new BadRequestError('注文IDが不正です');

    const order = await orderService.getOrderById(
      orderId,
      user.userId,
      user.role === 'admin'
    );

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

/**
 * 注文ステータス更新（管理者専用）
 * PATCH /api/orders/:id/status
 */
export const updateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) throw new BadRequestError('注文IDが不正です');

    const { status } = req.body as { status: unknown };
    if (!status || !VALID_STATUSES.includes(status as OrderStatus)) {
      throw new BadRequestError(
        `status は ${VALID_STATUSES.join(', ')} のいずれかで指定してください`
      );
    }

    const order = await orderService.updateOrderStatus(orderId, {
      status: status as OrderStatus,
    });

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};
