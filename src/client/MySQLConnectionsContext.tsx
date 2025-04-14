// client/MySQLConnectionsContext.tsx - 状态管理
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAPIClient } from '@nocobase/client';

interface MySQLConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
}

interface MySQLConnectionsContextType {
    connections: MySQLConnection[];
    loading: boolean;
    refresh: () => void;
    connect: (connectionInfo: any) => Promise<any>;
    disconnect: (connectionId: string) => Promise<any>;
    listTables: (connectionId: string) => Promise<any>;
    importTable: (params: {connectionId: string, tableName: string, collectionName: string}) => Promise<any>;
    listTableColumns: (connectionId: string, tableName: string) => Promise<any>; // 添加这一行
  }

const MySQLConnectionsContext = createContext<MySQLConnectionsContextType | undefined>(undefined);

interface MySQLConnectionsProviderProps {
  children: ReactNode;
}

export const MySQLConnectionsProvider: React.FC<MySQLConnectionsProviderProps> = (props) => {
  const [connections, setConnections] = useState<MySQLConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const api = useAPIClient();

  const listTableColumns = async (connectionId: string, tableName: string) => {
    return api.request({ // 使用这个作用域内的api变量
      resource: 'mysql',
      action: 'getTableSchema',
      params: {
        connectionId,
        tableName
      }
    });
  };

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const { data } = await api.request({
        resource: 'mysql',
        action: 'listConnections'
      });
      setConnections(data?.data || []);
    } catch (error) {
      console.error('获取连接列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const connect = async (connectionInfo: any) => {
    return api.request({
      resource: 'mysql',
      action: 'connect',
      data: connectionInfo
    });
  };

  const disconnect = async (connectionId: string) => {
    return api.request({
      resource: 'mysql',
      action: 'disconnect',
      params: {
        connectionId
      }
    });
  };

  const listTables = async (connectionId: string) => {
    return api.request({
      resource: 'mysql',
      action: 'listTables',
      params: {
        connectionId
      }
    });
  };

  const importTable = async (params: {connectionId: string, tableName: string, collectionName: string}) => {
    return api.request({
      resource: 'mysql',
      action: 'importTable',
      params
    });
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  // 并在Provider返回的值中包含它
  return (
    <MySQLConnectionsContext.Provider
      value={{
        connections,
        loading,
        refresh: fetchConnections,
        connect,
        disconnect,
        listTables,
        importTable,
        listTableColumns // 添加这一行
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