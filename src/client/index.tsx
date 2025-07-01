// client/index.tsx - 客户端入口文件
import React from 'react';
import { Plugin } from '@nocobase/client';
import { MySQLConnectionsProvider } from './MySQLConnectionsContext';
import { MySQLConnectionList } from './MySQLConnectionList';
import { MySQLDataSourceConfigForm } from './MySQLDataSourceConfigForm';
import { MYSQL_CONNECTOR_CONSTANTS } from '../shared/constants';

export default class MySQLConnectorPlugin extends Plugin {
  async load() {
    // 添加上下文提供者
    this.app.use(MySQLConnectionsProvider);

    // 注册数据源配置组件 - NocoBase 1.7.18正确方式
    try {
      // 方式1: 通过数据源管理器注册
      if (this.app.dataSourceManager) {
        const dsManager = this.app.dataSourceManager as any;
        
        // 注册数据源类型
        if (typeof dsManager.addDataSourceType === 'function') {
          dsManager.addDataSourceType({
            type: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE,
            name: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE,
            displayName: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DISPLAY_NAME,
            description: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DESCRIPTION,
            icon: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.ICON,
            ConfigComponent: MySQLDataSourceConfigForm,
          });
          console.log('[mysql-connector] 数据源类型已注册');
        }

        // 注册数据源提供者
        if (typeof dsManager.addProvider === 'function') {
          dsManager.addProvider(MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE, {
            displayName: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DISPLAY_NAME,
            icon: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.ICON,
            ConfigComponent: MySQLDataSourceConfigForm,
          });
          console.log('[mysql-connector] 数据源提供者已注册');
        }
      }

      // 方式2: 通过插件系统注册
      if (this.app.schemaInitializerManager) {
        const sim = this.app.schemaInitializerManager as any;
        
        // 添加到数据源初始化器
        if (sim.addItem) {
          sim.addItem('DataSourceConnectionProvider', MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE, {
            type: 'item',
            name: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.TYPE,
            title: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.DISPLAY_NAME,
            icon: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.ICON,
            Component: MySQLDataSourceConfigForm,
          });
          console.log('[mysql-connector] 已添加到数据源连接提供者');
        }
      }

    } catch (error) {
      console.warn('[mysql-connector] 数据源注册失败，使用插件设置模式:', error);
    }

    // 按照NocoBase 1.7.18规范注册插件设置
    this.app.pluginSettingsManager?.add(MYSQL_CONNECTOR_CONSTANTS.PLUGIN.NAME, {
      title: {
        'zh-CN': MYSQL_CONNECTOR_CONSTANTS.PLUGIN.DISPLAY_NAME,
        'en-US': MYSQL_CONNECTOR_CONSTANTS.PLUGIN.DISPLAY_NAME_EN
      },
      icon: MYSQL_CONNECTOR_CONSTANTS.DATA_SOURCE.ICON,
      Component: MySQLConnectionList,
      aclSnippet: MYSQL_CONNECTOR_CONSTANTS.PLUGIN.ACL_SNIPPET
    });
  }
}