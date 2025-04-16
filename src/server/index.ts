// server/index.ts 文件修改
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
    // 当前时间戳
    const timestamp = new Date().toISOString();
    const errorId = Math.random().toString(36).substring(2, 10); // 生成简单的错误ID
    
    // 记录详细错误到日志
    const logger = ctx.app.logger || console;
    
    // 避免使用.closed属性
    let connectionState = 'UNKNOWN';
    if (ctx.app?.db?.sequelize) {
      connectionState = 'AVAILABLE';
    } else {
      connectionState = 'UNAVAILABLE';
    }
    
    logger.error(`[mysql-connector] [${errorId}] Error at ${timestamp}:`, {
      error: error.message,
      stack: error.stack,
      endpoint: ctx.request?.path,
      method: ctx.request?.method,
      params: ctx.action?.params,
      connectionState
    });
    
    // 设置响应
    ctx.status = 400;
    ctx.body = { 
      success: false, 
      message: `${defaultMessage} (Ref: ${errorId})`, 
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        timestamp,
        reference: errorId,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  };
export default class MySQLConnectorPlugin extends Plugin {
  mysqlManager: MySQLManager;
  private initialized: boolean = false;

  async closeAllConnections() {
    if (this.mysqlManager) {
      try {
        this.app.logger.info('[mysql-connector] Closing all connections before plugin shutdown');
        await this.mysqlManager.closeAllConnections();
      } catch (error) {
        this.app.logger.error('[mysql-connector] Error closing connections:', error);
      }
    }
  }
  
  // 添加初始化安装方法
  async install(options?: InstallOptions) {
    // 创建必要的数据库表
    await this.db.import({
      directory: resolve(__dirname, 'collections'),
    });
  }

  async afterAdd() {
    // 添加插件时初始化，但不加载连接
    await this.db.import({
      directory: resolve(__dirname, 'collections'),
    });
  }

  async beforeRemove() {
    // 在移除插件前关闭所有连接
    await this.closeAllConnections();
  }

  // 在卸载时清理
  async remove() {
    // 先关闭所有MySQL连接
    await this.closeAllConnections();
    
    // 标记插件已卸载，防止后续操作
    this.mysqlManager = null;
    
    try {
      // 检查数据库实例是否可用
    if (this.db && this.db.sequelize) {
        // 使用更安全的方式检查连接状态
        try {
          const collection = this.db.getCollection('mysql_connections');
          if (collection && collection.model) {
            await collection.model.drop();
            this.app.logger.info('[mysql-connector] Dropped mysql_connections table');
          }
        } catch (err) {
          // 如果操作失败，可能是因为连接已关闭
          this.app.logger.warn('[mysql-connector] Could not drop tables, database might be closed:', err.message);
        }
      }
    } catch (error) {
      this.app.logger.error('[mysql-connector] Error removing plugin tables:', error);
    }
  }

  async beforeLoad() {
    // 在真正加载插件前进行准备
    if (this.initialized) {
      // 防止多次初始化
      return;
    }
    this.initialized = true;
  }

  async load() {  
    // 初始化 MySQL 管理器
    this.mysqlManager = new MySQLManager(this.db);
    
    // 注册资源和操作 - 使用闭包捕获 mysqlManager 避免 this 上下文问题
    const mysqlManager = this.mysqlManager;
    
    // 在应用关闭前关闭所有MySQL连接
    this.app.on('beforeStop', async () => {
      if (this.mysqlManager) {
        await this.mysqlManager.closeAllConnections();
      }
    });

    // 添加其他必要的生命周期钩子
    process.on('SIGINT', async () => {
        await this.closeAllConnections();
      });

      process.on('SIGTERM', async () => {
        await this.closeAllConnections();
      });
    
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
        importTables: async (ctx, next) => {
            const { connectionId, tableNames } = ctx.action.params;
            try {
              // 批量处理所有表
              const results = await mysqlManager.importTables(connectionId, tableNames);
              ctx.body = { 
                success: true, 
                message: '批量导入完成', 
                data: results 
              };
            } catch (error) {
              handleServerError(ctx, error, '批量导入失败');
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
        },
        previewTableData: async (ctx, next) => {
            const { connectionId, tableName, limit = 10 } = ctx.action.params;
            try {
              const data = await mysqlManager.previewTableData(connectionId, tableName, limit);
              ctx.body = { success: true, data };
            } catch (error) {
              handleServerError(ctx, error, '获取表数据预览失败');
            }
          }
      },
    });
  }

  // 添加卸载方法
  async beforeUnload() {
    if (this.mysqlManager) {
      await this.mysqlManager.closeAllConnections();
    }
  }
  
}