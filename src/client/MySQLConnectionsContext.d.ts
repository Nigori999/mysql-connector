import React, { ReactNode } from 'react';
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
    refresh: () => void;
    connect: (connectionInfo: any) => Promise<any>;
    disconnect: (connectionId: string) => Promise<any>;
    listTables: (connectionId: string) => Promise<any>;
    importTable: (params: {
        connectionId: string;
        tableName: string;
        collectionName: string;
    }) => Promise<any>;
    listTableColumns: (connectionId: string, tableName: string) => Promise<any>;
}
interface MySQLConnectionsProviderProps {
    children: ReactNode;
}
export declare const MySQLConnectionsProvider: React.FC<MySQLConnectionsProviderProps>;
export declare const useMySQLConnections: () => MySQLConnectionsContextType;
export {};
