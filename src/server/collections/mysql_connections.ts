// server/collections/mysql_connections.ts - 连接配置表定义
export default {
    name: 'mysql_connections',
    title: 'MySQL 连接',
    fields: [
      {
        name: 'id',
        type: 'string',
        primaryKey: true,
      },
      {
        name: 'name',
        type: 'string',
        title: '连接名称',
        required: true,
      },
      {
        name: 'host',
        type: 'string',
        title: '主机',
        required: true,
      },
      {
        name: 'port',
        type: 'integer',
        title: '端口',
        defaultValue: 3306,
        required: true,
      },
      {
        name: 'database',
        type: 'string',
        title: '数据库名',
        required: true,
      },
      {
        name: 'username',
        type: 'string',
        title: '用户名',
        required: true,
      },
      {
        name: 'password',
        type: 'password',
        title: '密码',
        required: true,
      },
      {
        name: 'createdAt',
        type: 'date',
        field: 'createdAt',
      },
      {
        name: 'updatedAt',
        type: 'date',
        field: 'updatedAt',
      },
    ],
  };