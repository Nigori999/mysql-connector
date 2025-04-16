// client/MySQLConnectionsContext.tsx - 状态管理
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAPIClient } from '@nocobase/client';
import { notification } from 'antd';

interface MySQLConnection {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    status?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

interface MySQLConnectionsContextType {
    connections: MySQLConnection[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    connect: (connectionInfo: any) => Promise<any>;
    disconnect: (connectionId: string) => Promise<any>;
    listTables: (connectionId: string) => Promise<any>;
    importTable: (params: {connectionId: string, tableName: string, collectionName: string}) => Promise<any>;
    importTables: (params: {connectionId: string, tableNames: string[]}) => Promise<any>;
    listTableColumns: (connectionId: string, tableName: string) => Promise<any>;
    clearError: () => void;
}

const MySQLConnectionsContext = createContext<MySQLConnectionsContextType | undefined>(undefined);

interface MySQLConnectionsProviderProps {
  children: ReactNode;
}

export const MySQLConnectionsProvider: React.FC<MySQLConnectionsProviderProps> = (props) => {
  const [connections, setConnections] = useState<MySQLConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useAPIClient();

  // 清除错误的函数
  const clearError = () => setError(null);

  // 通用错误处理函数
  const handleError = (error: any, operation: string) => {
    console.error(`[mysql-connector] ${operation} failed:`, error);
    
    // 提取错误消息
    let errorMessage = '';
    if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    } else {
      errorMessage = `${operation}失败，请稍后重试`;
    }
    
    // 设置错误状态
    setError(errorMessage);
    
    // 显示通知
    notification.error({
      message: `${operation}失败`,
      description: errorMessage,
      duration: 5
    });
    
    // 返回一个已拒绝的Promise以便调用者可以处理
    return Promise.reject(error);
  };

  const listTableColumns = async (connectionId: string, tableName: string) => {
    try {
      setLoading(true);
      
      const response = await api.request({
        resource: 'mysql',
        action: 'getTableSchema',
        params: {
          connectionId,
          tableName
        }
      });
      
      return response.data?.data || [];
    } catch (error) {
      return handleError(error, '获取表结构');
    } finally {
      setLoading(false);
    }
  };

  const fetchConnections = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data } = await api.request({
        resource: 'mysql',
        action: 'listConnections'
      });
      
      setConnections(data?.data || []);
    } catch (error) {
      handleError(error, '获取连接列表');
    } finally {
      setLoading(false);
    }
  };

  const connect = async (connectionInfo: any) => {
    try {
      setError(null);
      
      const response = await api.request({
        resource: 'mysql',
        action: 'connect',
        data: connectionInfo
      });
      
      return response;
    } catch (error) {
      return handleError(error, '连接数据库');
    }
  };

  const disconnect = async (connectionId: string) => {
    try {
      setError(null);
      
      const response = await api.request({
        resource: 'mysql',
        action: 'disconnect',
        params: {
          connectionId
        }
      });
      
      return response;
    } catch (error) {
      return handleError(error, '断开连接');
    }
  };

  const listTables = async (connectionId: string) => {
    try {
      setError(null);
      
      const response = await api.request({
        resource: 'mysql',
        action: 'listTables',
        params: {
          connectionId
        }
      });
      
      return response;
    } catch (error) {
      return handleError(error, '获取表列表');
    }
  };

  const importTable = async (params: {connectionId: string, tableName: string, collectionName: string}) => {
    try {
      setError(null);
      
      const response = await api.request({
        resource: 'mysql',
        action: 'importTable',
        params
      });
      
      return response;
    } catch (error) {
      return handleError(error, '导入表');
    }
  };

  const importTables = async (params: {connectionId: string, tableNames: string[]}) => {
    try {
      setError(null);
      
      const response = await api.request({
        resource: 'mysql',
        action: 'importTables',
        params
      });
      
      return response;
    } catch (error) {
      return handleError(error, '批量导入表');
    }
  };

  // 初始加载连接列表
  useEffect(() => {
    fetchConnections().catch(err => {
      console.error('[mysql-connector] Initial connection load failed:', err);
    });
    
    // 清理函数
    return () => {
      // 组件卸载时执行清理
    };
  }, []);

  // 提供上下文值
  return (
    <MySQLConnectionsContext.Provider
      value={{
        connections,
        loading,
        error,
        refresh: fetchConnections,
        connect,
        disconnect,
        listTables,
        importTable,
        importTables,
        listTableColumns,
        clearError
      }}
    >
      {props.children}
    </MySQLConnectionsContext.Provider>
  );
};

export const useMySQLConnections = () => {
  const context = useContext(MySQLConnectionsContext);
  if (context === undefined) {
    throw new Error('useMySQLConnections must be used within a MySQLConnectionsProvider');
  }
  return context;
};