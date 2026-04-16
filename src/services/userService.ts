import bcrypt from 'bcrypt';
import { query } from '../utils/db';
import { generateToken } from '../utils/auth';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import {
  User,
  SafeUser,
  CreateUserInput,
  UpdateUserInput,
  LoginInput,
  LoginResponse,
} from '../models/user';

// パスワードを除いたフィールド一覧
const SAFE_USER_FIELDS = 'id, email, name, role, created_at, updated_at';

/**
 * ユーザーを新規登録する
 */
export const createUser = async (input: CreateUserInput): Promise<SafeUser> => {
  try {
    // メールアドレスの重複チェック
    const existing = await query<User>(
      'SELECT id FROM users WHERE email = $1',
      [input.email]
    );
    if (existing.length > 0) {
      throw new ConflictError('このメールアドレスは既に使用されています');
    }

    // パスワードをハッシュ化
    const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(input.password, rounds);

    // ユーザーをDBに保存
    const rows = await query<SafeUser>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING ${SAFE_USER_FIELDS}`,
      [input.email, passwordHash, input.name]
    );

    return rows[0];
  } catch (err) {
    if (err instanceof ConflictError) throw err;
    throw err;
  }
};

/**
 * ログイン処理（メールアドレスとパスワードを検証してJWTを返す）
 */
export const loginUser = async (input: LoginInput): Promise<LoginResponse> => {
  try {
    // ユーザーを取得
    const rows = await query<User>(
      'SELECT * FROM users WHERE email = $1',
      [input.email]
    );

    if (rows.length === 0) {
      throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません');
    }

    const user = rows[0];

    // パスワードを検証
    const isValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません');
    }

    // JWTトークンを生成
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    return { token, user: safeUser };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw err;
  }
};

/**
 * IDでユーザーを取得する
 */
export const getUserById = async (id: number): Promise<SafeUser> => {
  try {
    const rows = await query<SafeUser>(
      `SELECT ${SAFE_USER_FIELDS} FROM users WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundError('ユーザーが見つかりません');
    }

    return rows[0];
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw err;
  }
};

/**
 * ユーザー情報を更新する
 */
export const updateUser = async (
  id: number,
  input: UpdateUserInput
): Promise<SafeUser> => {
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.email !== undefined) {
      // 新しいメールアドレスの重複チェック
      const existing = await query<User>(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [input.email, id]
      );
      if (existing.length > 0) {
        throw new ConflictError('このメールアドレスは既に使用されています');
      }
      setClauses.push(`email = $${paramIndex++}`);
      values.push(input.email);
    }

    if (setClauses.length === 0) {
      return getUserById(id);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const rows = await query<SafeUser>(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING ${SAFE_USER_FIELDS}`,
      values
    );

    if (rows.length === 0) {
      throw new NotFoundError('ユーザーが見つかりません');
    }

    return rows[0];
  } catch (err) {
    if (err instanceof ConflictError || err instanceof NotFoundError) throw err;
    throw err;
  }
};
