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

// 添加类型声明来处理 ConnectionManager 的 pool 属性
declare module 'sequelize' {
  interface ConnectionManager {
    pool?: {
      draining?: boolean;
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
  private pluginResourceRegistered: boolean = false;
  private shuttingDown: boolean = false;
  private cleanupHandlers: Array<() => Promise<void>> = [];

  // 关闭所有连接的方法
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
    this.app.logger.info('[mysql-connector] Installing plugin');
    // 创建必要的数据库表
    try {
      await this.db.import({
        directory: resolve(__dirname, 'collections'),
      });
      this.app.logger.info('[mysql-connector] Plugin installation completed successfully');
    } catch (error) {
      this.app.logger.error('[mysql-connector] Error during plugin installation:', error);
      throw error;
    }
  }

  async afterAdd() {
    this.app.logger.info('[mysql-connector] Plugin added, initializing collections');
    // 添加插件时初始化，但不加载连接
    try {
      await this.db.import({
        directory: resolve(__dirname, 'collections'),
      });
      this.app.logger.info('[mysql-connector] Collections initialized successfully');
    } catch (error) {
      this.app.logger.error('[mysql-connector] Error initializing collections:', error);
    }
  }

  async beforeLoad() {
    // 在真正加载插件前进行准备
    if (this.initialized) {
      // 防止多次初始化
      return;
    }
    
    // 注册清理处理程序
    this.registerCleanupHandlers();
    
    this.initialized = true;
    this.app.logger.info('[mysql-connector] Plugin pre-initialization completed');
  }

  // 注册清理处理程序
  private registerCleanupHandlers() {
    // 应用关闭事件
    const beforeStopHandler = async () => {
      if (!this.shuttingDown) {
        this.shuttingDown = true;
        this.app.logger.info('[mysql-connector] Application is stopping, cleaning up resources');
        await this.closeAllConnections();
      }
    };
    
    this.app.on('beforeStop', beforeStopHandler);
    this.cleanupHandlers.push(beforeStopHandler);
    
    // 进程信号处理
    const sigintHandler = async () => {
      this.app.logger.info('[mysql-connector] SIGINT received, cleaning up resources');
      if (!this.shuttingDown) {
        this.shuttingDown = true;
        await this.closeAllConnections();
        // 不要在这里调用 process.exit()，让应用正常关闭
      }
    };
    
    const sigtermHandler = async () => {
      this.app.logger.info('[mysql-connector] SIGTERM received, cleaning up resources');
      if (!this.shuttingDown) {
        this.shuttingDown = true;
        await this.closeAllConnections();
        // 不要在这里调用 process.exit()，让应用正常关闭
      }
    };
    
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);
    
    // 存储清理处理程序引用以便后续移除
    this.cleanupHandlers.push(() => {
      process.removeListener('SIGINT', sigintHandler);
      process.removeListener('SIGTERM', sigtermHandler);
      return Promise.resolve();
    });
  }

  // 卸载清理处理程序
  private unregisterCleanupHandlers() {
    this.app.logger.info('[mysql-connector] Unregistering cleanup handlers');
    
    // 执行所有清理处理程序
    for (const handler of this.cleanupHandlers) {
      try {
        handler().catch(error => {
          this.app.logger.error('[mysql-connector] Error in cleanup handler:', error);
        });
      } catch (error) {
        this.app.logger.error('[mysql-connector] Error executing cleanup handler:', error);
      }
    }
    
    // 清空处理程序列表
    this.cleanupHandlers = [];
  }
  
  // 在卸载插件前清理资源
  async beforeRemove() {
    this.app.logger.info('[mysql-connector] Plugin is being removed, cleaning up resources');
    this.shuttingDown = true;
    // 在移除插件前关闭所有连接
    await this.closeAllConnections();
    this.unregisterCleanupHandlers();
  }

