"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMySQLConnections = exports.MySQLConnectionsProvider = void 0;
// client/MySQLConnectionsContext.tsx - 状态管理
const react_1 = __importStar(require("react"));
const client_1 = require("@nocobase/client");
const MySQLConnectionsContext = (0, react_1.createContext)(undefined);
const MySQLConnectionsProvider = (props) => {
    const [connections, setConnections] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const api = (0, client_1.useAPIClient)();
    const listTableColumns = async (connectionId, tableName) => {
        return api.request({
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
            setConnections((data === null || data === void 0 ? void 0 : data.data) || []);
        }
        catch (error) {
            console.error('获取连接列表失败:', error);
        }
        finally {
            setLoading(false);
        }
    };
    const connect = async (connectionInfo) => {
        return api.request({
            resource: 'mysql',
            action: 'connect',
            data: connectionInfo
        });
    };
    const disconnect = async (connectionId) => {
        return api.request({
            resource: 'mysql',
            action: 'disconnect',
            params: {
                connectionId
            }
        });
    };
    const listTables = async (connectionId) => {
        return api.request({
            resource: 'mysql',
            action: 'listTables',
            params: {
                connectionId
            }
        });
    };
    const importTable = async (params) => {
        return api.request({
            resource: 'mysql',
            action: 'importTable',
            params
        });
    };
    (0, react_1.useEffect)(() => {
        fetchConnections();
    }, []);
    // 并在Provider返回的值中包含它
    return (react_1.default.createElement(MySQLConnectionsContext.Provider, { value: {
            connections,
            loading,
            refresh: fetchConnections,
            connect,
            disconnect,
            listTables,
            importTable,
            listTableColumns // 添加这一行
        } }, props.children));
};
exports.MySQLConnectionsProvider = MySQLConnectionsProvider;
const useMySQLConnections = () => {
    const context = (0, react_1.useContext)(MySQLConnectionsContext);
    if (context === undefined) {
        throw new Error('useMySQLConnections must be used within a MySQLConnectionsProvider');
    }
    return context;
};
exports.useMySQLConnections = useMySQLConnections;
