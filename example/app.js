import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';

// 加载环境变量
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export default {
  plugins: [
    '@nocobase/plugin-mysql-connector'
  ],
  sourceConfig: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT || 'mysql',
    timezone: process.env.DB_TIMEZONE || '+00:00',
  },
  resourceManager: {
    // 资源配置
  },
};