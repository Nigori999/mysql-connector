// client/index.tsx - 客户端入口文件
import React from 'react';
import { Plugin } from '@nocobase/client';
import { MySQLConnectionsProvider } from './MySQLConnectionsContext';
import { MySQLConnectionList } from './MySQLConnectionList';

// 为Application类型添加缺失的方法声明
declare module '@nocobase/client' {
  interface Application {
    addMenuItem(name: string, item: any): void;
    addComponents(components: Record<string, React.ComponentType<any>>): void;
    addProvider(provider: React.ComponentType<any>): void;
    setPluginSettings(pluginName: string, settings: any): void;
  }
}

export default class MySQLConnectorPlugin extends Plugin {
  async load() {
    // 添加上下文提供者
    this.app.use(MySQLConnectionsProvider);

    // 添加路由
    this.app.pluginSettingsManager?.add('mysql-connector', {
        title: '外部 MySQL 连接',
        icon: 'DatabaseOutlined',
        Component: MySQLConnectionList,
      });

    // 添加设置菜单项
    // NocoBase 1.6.2 可能使用不同的设置注册方式，尝试使用多种方式
    if (typeof this.app.setPluginSettings === 'function') {
      // 如果支持 setPluginSettings 方法，使用字符串图标
      // 然后在设置中保持相同的路径
        this.app.setPluginSettings('mysql-connector', {
            title: '外部 MySQL 连接',
            icon: 'DatabaseOutlined',
            Component: MySQLConnectionList,
            aclSnippet: 'pm.mysql-connector',
            path: '/admin/mysql-connections' // 确保这里与路由路径一致
        });
    } else {
      // 尝试使用通用的路由和菜单添加方式
      this.app.router.add('admin.settings.mysql-connector', {
        path: '/admin/settings/mysql-connector',
        Component: MySQLConnectionList,
      });
      
      // 添加菜单项
      if (this.app.pluginSettingsManager) {
        this.app.pluginSettingsManager.add('mysql-connector', {
          title: '外部 MySQL 连接',
          icon: 'DatabaseOutlined', // 使用字符串而不是React组件
          Component: MySQLConnectionList,
        });
      }
    }
  }
}