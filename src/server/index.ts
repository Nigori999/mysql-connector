// server/index.ts - 服务端入口文件
import { InstallOptions, Plugin } from '@nocobase/server';
import { resolve } from 'path';
import MySQLManager from './mysql-manager';

// 添加类型声明
declare module 'sequelize/types/sequelize' {
  interface Sequelize {
    options?: {
      logging?: any;
    };
  }
}

// 添加统一错误处理工具函数
const handleServerError = (ctx, error, defaultMessage = '操作失败') => {
    // 记录详细错误到日志
    const logger = ctx.app.logger || console;
    logger.error(`[mysql-connector] Error:`, {
      error: error.message,
      stack: error.stack,
      endpoint: ctx.request.path,
      method: ctx.request.method,
      params: ctx.action.params
    });
    
    // 处理常见的MySQL错误并返回友好信息
    let statusCode = 400;
    let message = error.message || defaultMessage;
    let errorCode = 'UNKNOWN_ERROR';
    
    if (error.code) {
      // 对常见的MySQL错误代码进行处理
      switch (error.code) {
        case 'ECONNREFUSED':
          errorCode = 'CONNECTION_REFUSED';
          message = '无法连接到MySQL服务器';
          break;
        case 'ER_ACCESS_DENIED_ERROR':
          errorCode = 'ACCESS_DENIED';
          message = '访问被拒绝: 用户名或密码不正确';
          break;
        case 'ER_BAD_DB_ERROR':
          errorCode = 'DATABASE_NOT_FOUND';
          message = '数据库不存在';
          break;
        case 'ETIMEDOUT':
          errorCode = 'CONNECTION_TIMEOUT';
          message = '连接超时: 无法在指定时间内连接到服务器';
          break;
        case 'ER_TABLE_EXISTS_ERROR':
          errorCode = 'TABLE_EXISTS';
          message = '表已存在';
          break;
        case 'ER_DUP_ENTRY':
          errorCode = 'DUPLICATE_ENTRY';
          message = '数据重复';
          break;
      }
    }
    
    // 设置响应
    ctx.status = statusCode;
    ctx.body = { 
      success: false, 
      message, 
      error: {
        code: errorCode,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  };
export default class MySQLConnectorPlugin extends Plugin {
  mysqlManager: MySQLManager;
  
  // 添加初始化安装方法
  async install(options?: InstallOptions) {
    // 创建必要的数据库表
    await this.db.import({
      directory: resolve(__dirname, 'collections'),
    });
  }

  // 在卸载时清理
  async remove() {
    // 删除关联的数据库表
    // 使用更安全的方式处理日志设置
    const sequelize = this.db.sequelize;
    let originalLogging = false;
    
    try {
      // 临时存储并关闭日志
      if (typeof sequelize['getDialect'] === 'function') {
        // 尝试通过API获取和设置日志配置
        originalLogging = (sequelize as any).options?.logging;
        (sequelize as any).options = (sequelize as any).options || {};
        (sequelize as any).options.logging = false;
      }
      
      // 删除表
      await this.db.getCollection('mysql_connections').model.drop();
    } catch (error) {
      console.error('删除表失败:', error);
    } finally {
      // 恢复日志设置
      if (typeof sequelize['getDialect'] === 'function' && (sequelize as any).options) {
        (sequelize as any).options.logging = originalLogging;
      }
    }
  }

  async load() {  
    // 初始化 MySQL 管理器
    this.mysqlManager = new MySQLManager(this.db);
    
    // 注册资源和操作 - 使用闭包捕获 mysqlManager 避免 this 上下文问题
    const mysqlManager = this.mysqlManager;
    
    this.app.resourcer.define({
      name: 'mysql',
      actions: {
        connect: async (ctx, next) => {
          const { database, host, port, username, password, name } = ctx.action.params;
          try {
            const connection = await mysqlManager.connect({
              database,
              host,
              port,
              username,
              password,
              name: name || `${host}:${port}/${database}`
            });
            ctx.body = { success: true, message: '连接成功', data: connection };
          } catch (error) {
            handleServerError(ctx, error, '连接失败');
          }
        },
        disconnect: async (ctx, next) => {
          const { connectionId } = ctx.action.params;
          try {
            await mysqlManager.disconnect(connectionId);
            ctx.body = { success: true, message: '断开连接成功' };
          } catch (error) {
            handleServerError(ctx, error, '断开连接失败');
          }
        },
        listConnections: async (ctx, next) => {
          try {
            const connections = await mysqlManager.listConnections();
            ctx.body = { success: true, data: connections };
          } catch (error) {
            handleServerError(ctx, error, '获取连接列表失败');
          }
        },
        listTables: async (ctx, next) => {
          const { connectionId } = ctx.action.params;
          try {
            const tables = await mysqlManager.listTables(connectionId);
            ctx.body = { success: true, data: tables };
          } catch (error) {
            handleServerError(ctx, error, '获取表列表失败');
          }
        },
        importTable: async (ctx, next) => {
          const { connectionId, tableName, collectionName } = ctx.action.params;
          try {
            const result = await mysqlManager.importTable(connectionId, tableName, collectionName);
            ctx.body = { success: true, message: '表导入成功', data: result };
          } catch (error) {
            handleServerError(ctx, error, '导入表失败');
          }
        },
        getTableSchema: async (ctx, next) => {
          const { connectionId, tableName } = ctx.action.params;
          try {
            const schema = await mysqlManager.getTableSchema(connectionId, tableName);
            ctx.body = { success: true, data: schema.columns };
          } catch (error) {
            handleServerError(ctx, error, '获取表结构失败');
          }
        }
      },
    });
  }
}