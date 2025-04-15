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
            ctx.status = 400;
            ctx.body = { success: false, message: error.message };
          }
        },
        disconnect: async (ctx, next) => {
          const { connectionId } = ctx.action.params;
          try {
            await mysqlManager.disconnect(connectionId);
            ctx.body = { success: true, message: '断开连接成功' };
          } catch (error) {
            ctx.status = 400;
            ctx.body = { success: false, message: error.message };
          }
        },
        listConnections: async (ctx, next) => {
          try {
            const connections = await mysqlManager.listConnections();
            ctx.body = { success: true, data: connections };
          } catch (error) {
            ctx.status = 400;
            ctx.body = { success: false, message: error.message };
          }
        },
        listTables: async (ctx, next) => {
          const { connectionId } = ctx.action.params;
          try {
            const tables = await mysqlManager.listTables(connectionId);
            ctx.body = { success: true, data: tables };
          } catch (error) {
            ctx.status = 400;
            ctx.body = { success: false, message: error.message };
          }
        },
        importTable: async (ctx, next) => {
          const { connectionId, tableName, collectionName } = ctx.action.params;
          try {
            const result = await mysqlManager.importTable(connectionId, tableName, collectionName);
            ctx.body = { success: true, message: '表导入成功', data: result };
          } catch (error) {
            ctx.status = 400;
            ctx.body = { success: false, message: error.message };
          }
        },
        getTableSchema: async (ctx, next) => {
          const { connectionId, tableName } = ctx.action.params;
          try {
            const schema = await mysqlManager.getTableSchema(connectionId, tableName);
            ctx.body = { success: true, data: schema.columns };
          } catch (error) {
            ctx.status = 400;
            ctx.body = { success: false, message: error.message };
          }
        }
      },
    });
  }
}