import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errors';

// JWT ペイロードの型定義
export interface JwtPayload {
  userId: number;
  email: string;
  role: 'customer' | 'admin';
}

/**
 * JWT トークンを生成する
 * @param payload ペイロードデータ
 */
export const generateToken = (payload: JwtPayload): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET が設定されていません');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
};

/**
 * JWT トークンを検証して、ペイロードを返す
 * @param token JWT トークン文字列
 */
export const verifyToken = (token: string): JwtPayload => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET が設定されていません');
  }
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    throw new UnauthorizedError('トークンが無効または期限切れです');
  }
};

/**
 * Authorization ヘッダーから Bearer トークンを抽出する
 * @param authHeader Authorization ヘッダーの値
 */
export const extractBearerToken = (authHeader: string | undefined): string => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authorization ヘッダーが不正です');
  }
  return authHeader.substring(7);
};
