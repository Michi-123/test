import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL 接続プール
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'ec_site',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 接続エラーをログ出力
pool.on('error', (err: Error) => {
  console.error('PostgreSQL 接続エラー:', err);
  process.exit(1);
});

/**
 * クエリを実行する
 * @param text SQL クエリ文字列
 * @param params バインドパラメータ
 */
export const query = async <T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> => {
  const result = await pool.query(text, params);
  return result.rows as T[];
};

/**
 * トランザクションを使用するためのクライアントを取得する
 */
export const getClient = async (): Promise<PoolClient> => {
  return pool.connect();
};

/**
 * トランザクション内で複数のクエリを実行する
 * @param callback トランザクション処理
 */
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default pool;
