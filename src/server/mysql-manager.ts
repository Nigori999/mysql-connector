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

  constructor(db: Database) {
    this.db = db;
    // 使用NocoBase的Logger或回退到console
    // 使用 NocoBase 的 Database 实例上的 logger，或回退到 console
    this.logger = db.logger || {
        info: console.info,
        error: console.error,
        warn: console.warn,
        debug: console.debug
      };
    this.loadSavedConnections().catch(error => {
      this.logger.error('[mysql-connector] Failed to load saved connections', { error });
    });
  }

  private async loadSavedConnections() {
    try {
      this.logger.info('[mysql-connector] Loading saved connections');
      
      // 使用更安全的方法检查数据库连接
      if (!this.db || !this.db.sequelize) {
        this.logger.warn('[mysql-connector] Database not available, skipping connection loading');
        return;
      }
      
      // 使用简单的查询测试连接
      try {
        const repository = this.db.getRepository('mysql_connections');
        const savedConnections = await repository.find();
        
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
      } catch (dbError) {
        // 如果查询失败，可能是因为数据库连接已关闭
        this.logger.error('[mysql-connector] Could not load connections, database might be closed:', dbError.message);
        return;
      }
    } catch (error) {
      this.logger.error('[mysql-connector] Error loading saved connections', { 
        error: error.message,
        stack: error.stack
      });
    }
  }

  async connect(connectionInfo: Omit<MySQLConnection, 'id' | 'connection'>) {
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
        await connection.end();
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
        await (connectionInfo.connection as mysql.Pool).end();
        // 立即删除连接引用防止泄漏
        connectionInfo.connection = undefined;
      }
  
      // 从数据库中删除
      try {
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
          password: this.decryptPassword(connectionInfo.password), // 确保使用解密后的密码
          database: connectionInfo.database,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          // 添加超时设置
          connectTimeout: 10000,
          // 添加SSL选项
          ssl: process.env.MYSQL_USE_SSL === 'true' ? {} : undefined
        });
        
        // 测试连接池是否可用
        const connection = await pool.getConnection();
        connection.release();
        
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
    this.logger.info('[mysql-connector] Listing tables', { connectionId });
    
    try {
      const pool = await this.getConnection(connectionId);
      // 使用连接池执行查询
      const [rows] = await pool.query('SHOW TABLES');
      
      // 提取表名
      const tables = [];
      for (const row of rows as any[]) {
        const tableName = Object.values(row)[0] as string;
        tables.push(tableName);
      }
      
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
    this.logger.info('[mysql-connector] Importing table', { 
      connectionId, 
      tableName, 
      collectionName 
    });
    
    try {
      // 获取表结构
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
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(password);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }
  
  private decryptPassword(encryptedPassword: string): string {
    const textParts = encryptedPassword.split(':');
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  async closeAllConnections() {
    this.logger.info('[mysql-connector] Closing all active connections');
    
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
  //表数据预览
  async previewTableData(connectionId: string, tableName: string, limit: number = 10) {
    this.logger.info('[mysql-connector] Getting table data preview', { 
      connectionId, tableName, limit 
    });
    
    try {
      const pool = await this.getConnection(connectionId);
      
      // 使用参数化查询，防止SQL注入
      const [rows] = await pool.execute(
        'SELECT * FROM ?? LIMIT ?', 
        [tableName, limit]
      );
      
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
    
    setInterval(() => {
      this.cleanupIdleConnections();
    }, CLEANUP_INTERVAL);
  }
  
  private async cleanupIdleConnections() {
    this.logger.info('[mysql-connector] Cleaning up idle connections');
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

  private tableSchemaCache: Map<string, {
    timestamp: number,
    schema: any
  }> = new Map();
  
  // 缓存过期时间 (10分钟)
  private SCHEMA_CACHE_TTL = 10 * 60 * 1000;
  
  async getTableSchema(connectionId: string, tableName: string) {
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
      
      // 使用参数化查询防止SQL注入
      const [columns] = await pool.execute('DESCRIBE ??', [tableName]);
      const [indexes] = await pool.execute('SHOW INDEX FROM ??', [tableName]);
      
      const schema = {
        columns: columns as any[],
        indexes: indexes as any[]
      };
      
      // 更新缓存
      this.tableSchemaCache.set(cacheKey, {
        timestamp: now,
        schema
      });
      
      return schema;
    } catch (error) {
      // 错误处理代码...
    }
  }
}