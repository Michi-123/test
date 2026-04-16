import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { verifyToken, extractBearerToken, JwtPayload } from './utils/auth';
import { AppError, UnauthorizedError, ForbiddenError } from './utils/errors';
import * as userController from './controllers/userController';
import * as productController from './controllers/productController';
import * as orderController from './controllers/orderController';

const app = express();

// ミドルウェアの設定
app.use(cors());
app.use(express.json());

// ----------------------------------------
// 認証ミドルウェア
// ----------------------------------------

/** JWTを検証して req.user にペイロードをセットする */
const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    const payload = verifyToken(token);
    (req as Request & { user: JwtPayload }).user = payload;
    next();
  } catch (err) {
    next(err);
  }
};

/** 管理者ロールのみを許可するミドルウェア */
const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as Request & { user: JwtPayload }).user;
  if (user?.role !== 'admin') {
    next(new ForbiddenError('管理者権限が必要です'));
    return;
  }
  next();
};

// ----------------------------------------
// ルーティング
// ----------------------------------------

// ヘルスチェック
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ユーザー関連エンドポイント
app.post('/api/users/register', userController.register);
app.post('/api/users/login', userController.login);
app.get('/api/users/me', authenticate, userController.getMe);
app.patch('/api/users/me', authenticate, userController.updateMe);

// 商品関連エンドポイント
app.get('/api/products', productController.getProducts);
app.get('/api/products/:id', productController.getProductById);
app.post('/api/products', authenticate, requireAdmin, productController.createProduct);
app.patch('/api/products/:id', authenticate, requireAdmin, productController.updateProduct);
app.delete('/api/products/:id', authenticate, requireAdmin, productController.deleteProduct);

// 注文関連エンドポイント
app.post('/api/orders', authenticate, orderController.createOrder);
app.get('/api/orders', authenticate, orderController.getMyOrders);
app.get('/api/orders/:id', authenticate, orderController.getOrderById);
app.patch('/api/orders/:id/status', authenticate, requireAdmin, orderController.updateOrderStatus);

// ----------------------------------------
// エラーハンドリングミドルウェア
// ----------------------------------------
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // 未知のエラー（本番環境では詳細を隠す）
  console.error('予期しないエラー:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'サーバーエラーが発生しました'
      : err.message,
  });
});

export default app;
