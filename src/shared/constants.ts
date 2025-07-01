// constants.ts - 插件常量配置
export const MYSQL_CONNECTOR_CONSTANTS = {
  // 数据源配置
  DATA_SOURCE: {
    TYPE: 'mysql-external',
    DISPLAY_NAME: 'MySQL 外部数据库',
    DESCRIPTION: '连接外部 MySQL 数据库作为数据源',
    ICON: 'DatabaseOutlined'
  },
  
  // 插件配置
  PLUGIN: {
    NAME: 'mysql-connector',
    DISPLAY_NAME: 'MySQL 数据库连接器',
    DISPLAY_NAME_EN: 'MySQL Database Connector',
    ACL_SNIPPET: 'pm.mysql-connector'
  },
  
  // 默认配置
  DEFAULTS: {
    MYSQL_PORT: 3306,
    CONNECTION_TIMEOUT: 10000,
    PREVIEW_LIMIT: 10
  }
} as const; 