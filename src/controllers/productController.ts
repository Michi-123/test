import { Request, Response, NextFunction } from 'express';
import * as productService from '../services/productService';
import { BadRequestError } from '../utils/errors';

/**
 * 商品一覧取得
 * GET /api/products
 */
export const getProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      keyword,
      page,
      limit,
    } = req.query;

    const result = await productService.getProducts({
      category: typeof category === 'string' ? category : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      keyword: typeof keyword === 'string' ? keyword : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * 商品詳細取得
 * GET /api/products/:id
 */
export const getProductById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new BadRequestError('商品IDが不正です');

    const product = await productService.getProductById(id);
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

/**
 * 商品登録（管理者専用）
 * POST /api/products
 */
export const createProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, description, price, stock, category, image_url } = req.body as {
      name: unknown;
      description: unknown;
      price: unknown;
      stock: unknown;
      category: unknown;
      image_url: unknown;
    };

    if (!name || !description || price === undefined || stock === undefined || !category) {
      throw new BadRequestError('name, description, price, stock, category は必須です');
    }
    if (
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      typeof category !== 'string'
    ) {
      throw new BadRequestError('パラメータの型が不正です');
    }
    if (typeof price !== 'number' || price < 0) {
      throw new BadRequestError('price は0以上の数値で入力してください');
    }
    if (typeof stock !== 'number' || stock < 0 || !Number.isInteger(stock)) {
      throw new BadRequestError('stock は0以上の整数で入力してください');
    }

    const product = await productService.createProduct({
      name,
      description,
      price,
      stock,
      category,
      image_url: typeof image_url === 'string' ? image_url : undefined,
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

/**
 * 商品更新（管理者専用）
 * PATCH /api/products/:id
 */
export const updateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new BadRequestError('商品IDが不正です');

    const { name, description, price, stock, category, image_url, is_active } = req.body as {
      name: unknown;
      description: unknown;
      price: unknown;
      stock: unknown;
      category: unknown;
      image_url: unknown;
      is_active: unknown;
    };

    const product = await productService.updateProduct(id, {
      name: typeof name === 'string' ? name : undefined,
      description: typeof description === 'string' ? description : undefined,
      price: typeof price === 'number' ? price : undefined,
      stock: typeof stock === 'number' ? stock : undefined,
      category: typeof category === 'string' ? category : undefined,
      image_url: typeof image_url === 'string' ? image_url : undefined,
      is_active: typeof is_active === 'boolean' ? is_active : undefined,
    });

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

/**
 * 商品削除（管理者専用・論理削除）
 * DELETE /api/products/:id
 */
export const deleteProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new BadRequestError('商品IDが不正です');

    await productService.deleteProduct(id);
    res.json({ success: true, message: '商品を削除しました' });
  } catch (err) {
    next(err);
  }
};
