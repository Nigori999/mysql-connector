// server/index.ts 文件修改
import { InstallOptions, Plugin } from '@nocobase/server';
import { resolve } from 'path';
import MySQLManager from './mysql-manager';
import { MySQLDataSource } from './mysql-data-source';
import { MYSQL_CONNECTOR_CONSTANTS } from '../shared/constants';

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
  const logger = ctx.app.logger || console;
  
  logger.error(`[mysql-connector] ${defaultMessage}:`, {
    error: error.message,
    stack: error.stack,
    endpoint: ctx.request?.path,
    method: ctx.request?.method,
    params: ctx.action?.params,
  });
  
  // 使用NocoBase标准错误处理
  if (error.status) {
    ctx.status = error.status;
  } else {
    ctx.status = 400;
  }
  
  ctx.body = {
    errors: [{
      message: error.message || defaultMessage,
      code: error.code,
      field: error.field,
    }]
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
      
      // 检查并更新表结构
      await this.ensureTableStructure();
      
      this.app.logger.info('[mysql-connector] Collections initialized successfully');
    } catch (error) {
      this.app.logger.error('[mysql-connector] Error initializing collections:', error);
    }
  }

  // 确保数据库表结构是最新的
  private async ensureTableStructure() {
    try {
      const collection = this.db.getCollection('mysql_connections');
      if (!collection) {
        this.app.logger.warn('[mysql-connector] mysql_connections collection not found');
        return;
      }

      // 同步表结构，这会添加缺失的字段
      await collection.sync();
      this.app.logger.info('[mysql-connector] Table structure synchronized');
      
    } catch (error) {
      this.app.logger.error('[mysql-connector] Error ensuring table structure:', error);
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
    this.app.logger.info('[mysql-connector] 插件加载中...');
    
    try{
    // 注册MySQL数据源 - NocoBase 1.7.18正确方式
    try {
      // 方式1: 通过插件管理器注册数据源类型
      if (this.app.pm) {
        const pm = this.app.pm as any;
        if (pm.addPlugin) {
          pm.addPlugin({
            type: 'data-source',
            name: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE,
            displayName: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DISPLAY_NAME,
            description: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DESCRIPTION,
            Component: MySQLDataSource
          });
          this.app.logger.info('[mysql-connector] 通过插件管理器注册MySQL数据源成功');
        }
      }

      // 方式2: 直接注册到数据源工厂
      if (this.app.dataSourceManager) {
        const dsManager = this.app.dataSourceManager as any;
        
        if (dsManager.factory) {
          const factory = dsManager.factory as any;
          
          // 注册数据源构造函数
          if (typeof factory.register === 'function') {
            factory.register(MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE, MySQLDataSource);
            this.app.logger.info('[mysql-connector] MySQL数据源已注册到工厂');
          }
          
          // 注册数据源配置
          if (typeof factory.define === 'function') {
            factory.define(MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE, {
              displayName: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DISPLAY_NAME, 
              description: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DESCRIPTION,
              driverName: 'mysql2',
              DataSource: MySQLDataSource
            });
            this.app.logger.info('[mysql-connector] MySQL数据源配置已定义');
          }
        }
      }

      this.app.logger.info('[mysql-connector] MySQL数据源注册完成');
    } catch (dsError: any) {
      this.app.logger.warn('[mysql-connector] 数据源注册失败:', dsError.message);
      this.app.logger.info('[mysql-connector] 将以插件设置模式提供MySQL连接功能');
    }

    this.app.logger.info('[mysql-connector] 插件核心功能正常加载（MySQL连接管理器）');
    
    // 初始化 MySQL 管理器
    this.mysqlManager = new MySQLManager(this.db);

    // 添加错误处理
    try {
        await this.mysqlManager.initialize();
      } catch (initError) {
        this.app.logger.error('[mysql-connector] MySQL manager初始化失败:', initError);
        // 即使初始化失败，也继续注册资源，只是可能部分功能不可用
      }
    
    // 确保只注册一次资源
    if (!this.pluginResourceRegistered) {
      this.registerResources();
      this.pluginResourceRegistered = true;
    }
    
    this.app.logger.info('[mysql-connector] 插件加载完成');
} catch (error) {
    this.app.logger.error('[mysql-connector] 插件加载失败:', error);
    // 即使加载出错，也不抛出异常，避免影响整个应用
  }
  }
  
  // 注册API资源和操作
  private registerResources() {
    // 使用闭包捕获 mysqlManager 避免 this 上下文问题
    const mysqlManager = this.mysqlManager;
    const isShuttingDown = () => this.shuttingDown;
    const logger = this.app.logger;
    
    this.app.resourcer.define({
      name: 'mysql',
      type: 'single',
      only: [],
      actions: {
        // 健康检查接口
        health: {
          middleware: [],
          handler: async (ctx) => {
            const isShutdown = isShuttingDown();
            const dbActive = this.mysqlManager ? this.mysqlManager.isDbConnectionActive() : false;
            
            ctx.body = {
              data: {
                status: isShutdown ? 'shutting_down' : (dbActive ? 'healthy' : 'db_inactive'),
                message: isShutdown ? '系统正在关闭' : (dbActive ? '系统正常' : 'NocoBase 数据库连接不可用')
              }
            };
          }
        },
        connect: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法创建新连接' }] };
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
              ctx.body = { data: connection };
            } catch (error) {
              handleServerError(ctx, error, '连接失败');
            }
          }
        },
        disconnect: {
          middleware: [],
          handler: async (ctx) => {
            const { connectionId } = ctx.action.params;
            try {
              await mysqlManager.disconnect(connectionId);
              ctx.body = { data: { message: '断开连接成功' } };
            } catch (error) {
              handleServerError(ctx, error, '断开连接失败');
            }
          }
        },
        listConnections: {
          middleware: [],
          handler: async (ctx) => {
            try {
              // 如果系统关闭中，返回空列表
              if (isShuttingDown()) {
                ctx.body = { data: [] };
                return;
              }
              
              const connections = await mysqlManager.listConnections();
              ctx.body = { data: connections };
            } catch (error) {
              handleServerError(ctx, error, '获取连接列表失败');
            }
          }
        },
        listTables: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法获取表列表' }] };
              return;
            }
            
            const { connectionId } = ctx.action.params;
            try {
              const tables = await mysqlManager.listTables(connectionId);
              ctx.body = { data: tables };
            } catch (error) {
              handleServerError(ctx, error, '获取表列表失败');
            }
          }
        },
        importTable: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法导入表' }] };
              return;
            }
            
            const { connectionId, tableName, collectionName } = ctx.action.params;
            try {
              const result = await mysqlManager.importTable(connectionId, tableName, collectionName);
              ctx.body = { data: result };
            } catch (error) {
              handleServerError(ctx, error, '导入表失败');
            }
          }
        },
        importTables: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法批量导入表' }] };
              return;
            }
            
            const { connectionId, tableNames } = ctx.action.params;
            try {
              // 批量处理所有表
              const results = await mysqlManager.importTables(connectionId, tableNames);
              ctx.body = { data: results };
            } catch (error) {
              handleServerError(ctx, error, '批量导入失败');
            }
          }
        },
        getTableSchema: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法获取表结构' }] };
              return;
            }
            
            const { connectionId, tableName } = ctx.action.params;
            try {
              const schema = await mysqlManager.getTableSchema(connectionId, tableName);
              ctx.body = { data: schema.columns };
            } catch (error) {
              handleServerError(ctx, error, '获取表结构失败');
            }
          }
        },
        previewTableData: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法获取表数据预览' }] };
              return;
            }
            
            const { connectionId, tableName, limit = 10 } = ctx.action.params;
            try {
              const data = await mysqlManager.previewTableData(connectionId, tableName, limit);
              ctx.body = { data };
            } catch (error) {
              handleServerError(ctx, error, '获取表数据预览失败');
            }
          }
        },
        
        // 连接测试功能
        testConnection: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法测试连接' }] };
              return;
            }
            
            const { database, host, port, username, password } = ctx.action.params;
            try {
              const result = await mysqlManager.testConnection({
                database,
                host,
                port,
                username,
                password
              });
              ctx.body = { data: result };
            } catch (error) {
              handleServerError(ctx, error, '连接测试失败');
            }
          }
        },
        
        // 带进度的批量导入
        importTablesWithProgress: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法执行导入操作' }] };
              return;
            }
            
            const { connectionId, tableNames } = ctx.action.params;
            try {
              const result = await mysqlManager.importTablesWithProgress(connectionId, tableNames);
              ctx.body = { data: result };
            } catch (error) {
              handleServerError(ctx, error, '启动导入任务失败');
            }
          }
        },
        
        // 获取导入进度
        getImportProgress: {
          middleware: [],
          handler: async (ctx) => {
            const { progressId } = ctx.action.params;
            try {
              const progress = mysqlManager.getImportProgress(progressId);
              if (!progress) {
                ctx.status = 404;
                ctx.body = { errors: [{ message: '进度信息不存在' }] };
                return;
              }
              ctx.body = { data: progress };
            } catch (error) {
              handleServerError(ctx, error, '获取进度信息失败');
            }
          }
        },
        
        // 清除导入进度
        clearImportProgress: {
          middleware: [],
          handler: async (ctx) => {
            const { progressId } = ctx.action.params;
            try {
              mysqlManager.clearImportProgress(progressId);
              ctx.body = { data: { message: '进度信息已清除' } };
            } catch (error) {
              handleServerError(ctx, error, '清除进度信息失败');
            }
          }
        },
        
        // 重新连接
        reconnectConnection: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法重连' }] };
              return;
            }
            
            const { connectionId } = ctx.action.params;
            try {
              const success = await mysqlManager.reconnectConnection(connectionId);
              ctx.body = { data: { success, message: success ? '重连成功' : '重连失败' } };
            } catch (error) {
              handleServerError(ctx, error, '重连操作失败');
            }
          }
        },
        
        // 重试失败的导入
        retryFailedImports: {
          middleware: [],
          handler: async (ctx) => {
            if (isShuttingDown()) {
              ctx.status = 503;
              ctx.body = { errors: [{ message: '系统正在关闭，无法重试导入' }] };
              return;
            }
            
            const { progressId, connectionId } = ctx.action.params;
            try {
              await mysqlManager.retryFailedImports(progressId, connectionId);
              ctx.body = { data: { message: '重试任务已启动' } };
            } catch (error) {
              handleServerError(ctx, error, '启动重试任务失败');
            }
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