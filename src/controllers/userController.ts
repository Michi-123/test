import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/userService';
import { BadRequestError } from '../utils/errors';

/**
 * ユーザー登録
 * POST /api/users/register
 */
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, name } = req.body as {
      email: unknown;
      password: unknown;
      name: unknown;
    };

    if (!email || !password || !name) {
      throw new BadRequestError('email, password, name は必須です');
    }
    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
      throw new BadRequestError('パラメータの型が不正です');
    }
    if (password.length < 8) {
      throw new BadRequestError('パスワードは8文字以上で入力してください');
    }

    const user = await userService.createUser({ email, password, name });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * ログイン
 * POST /api/users/login
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body as {
      email: unknown;
      password: unknown;
    };

    if (!email || !password) {
      throw new BadRequestError('email と password は必須です');
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestError('パラメータの型が不正です');
    }

    const result = await userService.loginUser({ email, password });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * 自分のプロフィール取得
 * GET /api/users/me
 */
export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.user は認証ミドルウェアでセットされる
    const userId = (req as Request & { user: { userId: number } }).user.userId;
    const user = await userService.getUserById(userId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

/**
 * プロフィール更新
 * PATCH /api/users/me
 */
export const updateMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as Request & { user: { userId: number } }).user.userId;
    const { name, email } = req.body as { name: unknown; email: unknown };

    const input: { name?: string; email?: string } = {};
    if (name !== undefined) {
      if (typeof name !== 'string') throw new BadRequestError('name は文字列で入力してください');
      input.name = name;
    }
    if (email !== undefined) {
      if (typeof email !== 'string') throw new BadRequestError('email は文字列で入力してください');
      input.email = email;
    }

    const user = await userService.updateUser(userId, input);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};
