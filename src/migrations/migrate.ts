import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { query } from '../utils/db';

dotenv.config();

/**
 * マイグレーションを実行するスクリプト
 * npm run migrate で呼び出す
 */
const runMigrations = async (): Promise<void> => {
  try {
    console.log('マイグレーションを開始します...');

    // マイグレーションファイルを昇順で取得
    const migrationsDir = path.join(__dirname);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      console.log(`実行中: ${file}`);
      await query(sql);
      console.log(`完了: ${file}`);
    }

    console.log('全マイグレーションが完了しました');
    process.exit(0);
  } catch (err) {
    console.error('マイグレーションエラー:', err);
    process.exit(1);
  }
};

runMigrations();
