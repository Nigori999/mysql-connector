// src/server/mysql-manager.ts
import { Database } from '@nocobase/database';
import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';
import { Logger } from '@nocobase/logger';

interface MySQLConnection {
  id: string;
  name?: string;
  database: string;
  host: string;
  port: number;
  username: string;
  password: string;
  connection?: mysql.Connection;
  createdAt?: Date;
  updatedAt?: Date;
}

export default class MySQLManager {
  private db: Database;
  private connections: Map<string, MySQLConnection> = new Map();
  private logger: Logger;

  constructor(db: Database) {
    this.db = db;
    // 使用NocoBase的Logger或回退到console
    this.logger = db.logger || {
        info: console.info,
        error: console.error,
        warn: console.warn,
        debug: console.debug
      } as any;
    this.loadSavedConnections().catch(error => {
      this.logger.error('[mysql-connector] Failed to load saved connections', { error });
    });
  }

  private async loadSavedConnections() {
    try {
      this.logger.info('[mysql-connector] Loading saved connections');
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
    } catch (error) {
      this.logger.error('[mysql-connector] Error loading saved connections', { 
        error: error.message,
        stack: error.stack
      });
      // 不抛出异常，允许插件继续加载
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
      // 创建连接
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

      // 保存到内存
      this.connections.set(id, {
        ...connectionData,
        password: connectionInfo.password, // 内存中保留原始密码用于重连
        connection,
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
      if (connectionInfo.connection) {
        await connectionInfo.connection.end();
        this.logger.info('[mysql-connector] Database connection closed successfully');
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
        throw new Error(`无法从数据库中删除连接记录: ${dbError.message}`);
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

  async getConnection(connectionId: string) {
    this.logger.info('[mysql-connector] Getting connection', { connectionId });
    
    const connectionInfo = this.connections.get(connectionId);
    if (!connectionInfo) {
      this.logger.warn('[mysql-connector] Connection not found', { connectionId });
      throw new Error('找不到指定的连接');
    }

    // 如果连接不存在或已断开，则重新连接
    if (!connectionInfo.connection) {
      this.logger.info('[mysql-connector] Connection not active, reconnecting...');
      try {
        connectionInfo.connection = await mysql.createConnection({
          host: connectionInfo.host,
          port: connectionInfo.port,
          user: connectionInfo.username,
          password: connectionInfo.password,
          database: connectionInfo.database,
          connectTimeout: 10000
        });
        await connectionInfo.connection.connect();
        this.logger.info('[mysql-connector] Reconnection successful');
      } catch (error) {
        this.logger.error('[mysql-connector] Reconnection failed', { 
          error: error.message,
          connectionId
        });
        throw new Error(`重新连接到数据库失败: ${error.message}`);
      }
    }

    return connectionInfo.connection;
  }

  async listTables(connectionId: string) {
    this.logger.info('[mysql-connector] Listing tables', { connectionId });
    
    try {
      const connection = await this.getConnection(connectionId);
      const [rows] = await connection.execute('SHOW TABLES');
      
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

  async getTableSchema(connectionId: string, tableName: string) {
    this.logger.info('[mysql-connector] Getting table schema', { 
      connectionId, 
      tableName 
    });
    
    try {
      const connection = await this.getConnection(connectionId);
      
      // 获取表结构
      const [columns] = await connection.execute(`DESCRIBE \`${tableName}\``);
      this.logger.debug(`[mysql-connector] Table structure retrieved`, {
        columnsCount: (columns as any[]).length
      });
      
      // 获取索引
      const [indexes] = await connection.execute(`SHOW INDEX FROM \`${tableName}\``);
      this.logger.debug(`[mysql-connector] Table indexes retrieved`, {
        indexesCount: (indexes as any[]).length
      });
      
      return {
        columns: columns as any[],
        indexes: indexes as any[]
      };
    } catch (error) {
      this.logger.error('[mysql-connector] Error getting table schema', { 
        error: error.message,
        connectionId,
        tableName
      });
      throw new Error(`获取表结构失败: ${error.message}`);
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
        if (column.Type.includes('int')) {
          fieldType = 'integer';
        } else if (column.Type.includes('decimal') || column.Type.includes('float') || column.Type.includes('double')) {
          fieldType = 'float';
        } else if (column.Type.includes('text') || column.Type.includes('char')) {
          fieldType = 'string';
        } else if (column.Type.includes('date')) {
          fieldType = 'date';
        } else if (column.Type.includes('time')) {
          fieldType = 'time';
        } else if (column.Type.includes('datetime') || column.Type.includes('timestamp')) {
          fieldType = 'datetime';
        } else if (column.Type.includes('boolean') || column.Type.includes('tinyint(1)')) {
          fieldType = 'boolean';
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

  // 加密密码的方法
  private encryptPassword(password: string): string {
    // 实际应用中应该使用更安全的加密方式
    // 这里使用简单的Base64作为示例
    return Buffer.from(password).toString('base64');
  }

  // 解密密码的方法
  private decryptPassword(encryptedPassword: string): string {
    // 与加密对应的解密方法
    return Buffer.from(encryptedPassword, 'base64').toString();
  }
}