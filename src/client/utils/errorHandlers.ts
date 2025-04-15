// src/client/utils/errorHandlers.ts
import { notification } from 'antd';
import { TFunction } from 'react-i18next';

// 定义错误类型和对应信息
export interface ErrorMapping {
  pattern: RegExp | string;
  fields?: Record<string, string>;
  notification?: {
    message: string;
    description: string;
    type: 'error' | 'warning' | 'info' | 'success';
    duration?: number;
  };
}

// MySQL错误处理类型
export const MySQLErrorPatterns = {
  CONNECTION_REFUSED: 'ECONNREFUSED',
  ACCESS_DENIED: 'Access denied',
  DB_NOT_EXISTS: 'not exists',
  TIMEOUT: 'ETIMEDOUT',
  TABLE_EXISTS: 'already exists',
  NO_PRIVILEGES: 'privileges',
};

// 处理API错误
export const handleAPIError = (
  error: any, 
  t: TFunction, 
  errorMappings: ErrorMapping[] = [],
  defaultMessage = '未知错误'
): { 
  formErrors?: Record<string, string>; 
  showNotification: boolean;
} => {
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
        notification[mapping.notification.type]({
          message: mapping.notification.message,
          description: mapping.notification.description,
          duration: mapping.notification.duration || 5
        });
        return { showNotification: false };
      }
    }
  }
  
  // 默认错误通知
  notification.error({
    message: t('操作失败'),
    description: errorMessage || t(defaultMessage),
    duration: 5
  });
  
  return { showNotification: false };
};

// MySQL连接错误映射
export const getMySQLConnectionErrorMappings = (t: TFunction): ErrorMapping[] => [
  {
    pattern: MySQLErrorPatterns.CONNECTION_REFUSED,
    fields: {
      host: t('无法连接到指定主机'),
      port: t('无法连接到指定端口')
    }
  },
  {
    pattern: MySQLErrorPatterns.ACCESS_DENIED,
    fields: {
      username: t('用户名或密码不正确'),
      password: t('用户名或密码不正确')
    }
  },
  {
    pattern: MySQLErrorPatterns.DB_NOT_EXISTS,
    fields: {
      database: t('数据库不存在')
    }
  },
  {
    pattern: MySQLErrorPatterns.TIMEOUT,
    notification: {
      type: 'error',
      message: t('连接超时'),
      description: t('连接到数据库服务器超时，请检查网络或服务器状态'),
      duration: 5
    }
  },
  {
    pattern: MySQLErrorPatterns.NO_PRIVILEGES,
    notification: {
      type: 'warning',
      message: t('权限不足'),
      description: t('当前数据库用户没有足够的权限执行此操作'),
      duration: 5
    }
  }
];

// 表格操作错误映射
export const getTableOperationErrorMappings = (t: TFunction): ErrorMapping[] => [
  {
    pattern: MySQLErrorPatterns.TABLE_EXISTS,
    notification: {
      type: 'error',
      message: t('导入失败'),
      description: t('同名集合已存在，请尝试使用不同的名称'),
      duration: 5
    }
  }
];