// src/index.ts - 插件主入口文件
// 使用正确的相对路径导入
// 注意：必须使用相对路径才能正确解析
import * as server from './server';
import * as client from './client';

// 导出所有内容
export { server, client };

// 默认导出
export default { server, client };