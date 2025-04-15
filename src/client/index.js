"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@nocobase/client");
const MySQLConnectionsContext_1 = require("./MySQLConnectionsContext");
const MySQLConnectionList_1 = require("./MySQLConnectionList");
class MySQLConnectorPlugin extends client_1.Plugin {
    async load() {
        var _a;
        // 添加上下文提供者
        this.app.use(MySQLConnectionsContext_1.MySQLConnectionsProvider);
        // 添加路由
        (_a = this.app.pluginSettingsManager) === null || _a === void 0 ? void 0 : _a.add('mysql-connector', {
            title: '外部 MySQL 连接',
            icon: 'DatabaseOutlined',
            Component: MySQLConnectionList_1.MySQLConnectionList,
        });
        // 添加设置菜单项
        // NocoBase 1.6.2 可能使用不同的设置注册方式，尝试使用多种方式
        if (typeof this.app.setPluginSettings === 'function') {
            // 如果支持 setPluginSettings 方法，使用字符串图标
            // 然后在设置中保持相同的路径
            this.app.setPluginSettings('mysql-connector', {
                title: '外部 MySQL 连接',
                icon: 'DatabaseOutlined',
                Component: MySQLConnectionList_1.MySQLConnectionList,
                aclSnippet: 'pm.mysql-connector',
                path: '/admin/mysql-connections' // 确保这里与路由路径一致
            });
        }
        else {
            // 尝试使用通用的路由和菜单添加方式
            this.app.router.add('admin.settings.mysql-connector', {
                path: '/admin/settings/mysql-connector',
                Component: MySQLConnectionList_1.MySQLConnectionList,
            });
            // 添加菜单项
            if (this.app.pluginSettingsManager) {
                this.app.pluginSettingsManager.add('mysql-connector', {
                    title: '外部 MySQL 连接',
                    icon: 'DatabaseOutlined', // 使用字符串而不是React组件
                    Component: MySQLConnectionList_1.MySQLConnectionList,
                });
            }
        }
    }
}
exports.default = MySQLConnectorPlugin;
