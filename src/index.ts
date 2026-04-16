import dotenv from 'dotenv';

// 環境変数の読み込み（他のモジュールより先に実行する）
dotenv.config();

import app from './app';

const PORT = Number(process.env.PORT) || 3000;

// サーバーを起動する
const server = app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
  console.log(`環境: ${process.env.NODE_ENV || 'development'}`);
});

// グレースフルシャットダウン
const shutdown = (): void => {
  console.log('シャットダウン中...');
  server.close(() => {
    console.log('サーバーを停止しました');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
