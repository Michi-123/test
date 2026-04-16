/**
 * アプリケーション共通エラークラス
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    // TypeScript で Error を継承する場合のプロトタイプ設定
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 Bad Request */
export class BadRequestError extends AppError {
  constructor(message = 'リクエストが不正です') {
    super(message, 400);
  }
}

/** 401 Unauthorized */
export class UnauthorizedError extends AppError {
  constructor(message = '認証が必要です') {
    super(message, 401);
  }
}

/** 403 Forbidden */
export class ForbiddenError extends AppError {
  constructor(message = 'アクセスが拒否されました') {
    super(message, 403);
  }
}

/** 404 Not Found */
export class NotFoundError extends AppError {
  constructor(message = 'リソースが見つかりません') {
    super(message, 404);
  }
}

/** 409 Conflict */
export class ConflictError extends AppError {
  constructor(message = 'リソースが既に存在します') {
    super(message, 409);
  }
}

/** 500 Internal Server Error */
export class InternalServerError extends AppError {
  constructor(message = 'サーバーエラーが発生しました') {
    super(message, 500, false);
  }
}
