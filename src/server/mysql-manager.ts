// src/server/mysql-manager.ts
import { Database } from '@nocobase/database';
import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';
import * as crypto from 'crypto';

interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

interface MySQLConnection {
  id: string;
  name?: string;
  database: string;
  host: string;
  port: number;
  username: string;
  password: string;
  connection?: mysql.Connection | mysql.Pool;  // 支持单个连接或连接池
  createdAt?: Date;
  updatedAt?: Date;
  lastUsed?: number;
}

// 使用环境变量保存加密密钥，或者使用NocoBase的配置系统
const ENCRYPTION_KEY = process.env.MYSQL_ENCRYPTION_KEY || 'your-fallback-key';

export default class MySQLManager {
  private db: Database;
  private connections: Map<string, MySQLConnection> = new Map();
  private logger: Logger;
  private isShuttingDown: boolean = false;
  private initialized: boolean = false;
  private tableSchemaCache: Map<string, {
    timestamp: number,
    schema: any
  }> = new Map();
  
  // 缓存过期时间 (10分钟)
  private SCHEMA_CACHE_TTL = 10 * 60 * 1000;

  constructor(db: Database) {
    this.db = db;
    // 使用NocoBase的Logger或回退到console
    this.logger = db.logger || {
      info: console.info,
      error: console.error,
      warn: console.warn,
      debug: console.debug
    };
  }

  // 确保getTableSchema方法直接定义在类中
  public async getTableSchema(connectionId: string, tableName: string): Promise<any> {
    // 安全检查：如果正在关闭则不获取表结构
    if (this.isShuttingDown) {
      throw new Error('系统正在关闭，无法获取表结构');
    }

    // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    throw new Error('NocoBase 数据库连接不可用，无法获取表结构');
  }
    
    const cacheKey = `${connectionId}:${tableName}`;
    const cachedSchema = this.tableSchemaCache.get(cacheKey);
    const now = Date.now();
    
    // 使用缓存如果存在且未过期
    if (cachedSchema && (now - cachedSchema.timestamp) < this.SCHEMA_CACHE_TTL) {
      this.logger.debug(`[mysql-connector] Using cached schema for ${tableName}`);
      return cachedSchema.schema;
    }
    
    // 获取新的表结构
    this.logger.info('[mysql-connector] Getting table schema', { 
      connectionId, tableName 
    });
    
