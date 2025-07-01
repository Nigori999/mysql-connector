// mysql-data-source.ts - MySQL数据源实现
import mysql from 'mysql2/promise';
import { MYSQL_CONNECTOR_CONSTANTS } from '../shared/constants';

export class MySQLDataSource {
  static type = MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE;
  static displayName = MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DISPLAY_NAME; 
  static description = MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DESCRIPTION;
  
  private connection: mysql.Connection | null = null;
  
  constructor(public options: any) {
    this.options = options;
  }

  async connect() {
    if (!this.connection) {
      this.connection = await mysql.createConnection({
        host: this.options.host,
        port: this.options.port || MYSQL_CONNECTOR_CONSTANTS.DEFAULTS.MYSQL_PORT,
        user: this.options.username,
        password: this.options.password,
        database: this.options.database
      });
    }
    return this.connection;
  }

  async testConnection() {
    try {
      const conn = await this.connect();
      const [rows] = await conn.execute('SELECT 1');
      return { success: true, message: '连接测试成功' };
    } catch (error) {
      return { success: false, message: `连接失败: ${error.message}` };
    }
  }

  async getCollections() {
    try {
      const conn = await this.connect();
      const [tables] = await conn.execute('SHOW TABLES');
      return (tables as any[]).map(table => {
        const tableName = Object.values(table)[0] as string;
        return {
          name: tableName,
          title: tableName,
          type: 'table'
        };
      });
    } catch (error) {
      console.error('获取集合失败:', error);
      return [];
    }
  }

  async getCollection(name: string) {
    try {
      const conn = await this.connect();
      const [columns] = await conn.execute('DESCRIBE ??', [name]);
      
      return {
        name,
        title: name,
        fields: (columns as any[]).map(col => ({
          name: col.Field,
          type: this.mapMySQLTypeToNocoBase(col.Type),
          allowNull: col.Null === 'YES',
          primaryKey: col.Key === 'PRI'
        }))
      };
    } catch (error) {
      console.error('获取集合详情失败:', error);
      return null;
    }
  }

  private mapMySQLTypeToNocoBase(mysqlType: string): string {
    const type = mysqlType.toLowerCase();
    
    if (type.includes('int')) return 'integer';
    if (type.includes('varchar') || type.includes('text')) return 'string';
    if (type.includes('datetime') || type.includes('timestamp')) return 'date';
    if (type.includes('decimal') || type.includes('float') || type.includes('double')) return 'float';
    if (type.includes('json')) return 'json';
    if (type.includes('boolean') || type.includes('tinyint(1)')) return 'boolean';
    
    return 'string';
  }

  async close() {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }
} 