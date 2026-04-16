import { query } from '../utils/db';
import { NotFoundError } from '../utils/errors';
import {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductSearchParams,
  ProductListResponse,
} from '../models/product';

/**
 * 商品一覧を検索・取得する（ページネーション対応）
 */
export const getProducts = async (
  params: ProductSearchParams
): Promise<ProductListResponse> => {
  try {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['is_active = true'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(params.category);
    }
    if (params.minPrice !== undefined) {
      conditions.push(`price >= $${paramIndex++}`);
      values.push(params.minPrice);
    }
    if (params.maxPrice !== undefined) {
      conditions.push(`price <= $${paramIndex++}`);
      values.push(params.maxPrice);
    }
    if (params.keyword) {
      conditions.push(
        `(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`
      );
      values.push(`%${params.keyword}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 総件数を取得
    const countRows = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM products ${whereClause}`,
      values
    );
    const total = parseInt(countRows[0].count, 10);

    // 商品一覧を取得
    const products = await query<Product>(
      `SELECT * FROM products ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset]
    );

    return {
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (err) {
    throw err;
  }
};

/**
 * IDで商品を取得する
 */
export const getProductById = async (id: number): Promise<Product> => {
  try {
    const rows = await query<Product>(
      'SELECT * FROM products WHERE id = $1 AND is_active = true',
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundError('商品が見つかりません');
    }

    return rows[0];
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw err;
  }
};

/**
 * 新しい商品を登録する
 */
export const createProduct = async (
  input: CreateProductInput
): Promise<Product> => {
  try {
    const rows = await query<Product>(
      `INSERT INTO products (name, description, price, stock, category, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.name,
        input.description,
        input.price,
        input.stock,
        input.category,
        input.image_url ?? null,
      ]
    );

    return rows[0];
  } catch (err) {
    throw err;
  }
};

/**
 * 商品情報を更新する
 */
export const updateProduct = async (
  id: number,
  input: UpdateProductInput
): Promise<Product> => {
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fields: (keyof UpdateProductInput)[] = [
      'name', 'description', 'price', 'stock', 'category', 'image_url', 'is_active',
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(input[field]);
      }
    }

    if (setClauses.length === 0) {
      return getProductById(id);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const rows = await query<Product>(
      `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (rows.length === 0) {
      throw new NotFoundError('商品が見つかりません');
    }

    return rows[0];
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw err;
  }
};

/**
 * 商品を論理削除する（is_active を false に更新）
 */
export const deleteProduct = async (id: number): Promise<void> => {
  try {
    const rows = await query<Product>(
      `UPDATE products SET is_active = false, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundError('商品が見つかりません');
    }
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw err;
  }
};
