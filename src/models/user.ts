// ユーザーモデルの型定義

export type UserRole = 'customer' | 'admin';

/** ユーザーエンティティ（DBレコードと対応） */
export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

/** パスワードを除いた安全なユーザー情報 */
export type SafeUser = Omit<User, 'password_hash'>;

/** ユーザー登録リクエスト */
export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

/** ユーザー情報更新リクエスト */
export interface UpdateUserInput {
  name?: string;
  email?: string;
}

/** ログインリクエスト */
export interface LoginInput {
  email: string;
  password: string;
}

/** ログインレスポンス */
export interface LoginResponse {
  token: string;
  user: SafeUser;
}