    try {
      const pool = await this.getConnection(connectionId);
      
      // 使用带超时的查询
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Schema query timeout')), 10000);
      });
      
      const queryPromise = (async () => {
        // 使用参数化查询防止SQL注入
        const [columns] = await pool.execute('DESCRIBE ??', [tableName]);
        const [indexes] = await pool.execute('SHOW INDEX FROM ??', [tableName]);
        
        return {
          columns: columns as any[],
          indexes: indexes as any[]
        };
      })();
      
      const schema = await Promise.race([queryPromise, timeoutPromise]);
      
      // 更新缓存
      this.tableSchemaCache.set(cacheKey, {
        timestamp: now,
        schema
      });
      
      return schema;
    } catch (error) {
      this.logger.error('[mysql-connector] Error getting table schema', { 
        error: error.message,
        connectionId,
        tableName
      });
      throw new Error(`获取表结构失败: ${error.message}`);
    }
  }

  // 初始化方法，只应调用一次
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      this.initialized = true;
      await this.loadSavedConnections();
      // 启动定期清理空闲连接
      this.scheduleConnectionCleanup();
    } catch (error) {
      this.logger.error('[mysql-connector] Failed to initialize MySQL manager', { error });
      // 设置为未初始化状态，以便可以重试
      this.initialized = false;
    }
  }

  private async loadSavedConnections() {
    try {
      this.logger.info('[mysql-connector] Loading saved connections');
      
      // 安全检查：如果正在关闭则不加载连接
      if (this.isShuttingDown) {
        this.logger.warn('[mysql-connector] System is shutting down, skipping connection loading');
        return;
      }
      
      // 确保数据库连接可用
      if (!this.isDbConnectionActive()) {
        this.logger.warn('[mysql-connector] Database connection is not active, skipping connection loading');
        return;
      }
      
      // 使用带有错误处理的安全方法获取仓库
      let repository;
      try {
        repository = this.db.getRepository('mysql_connections');
      } catch (repoError) {
        this.logger.error('[mysql-connector] Failed to get repository', { 
          error: repoError.message
        });
        return;
      }
      
      // 使用带有超时的安全查询
      let savedConnections;
      try {
        // 添加超时逻辑
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Query timeout')), 5000);
        });
        
        // 实际查询
        const queryPromise = repository.find();
        
        // 使用Promise.race来实现超时
        savedConnections = await Promise.race([queryPromise, timeoutPromise]);
      } catch (queryError) {
        this.logger.error('[mysql-connector] Failed to query connections', { 
          error: queryError.message 
        });
        return;
      }
      
      this.logger.info(`[mysql-connector] Found ${savedConnections.length} saved connections`);
      
      for (const conn of savedConnections) {
        // 不立即连接，只在需要时连接
        this.connections.set(conn.id, {
          id: conn.id,
          name: conn.name,
          database: conn.database,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: conn.password,
        });
      }
    } catch (error) {
      this.logger.error('[mysql-connector] Error loading saved connections', { 
        error: error.message,
        stack: error.stack
      });
    }
  }

  async connect(connectionInfo: Omit<MySQLConnection, 'id' | 'connection'>) {
    // 安全检查：如果正在关闭则不创建新连接
    if (this.isShuttingDown) {
      throw new Error('系统正在关闭，无法创建新连接');
    }

    // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    throw new Error('NocoBase 数据库连接不可用，无法保存连接信息');
  }
    
    this.logger.info('[mysql-connector] Attempting to connect to database', {
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      username: connectionInfo.username
    });
    
    try {
      // 创建一个临时连接来测试连接参数
      const connection = await mysql.createConnection({
        host: connectionInfo.host,
        port: connectionInfo.port,
        user: connectionInfo.username,
        password: connectionInfo.password,
        database: connectionInfo.database,
        // 添加超时设置
        connectTimeout: 10000,
        // 添加SSL选项
        ssl: process.env.MYSQL_USE_SSL === 'true' ? {} : undefined
      });

      // 测试连接
      await connection.connect();
      // 测试成功后关闭这个临时连接
      await connection.end();
      this.logger.info('[mysql-connector] Connection successful');
      
      // 生成唯一ID
      const id = uuidv4();

      // 保存连接信息
      const connectionData = {
        id,
        name: connectionInfo.name || `${connectionInfo.host}:${connectionInfo.port}/${connectionInfo.database}`,
        database: connectionInfo.database,
        host: connectionInfo.host,
        port: connectionInfo.port,
        username: connectionInfo.username,
        password: this.encryptPassword(connectionInfo.password),
        createdAt: new Date(),
      };

      // 安全检查：确保数据库仍然可用
      if (!this.db || !this.db.sequelize || this.isShuttingDown) {
        throw new Error('数据库连接不可用或系统正在关闭');
      }

      // 保存到数据库
      try {
        const repository = this.db.getRepository('mysql_connections');
        await repository.create({
          values: connectionData,
        });
        this.logger.info('[mysql-connector] Connection info saved to database', { id });
      } catch (dbError) {
        this.logger.error('[mysql-connector] Failed to save connection to database', { 
          error: dbError.message,
          stack: dbError.stack
        });
        throw new Error(`无法保存连接信息: ${dbError.message}`);
      }

      // 保存到内存 (但不保存实际连接对象，只保存连接信息)
      this.connections.set(id, {
        ...connectionData,
        password: connectionInfo.password, // 内存中保留原始密码用于重连
      });

      this.logger.info('[mysql-connector] Connection added to in-memory store', { id });
      return id;
    } catch (error) {
      this.logger.error('[mysql-connector] Connection failed', { 
        error: error.message,
        stack: error.stack,
        host: connectionInfo.host,
        database: connectionInfo.database
      });
      
      // 根据错误类型提供更具体的错误信息
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`无法连接到MySQL服务器: 连接被拒绝. 请检查主机名和端口是否正确.`);
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        throw new Error(`访问被拒绝: 用户名或密码不正确.`);
      } else if (error.code === 'ER_BAD_DB_ERROR') {
        throw new Error(`数据库 "${connectionInfo.database}" 不存在.`);
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error(`连接超时: 无法在指定时间内连接到服务器.`);
      } else {
        throw new Error(`无法连接到MySQL数据库: ${error.message}`);
      }
    }
  }

  async disconnect(connectionId: string) {
    this.logger.info('[mysql-connector] Attempting to disconnect', { connectionId });
    
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) {
      this.logger.warn('[mysql-connector] Connection not found', { connectionId });
      throw new Error('找不到指定的连接');
    }
  
    try {
      // 关闭连接
      if (connectionInfo.connection) {
        try {
          await (connectionInfo.connection as mysql.Pool).end();
        } catch (closeError) {
          this.logger.error('[mysql-connector] Error closing connection', {
            error: closeError.message,
            connectionId
          });
          // 继续执行，不要因为关闭连接失败而中断
        }
        
        // 立即删除连接引用防止泄漏
        connectionInfo.connection = undefined;
      }
  
      // 安全检查：确保数据库仍然可用
      if (this.db && this.db.sequelize && !this.isShuttingDown) {
        try {
          // 从数据库中删除
          const repository = this.db.getRepository('mysql_connections');
          await repository.destroy({
            filter: {
              id: connectionId,
            },
          });
          this.logger.info('[mysql-connector] Connection record deleted from database');
        } catch (dbError) {
          this.logger.error('[mysql-connector] Failed to delete connection from database', { 
            error: dbError.message,
            connectionId
          });
          // 继续执行，不要因为数据库操作失败而中断
        }
      }
  
      // 从内存中移除
      this.connections.delete(connectionId);
      this.logger.info('[mysql-connector] Connection removed from in-memory store');
      
      return { success: true };
    } catch (error) {
      this.logger.error('[mysql-connector] Error during disconnect', { 
        error: error.message,
        stack: error.stack,
        connectionId
      });
      
      // 即使出错，也尝试清理连接
      try {
        this.connections.delete(connectionId);
      } catch (cleanupError) {
        this.logger.error('[mysql-connector] Failed to cleanup connection', cleanupError);
      }
      
      throw new Error(`断开连接时发生错误: ${error.message}`);
    }
  }

  async listConnections() {
    this.logger.info('[mysql-connector] Listing all connections');
    
    // 安全检查：如果正在关闭则不获取连接列表
    if (this.isShuttingDown) {
      this.logger.warn('[mysql-connector] System is shutting down, returning empty connection list');
      return [];
    }
    
    try {
      const connections = Array.from(this.connections.values()).map(conn => ({
        id: conn.id,
        name: conn.name,
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        status: conn.connection ? 'connected' : 'disconnected',
        createdAt: conn.createdAt,
      }));
      
      this.logger.info(`[mysql-connector] Found ${connections.length} connections`);
      return connections;
    } catch (error) {
      this.logger.error('[mysql-connector] Error listing connections', { 
        error: error.message 
      });
      throw new Error(`获取连接列表失败: ${error.message}`);
    }
  }

  async getConnection(connectionId: string): Promise<mysql.Pool> {
    // 安全检查：如果正在关闭则不获取连接
    if (this.isShuttingDown) {
      throw new Error('系统正在关闭，无法获取数据库连接');
    }

    // 检查数据库连接状态
    if (!this.isDbConnectionActive()) {
        throw new Error('NocoBase 数据库连接不可用，无法获取连接信息');
    }
    
    this.logger.info('[mysql-connector] Getting connection', { connectionId });
    
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) {
      this.logger.warn('[mysql-connector] Connection not found', { connectionId });
      throw new Error('找不到指定的连接');
    }
  
    // 如果连接不存在或已断开，则创建一个连接池
    if (!connectionInfo.connection) {
      this.logger.info('[mysql-connector] Connection not active, creating connection pool...');
      try {
        const pool = mysql.createPool({
          host: connectionInfo.host,
          port: connectionInfo.port,
          user: connectionInfo.username,
          password: connectionInfo.password, // 使用原始密码或解密
          database: connectionInfo.database,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          // 添加超时设置
          connectTimeout: 10000,
          // 添加SSL选项
          ssl: process.env.MYSQL_USE_SSL === 'true' ? {} : undefined
        });
        
        // 使用带超时的测试连接池
        try {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection pool test timeout')), 5000);
          });
          
          const testPromise = (async () => {
            const connection = await pool.getConnection();
            connection.release();
            return true;
          })();
          
          await Promise.race([testPromise, timeoutPromise]);
        } catch (testError) {
          this.logger.error('[mysql-connector] Connection pool test failed', {
            error: testError.message,
            connectionId
          });
          throw new Error(`测试连接池失败: ${testError.message}`);
        }
        
        connectionInfo.connection = pool;
        this.logger.info('[mysql-connector] Connection pool created successfully');
      } catch (error) {
        this.logger.error('[mysql-connector] Connection pool creation failed', { 
          error: error.message,
          connectionId
        });
        throw new Error(`创建数据库连接池失败: ${error.message}`);
      }
    }

    // 更新最后使用时间
    connectionInfo.lastUsed = Date.now();
  
    return connectionInfo.connection as mysql.Pool;
  }

  async listTables(connectionId: string) {
    // 安全检查：如果正在关闭则不获取表列表
    if (this.isShuttingDown) {
      throw new Error('系统正在关闭，无法获取表列表');
    }
    
    // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    throw new Error('NocoBase 数据库连接不可用，无法获取表列表');
  }

    this.logger.info('[mysql-connector] Listing tables', { connectionId });
    
    try {
      const pool = await this.getConnection(connectionId);
      
      // 使用带超时的查询
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 10000);
      });
      
      const queryPromise = (async () => {
        // 使用连接池执行查询
        const [rows] = await pool.query('SHOW TABLES');
        
        // 提取表名
        const tables = [];
        for (const row of rows as any[]) {
          const tableName = Object.values(row)[0] as string;
          tables.push(tableName);
        }
        
        return tables;
      })();
      
      const tables = await Promise.race([queryPromise, timeoutPromise]) as string[];
      
      this.logger.info(`[mysql-connector] Found ${tables.length} tables`);
      return tables;
    } catch (error) {
      this.logger.error('[mysql-connector] Error listing tables', { 
        error: error.message,
        connectionId
      });
      throw new Error(`获取表列表失败: ${error.message}`);
    }
  }

  async importTable(connectionId: string, tableName: string, collectionName: string) {
    // 安全检查：如果正在关闭则不导入表
    if (this.isShuttingDown) {
      throw new Error('系统正在关闭，无法导入表');
    }

    // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    throw new Error('NocoBase 数据库连接不可用，无法导入表');
  }
    
    this.logger.info('[mysql-connector] Importing table', { 
      connectionId, 
      tableName, 
      collectionName 
    });
    
    try {
      // 获取表结构 - 这一行是问题所在
      const schema = await this.getTableSchema(connectionId, tableName);
      
      // 转换为 NocoBase 字段格式
      const fields = {};
      const primaryKey = [];
      
      for (const column of schema.columns) {
        const fieldName = column.Field;
        
        // 确定字段类型
        let fieldType = 'string';
        if (column.Type.match(/^int|^bigint|^smallint|^mediumint|^tinyint(?!\(1\))/i)) {
          fieldType = 'integer';
        } else if (column.Type.match(/^decimal|^float|^double/i)) {
          fieldType = 'float';
        } else if (column.Type.match(/^tinyint\(1\)$/i)) {
          fieldType = 'boolean';
        } else if (column.Type.match(/^datetime|^timestamp/i)) {
          fieldType = 'datetime';
        }
        else if (column.Type.includes('date')) {
          fieldType = 'date';
        } else if (column.Type.includes('time')) {
          fieldType = 'time';
        } else if (column.Type.includes('json')) {
          fieldType = 'json';
        }
        
        this.logger.debug(`[mysql-connector] Mapping field ${fieldName}`, {
          originalType: column.Type,
          mappedType: fieldType
        });
        
        // 添加字段
        fields[fieldName] = {
          type: fieldType,
          title: fieldName,
          nullable: column.Null === 'YES',
        };
        
        // 添加默认值
        if (column.Default !== null) {
          fields[fieldName].defaultValue = column.Default;
        }
        
        // 处理主键
        if (column.Key === 'PRI') {
          primaryKey.push(fieldName);
          fields[fieldName].primaryKey = true;
        }
      }
      
      this.logger.info(`[mysql-connector] Converted schema with ${Object.keys(fields).length} fields`);
      
      // 安全检查：确保数据库仍然可用
      if (!this.db || !this.db.sequelize || this.isShuttingDown) {
        throw new Error('数据库连接不可用或系统正在关闭');
      }
      
      // 创建 collection
      try {
        const collectionsRepo = this.db.getRepository('collections');
        await collectionsRepo.create({
          values: {
            name: collectionName,
            title: `MySQL - ${tableName}`,
            fields,
            createdBy: true,
            updatedBy: true,
            sortable: true,
            logging: true,
            repository: 'ExternalMySQL',
            source: 'mysql',
            options: {
              connectionId,
              tableName,
              primaryKey,
            },
          },
        });
        
        this.logger.info('[mysql-connector] Collection created successfully', {
          collectionName
        });
        
        return { 
          success: true, 
          collectionName,
          fieldCount: Object.keys(fields).length
        };
      } catch (collectionError) {
        this.logger.error('[mysql-connector] Failed to create collection', { 
          error: collectionError.message,
          collectionName
        });
        throw new Error(`创建集合失败: ${collectionError.message}`);
      }
    } catch (error) {
      this.logger.error('[mysql-connector] Error importing table', { 
        error: error.message,
        connectionId,
        tableName,
        collectionName
      });
      throw new Error(`导入表失败: ${error.message}`);
    }
  }

  async importTables(connectionId: string, tableNames: string[]) {
    // 安全检查：如果正在关闭则不批量导入表
    if (this.isShuttingDown) {
      throw new Error('系统正在关闭，无法批量导入表');
    }

    // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    throw new Error('NocoBase 数据库连接不可用，无法批量导入表');
  }
    
    this.logger.info('[mysql-connector] Batch importing tables', { 
      connectionId, 
      tableCount: tableNames.length 
    });
    
    const results = {
      successful: [],
      failed: []
    };
    
    // 限制并发
    const CONCURRENCY = 3;
    
    // 分批处理
    for (let i = 0; i < tableNames.length; i += CONCURRENCY) {
      // 安全检查：如果正在关闭则停止导入
      if (this.isShuttingDown) {
        this.logger.warn('[mysql-connector] System is shutting down, stopping batch import');
        break;
      }

      // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    throw new Error('NocoBase 数据库连接不可用，停止批量导入表');
  }
      
      const batch = tableNames.slice(i, i + CONCURRENCY);
      const batchPromises = batch.map(async (tableName) => {
        try {
          // 默认使用表名作为集合名
          const collectionName = `mysql_${tableName}`;
          
          // 调用现有的导入方法
          const result = await this.importTable(connectionId, tableName, collectionName);
          
          results.successful.push({
            tableName,
            collectionName
          });
          
          return { success: true, tableName };
        } catch (error) {
          this.logger.error(`[mysql-connector] Failed to import table ${tableName}:`, error);
          
          results.failed.push({
            tableName,
            error: error.message
          });
          
          return { success: false, tableName, error: error.message };
        }
      });
      
      // 等待当前批次完成
      await Promise.all(batchPromises);
    }
    
    this.logger.info('[mysql-connector] Batch import completed', {
      successful: results.successful.length,
      failed: results.failed.length
    });
    
    return results;
  }

  private encryptPassword(password: string): string {
    if (!password) return '';
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
      let encrypted = cipher.update(password);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
      this.logger.error('[mysql-connector] Error encrypting password', { error: error.message });
      // 返回原始密码作为回退方案
      return password;
    }
  }
  
  private decryptPassword(encryptedPassword: string): string {
    if (!encryptedPassword || !encryptedPassword.includes(':')) return encryptedPassword;
    
    try {
      const textParts = encryptedPassword.split(':');
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (error) {
      this.logger.error('[mysql-connector] Error decrypting password', { error: error.message });
      // 返回原始加密密码作为回退方案
      return encryptedPassword;
    }
  }

  async closeAllConnections() {
    this.logger.info('[mysql-connector] Closing all active connections');
    
    // 标记为正在关闭
    this.isShuttingDown = true;
    
    // 创建所有连接关闭操作的Promise
    const closePromises = [];
    
    // 逐个关闭连接并从map中移除
    for (const [connectionId, connectionInfo] of this.connections.entries()) {
      if (connectionInfo.connection) {
        this.logger.debug(`[mysql-connector] Closing connection ${connectionId}`);
        
        try {
          const pool = connectionInfo.connection as mysql.Pool;
          
          // 使用Promise.race防止无限等待
          const closePromise = Promise.race([
            pool.end().catch(err => {
              this.logger.error(`[mysql-connector] Error closing connection ${connectionId}:`, err);
            }),
            // 5秒超时
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);
          
          closePromises.push(closePromise);
        } catch (error) {
          this.logger.error(`[mysql-connector] Error during connection cleanup ${connectionId}:`, error);
        }
      }
      
      // 无论关闭是否成功，都从map中删除
      this.connections.delete(connectionId);
    }
    
    // 等待所有连接关闭操作完成或超时
    if (closePromises.length > 0) {
      await Promise.allSettled(closePromises);
    }
    
    this.logger.info('[mysql-connector] All connections closed or timed out');
    
    // 清空连接映射
    this.connections.clear();
  }

  // 表数据预览
  async previewTableData(connectionId: string, tableName: string, limit: number = 10) {
    // 安全检查：如果正在关闭则不预览表数据
    if (this.isShuttingDown) {
      throw new Error('系统正在关闭，无法预览表数据');
    }

    // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    throw new Error('NocoBase 数据库连接不可用，无法预览表数据');
  }
    
    this.logger.info('[mysql-connector] Getting table data preview', { 
      connectionId, tableName, limit 
    });
    
    try {
      const pool = await this.getConnection(connectionId);
      
      // 使用带超时的查询
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 10000);
      });
      
      const queryPromise = pool.execute(
        'SELECT * FROM ?? LIMIT ?', 
        [tableName, limit]
      );
      
      const [rows] = await Promise.race([queryPromise, timeoutPromise]) as [any[], any];
      
      return rows;
    } catch (error) {
      this.logger.error('[mysql-connector] Error getting table data preview', { 
        error: error.message,
        connectionId,
        tableName
      });
      throw new Error(`获取表数据预览失败: ${error.message}`);
    }
  }

  private async scheduleConnectionCleanup() {
    // 每30分钟检查一次空闲连接
    const CLEANUP_INTERVAL = 30 * 60 * 1000;
    
    const intervalId = setInterval(() => {
      // 如果正在关闭则停止定时器
      if (this.isShuttingDown) {
        clearInterval(intervalId);
        return;
      }

      // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    clearInterval(intervalId);
        return;
  }
      
      this.cleanupIdleConnections();
    }, CLEANUP_INTERVAL);
    
    // 确保进程退出时清除定时器
    process.on('beforeExit', () => {
      clearInterval(intervalId);
    });
  }
  
  private async cleanupIdleConnections() {
    this.logger.info('[mysql-connector] Cleaning up idle connections');
    
    // 如果正在关闭则不清理
    if (this.isShuttingDown) {
      return;
    }

    // 检查数据库连接状态
  if (!this.isDbConnectionActive()) {
    return;
  }
    
    const now = Date.now();
    const IDLE_TIMEOUT = 60 * 60 * 1000; // 1小时不活动则关闭
    
    for (const [connectionId, connectionInfo] of this.connections.entries()) {
      if (connectionInfo.connection && connectionInfo.lastUsed) {
        if ((now - connectionInfo.lastUsed) > IDLE_TIMEOUT) {
          this.logger.info(`[mysql-connector] Closing idle connection: ${connectionId}`);
          try {
            await (connectionInfo.connection as mysql.Pool).end();
            // 只移除连接对象，保留连接信息
            connectionInfo.connection = undefined;
          } catch (error) {
            this.logger.error(`[mysql-connector] Error closing idle connection: ${connectionId}`, error);
          }
        }
      }
    }
  }

  public isDbConnectionActive(): boolean {
    if (!this.db || !this.db.sequelize) {
      return false;
    }
    
    try {
      // 尝试检查连接管理器状态
      const connManager = this.db.sequelize.connectionManager as any;
      
      // 任何以下情况表示连接不可用
      if (!connManager || 
          connManager.pool?.draining || 
          connManager.pool?.pool?.state === 'closing' || 
          connManager.pool?.pool?.state === 'closed') {
        return false;
      }
      
      const dialect = (this.db.sequelize as any).options?.dialect;
      // 如果是 SQLite，检查连接是否已关闭
      if (dialect === 'sqlite' && 
        connManager.connections?.default?.[0]?.closed) {
        return false;
      }
      
      return true;
    } catch (error) {
      // 如果检查过程中出现任何错误，假设连接不可用
      this.logger.warn('[mysql-connector] Error checking DB connection status:', error.message);
      return false;
    }
  }
}