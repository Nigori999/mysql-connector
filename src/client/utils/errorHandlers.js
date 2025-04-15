"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTableOperationErrorMappings = exports.getMySQLConnectionErrorMappings = exports.handleAPIError = exports.MySQLErrorPatterns = void 0;
// src/client/utils/errorHandlers.ts
const antd_1 = require("antd");
// MySQL错误处理类型
exports.MySQLErrorPatterns = {
    CONNECTION_REFUSED: 'ECONNREFUSED',
    ACCESS_DENIED: 'Access denied',
    DB_NOT_EXISTS: 'not exists',
    TIMEOUT: 'ETIMEDOUT',
    TABLE_EXISTS: 'already exists',
    NO_PRIVILEGES: 'privileges',
};
// 处理API错误
const handleAPIError = (error, t, errorMappings = [], defaultMessage = '未知错误') => {
    if (!error) {
        return { showNotification: false };
    }
    // 获取错误信息
    const errorMessage = error.message || error.toString();
    // 检查是否匹配预定义错误
    for (const mapping of errorMappings) {
        const isMatch = typeof mapping.pattern === 'string'
            ? errorMessage.includes(mapping.pattern)
            : mapping.pattern.test(errorMessage);
        if (isMatch) {
            // 如果有表单字段错误映射，返回它们
            if (mapping.fields) {
                return {
                    formErrors: mapping.fields,
                    showNotification: !!mapping.notification
                };
            }
            // 如果有定制通知，显示它
            if (mapping.notification) {
                antd_1.notification[mapping.notification.type]({
                    message: mapping.notification.message,
                    description: mapping.notification.description,
                    duration: mapping.notification.duration || 5
                });
                return { showNotification: false };
            }
        }
    }
    // 默认错误通知
    antd_1.notification.error({
        message: t('操作失败'),
        description: errorMessage || t(defaultMessage),
        duration: 5
    });
    return { showNotification: false };
};
exports.handleAPIError = handleAPIError;
// MySQL连接错误映射
const getMySQLConnectionErrorMappings = (t) => [
    {
        pattern: exports.MySQLErrorPatterns.CONNECTION_REFUSED,
        fields: {
            host: t('无法连接到指定主机'),
            port: t('无法连接到指定端口')
        }
    },
    {
        pattern: exports.MySQLErrorPatterns.ACCESS_DENIED,
        fields: {
            username: t('用户名或密码不正确'),
            password: t('用户名或密码不正确')
        }
    },
    {
        pattern: exports.MySQLErrorPatterns.DB_NOT_EXISTS,
        fields: {
            database: t('数据库不存在')
        }
    },
    {
        pattern: exports.MySQLErrorPatterns.TIMEOUT,
        notification: {
            type: 'error',
            message: t('连接超时'),
            description: t('连接到数据库服务器超时，请检查网络或服务器状态'),
            duration: 5
        }
    },
    {
        pattern: exports.MySQLErrorPatterns.NO_PRIVILEGES,
        notification: {
            type: 'warning',
            message: t('权限不足'),
            description: t('当前数据库用户没有足够的权限执行此操作'),
            duration: 5
        }
    }
];
exports.getMySQLConnectionErrorMappings = getMySQLConnectionErrorMappings;
// 表格操作错误映射
const getTableOperationErrorMappings = (t) => [
    {
        pattern: exports.MySQLErrorPatterns.TABLE_EXISTS,
        notification: {
            type: 'error',
            message: t('导入失败'),
            description: t('同名集合已存在，请尝试使用不同的名称'),
            duration: 5
        }
    }
];
exports.getTableOperationErrorMappings = getTableOperationErrorMappings;
