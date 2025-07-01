// server/collections/mysql_connections.ts - 连接配置表定义
import { defineCollection } from '@nocobase/database';

export default defineCollection({
  namespace: 'mysql-connector',
  dumpRules: 'required',
    name: 'mysql_connections',
    title: 'MySQL 连接',
  timestamps: true,
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
      allowNull: false,
      unique: true,
      },
      {
        name: 'host',
        type: 'string',
        title: '主机',
      allowNull: false,
      },
      {
        name: 'port',
        type: 'integer',
        title: '端口',
        defaultValue: 3306,
      allowNull: false,
      },
      {
        name: 'database',
        type: 'string',
        title: '数据库名',
      allowNull: false,
      },
      {
        name: 'username',
        type: 'string',
        title: '用户名',
      allowNull: false,
      },
      {
        name: 'password',
        type: 'password',
        title: '密码',
      allowNull: false,
      },
      {
      name: 'status',
      type: 'string',
      title: '状态',
      defaultValue: 'disconnected',
      },
    ],
});