  // 插件卸载
  async remove() {
    this.app.logger.info('[mysql-connector] Removing plugin');
    
    // 确保已关闭所有MySQL连接
    if (!this.shuttingDown) {
      this.shuttingDown = true;
      await this.closeAllConnections();
    }
    
    // 标记插件已卸载，防止后续操作
    this.mysqlManager = null;
    
    try {
      // 检查数据库实例是否可用
      if (this.db && this.db.sequelize) {
        // 检查连接状态 - 使用更安全的方法
        let isConnected = false;
        try {
          // 使用类型断言绕过类型检查
          const connManager = this.db.sequelize.connectionManager as any;
          isConnected = connManager && !connManager.pool?.draining;
        } catch (err) {
          this.app.logger.warn('[mysql-connector] Error checking connection status:', err.message);
          isConnected = false;
        }
                         
        if (isConnected) {
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
        } else {
          this.app.logger.warn('[mysql-connector] Database connection pool is not available, skipping table drop');
        }
      }
    } catch (error) {
      this.app.logger.error('[mysql-connector] Error removing plugin tables:', error);
    }
    
    // 卸载所有清理处理程序
    this.unregisterCleanupHandlers();
    
    this.app.logger.info('[mysql-connector] Plugin removal completed');
  }

  // 主加载方法
  async load() {  
    this.app.logger.info('[mysql-connector] Loading plugin');
    
    // 初始化 MySQL 管理器
    this.mysqlManager = new MySQLManager(this.db);
    await this.mysqlManager.initialize();
    
    // 确保只注册一次资源
    if (!this.pluginResourceRegistered) {
      this.registerResources();
      this.pluginResourceRegistered = true;
    }
    
    this.app.logger.info('[mysql-connector] Plugin loaded successfully');
  }
  
  // 注册API资源和操作
  private registerResources() {
    // 使用闭包捕获 mysqlManager 避免 this 上下文问题
    const mysqlManager = this.mysqlManager;
    const isShuttingDown = () => this.shuttingDown;
    const logger = this.app.logger;
    
    this.app.resourcer.define({
      name: 'mysql',
      actions: {
        connect: async (ctx, next) => {
          if (isShuttingDown()) {
            ctx.status = 503;
            ctx.body = { success: false, message: '系统正在关闭，无法创建新连接' };
            return;
          }
          
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
            // 如果系统关闭中，返回空列表
            if (isShuttingDown()) {
              ctx.body = { success: true, data: [] };
              return;
            }
            
            const connections = await mysqlManager.listConnections();
            ctx.body = { success: true, data: connections };
          } catch (error) {
            handleServerError(ctx, error, '获取连接列表失败');
          }
        },
        listTables: async (ctx, next) => {
          if (isShuttingDown()) {
            ctx.status = 503;
            ctx.body = { success: false, message: '系统正在关闭，无法获取表列表' };
            return;
          }
          
          const { connectionId } = ctx.action.params;
          try {
            const tables = await mysqlManager.listTables(connectionId);
            ctx.body = { success: true, data: tables };
          } catch (error) {
            handleServerError(ctx, error, '获取表列表失败');
          }
        },
        importTable: async (ctx, next) => {
          if (isShuttingDown()) {
            ctx.status = 503;
            ctx.body = { success: false, message: '系统正在关闭，无法导入表' };
            return;
          }
          
          const { connectionId, tableName, collectionName } = ctx.action.params;
          try {
            const result = await mysqlManager.importTable(connectionId, tableName, collectionName);
            ctx.body = { success: true, message: '表导入成功', data: result };
          } catch (error) {
            handleServerError(ctx, error, '导入表失败');
          }
        },
        importTables: async (ctx, next) => {
          if (isShuttingDown()) {
            ctx.status = 503;
            ctx.body = { success: false, message: '系统正在关闭，无法批量导入表' };
            return;
          }
          
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
          if (isShuttingDown()) {
            ctx.status = 503;
            ctx.body = { success: false, message: '系统正在关闭，无法获取表结构' };
            return;
          }
          
          const { connectionId, tableName } = ctx.action.params;
          try {
            const schema = await mysqlManager.getTableSchema(connectionId, tableName);
            ctx.body = { success: true, data: schema.columns };
          } catch (error) {
            handleServerError(ctx, error, '获取表结构失败');
          }
        },
        previewTableData: async (ctx, next) => {
          if (isShuttingDown()) {
            ctx.status = 503;
            ctx.body = { success: false, message: '系统正在关闭，无法获取表数据预览' };
            return;
          }
          
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
    
    logger.info('[mysql-connector] Resources registered successfully');
  }

  // 卸载前的清理工作
  async beforeUnload() {
    this.app.logger.info('[mysql-connector] Plugin is being unloaded');
    
    this.shuttingDown = true;
    if (this.mysqlManager) {
      await this.closeAllConnections();
    }
    
    // 卸载清理处理程序
    this.unregisterCleanupHandlers();
    
    this.app.logger.info('[mysql-connector] Plugin unload preparation completed');
  }
}