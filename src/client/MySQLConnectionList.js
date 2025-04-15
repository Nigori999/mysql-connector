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
exports.MySQLConnectionList = void 0;
// src/client/MySQLConnectionList.tsx
const react_1 = __importStar(require("react"));
const antd_1 = require("antd");
const icons_1 = require("@ant-design/icons");
const MySQLConnectionsContext_1 = require("./MySQLConnectionsContext");
const react_i18next_1 = require("react-i18next");
const { Text, Link, Title, Paragraph } = antd_1.Typography;
const MySQLConnectionList = () => {
    const { t } = (0, react_i18next_1.useTranslation)('mysql-connector');
    const { connections, loading, refresh, connect, disconnect, listTables, importTable, listTableColumns } = (0, MySQLConnectionsContext_1.useMySQLConnections)();
    const [connectModalVisible, setConnectModalVisible] = (0, react_1.useState)(false);
    const [tablesModalVisible, setTablesModalVisible] = (0, react_1.useState)(false);
    const [currentConnection, setCurrentConnection] = (0, react_1.useState)(null);
    const [tables, setTables] = (0, react_1.useState)([]);
    const [tablesLoading, setTablesLoading] = (0, react_1.useState)(false);
    const [importLoading, setImportLoading] = (0, react_1.useState)(false);
    const [tableInfoLoading, setTableInfoLoading] = (0, react_1.useState)(false);
    const [tableSearchText, setTableSearchText] = (0, react_1.useState)('');
    const [formErrors, setFormErrors] = (0, react_1.useState)({});
    const [submitting, setSubmitting] = (0, react_1.useState)(false);
    const [selectedRowKeys, setSelectedRowKeys] = (0, react_1.useState)([]);
    const [connectionDetail, setConnectionDetail] = (0, react_1.useState)(null);
    const [detailModalVisible, setDetailModalVisible] = (0, react_1.useState)(false);
    const [form] = antd_1.Form.useForm();
    // 获取连接详情
    const handleViewConnectionDetail = (connection) => {
        setConnectionDetail(connection);
        setDetailModalVisible(true);
    };
    // 连接到数据库
    const handleConnect = async (values) => {
        setSubmitting(true);
        setFormErrors({});
        try {
            await connect(values);
            setConnectModalVisible(false);
            form.resetFields();
            antd_1.notification.success({
                message: t('连接成功'),
                description: t('已成功连接到MySQL数据库'),
                icon: react_1.default.createElement(icons_1.CheckCircleOutlined, { style: { color: '#52c41a' } })
            });
            refresh();
        }
        catch (error) {
            // 处理特定类型的错误
            if (error.message.includes('ECONNREFUSED')) {
                setFormErrors({
                    host: t('无法连接到指定主机'),
                    port: t('无法连接到指定端口')
                });
            }
            else if (error.message.includes('Access denied')) {
                setFormErrors({
                    username: t('用户名或密码不正确'),
                    password: t('用户名或密码不正确')
                });
            }
            else if (error.message.includes('not exists')) {
                setFormErrors({
                    database: t('数据库不存在')
                });
            }
            else {
                antd_1.notification.error({
                    message: t('连接失败'),
                    description: error.message || t('未知错误'),
                    duration: 5
                });
            }
        }
        finally {
            setSubmitting(false);
        }
    };
    // 断开连接
    const handleDisconnect = async (id) => {
        try {
            await disconnect(id);
            antd_1.notification.success({
                message: t('断开连接成功'),
                description: t('已成功断开数据库连接'),
                duration: 3
            });
            refresh();
        }
        catch (error) {
            antd_1.notification.error({
                message: t('断开连接失败'),
                description: error.message || t('未知错误'),
                duration: 4
            });
        }
    };
    // 查看表列表
    const handleViewTables = async (id) => {
        var _a;
        setCurrentConnection(id);
        setTablesLoading(true);
        setTableSearchText('');
        try {
            const result = await listTables(id);
            setTables(((_a = result.data) === null || _a === void 0 ? void 0 : _a.data) || []);
            setTablesModalVisible(true);
        }
        catch (error) {
            antd_1.notification.error({
                message: t('获取表列表失败'),
                description: error.message || t('未知错误'),
                duration: 4
            });
        }
        finally {
            setTablesLoading(false);
        }
    };
    // 导入表
    const handleImportTable = async (tableName) => {
        if (!currentConnection)
            return;
        setImportLoading(true);
        try {
            // 使用表名作为默认集合名称
            const collectionName = `mysql_${tableName}`;
            await importTable({
                connectionId: currentConnection,
                tableName,
                collectionName,
            });
            antd_1.notification.success({
                message: t('导入成功'),
                description: t('表 {tableName} 已成功导入为集合', { tableName }),
                icon: react_1.default.createElement(icons_1.CheckCircleOutlined, { style: { color: '#52c41a' } })
            });
        }
        catch (error) {
            antd_1.notification.error({
                message: t('导入表失败'),
                description: error.message || t('未知错误'),
                duration: 5
            });
        }
        finally {
            setImportLoading(false);
        }
    };
    // 批量导入表
    const handleBatchImportTables = async () => {
        if (!currentConnection || selectedRowKeys.length === 0)
            return;
        antd_1.Modal.confirm({
            title: t('批量导入表'),
            content: t('确定要导入选中的 {count} 个表吗？', { count: selectedRowKeys.length }),
            icon: react_1.default.createElement(icons_1.ExclamationCircleOutlined, null),
            onOk: async () => {
                let successCount = 0;
                let failCount = 0;
                setImportLoading(true);
                try {
                    // 限制并发为3个请求
                    const concurrency = 3;
                    const chunks = [];
                    // 将表名分组为小批次
                    for (let i = 0; i < selectedRowKeys.length; i += concurrency) {
                        chunks.push(selectedRowKeys.slice(i, i + concurrency));
                    }
                    // 逐批处理表导入
                    for (const chunk of chunks) {
                        const results = await Promise.allSettled(chunk.map(async (tableName) => {
                            try {
                                const collectionName = `mysql_${tableName}`;
                                await importTable({
                                    connectionId: currentConnection,
                                    tableName,
                                    collectionName,
                                });
                                return { tableName, success: true };
                            }
                            catch (error) {
                                console.error(`导入表 ${tableName} 失败:`, error);
                                return { tableName, success: false, error };
                            }
                        }));
                        // 统计结果
                        results.forEach(result => {
                            if (result.status === 'fulfilled') {
                                if (result.value.success) {
                                    successCount++;
                                }
                                else {
                                    failCount++;
                                }
                            }
                            else {
                                failCount++;
                                console.error(`批量导入出错:`, result.reason);
                            }
                        });
                    }
                    // 显示结果通知
                    if (successCount > 0) {
                        antd_1.notification.success({
                            message: t('批量导入完成'),
                            description: t('成功导入 {successCount} 个表，失败 {failCount} 个', {
                                successCount, failCount
                            }),
                            duration: 5
                        });
                    }
                    else if (failCount > 0) {
                        antd_1.notification.error({
                            message: t('批量导入失败'),
                            description: t('所有表导入均失败，请检查日志'),
                            duration: 5
                        });
                    }
                }
                catch (error) {
                    antd_1.notification.error({
                        message: t('批量导入出错'),
                        description: error.message || t('未知错误'),
                        duration: 5
                    });
                }
                finally {
                    setImportLoading(false);
                    setSelectedRowKeys([]);
                }
            }
        });
    };
    // 查看表结构信息
    const handleViewTableInfo = (tableName) => {
        if (!currentConnection)
            return;
        setTableInfoLoading(true);
        listTableColumns(currentConnection, tableName)
            .then(columns => {
            antd_1.Modal.info({
                title: (react_1.default.createElement(antd_1.Space, null,
                    react_1.default.createElement(icons_1.DatabaseOutlined, null),
                    t('表结构信息'),
                    " - ",
                    tableName)),
                width: 700,
                content: (react_1.default.createElement("div", { style: { maxHeight: '60vh', overflow: 'auto' } },
                    react_1.default.createElement(antd_1.Descriptions, { bordered: true, size: "small", column: 1, style: { marginBottom: 16 } },
                        react_1.default.createElement(antd_1.Descriptions.Item, { label: t('表名') }, tableName),
                        react_1.default.createElement(antd_1.Descriptions.Item, { label: t('字段数量') }, columns.length)),
                    react_1.default.createElement(antd_1.Table, { dataSource: columns.map((col, idx) => ({ ...col, key: idx })), columns: [
                            { title: t('字段名'), dataIndex: 'Field', key: 'field', width: 150 },
                            {
                                title: t('类型'),
                                dataIndex: 'Type',
                                key: 'type',
                                width: 150,
                                render: type => react_1.default.createElement(antd_1.Tag, { color: "blue" }, type)
                            },
                            {
                                title: t('允许为空'),
                                dataIndex: 'Null',
                                key: 'null',
                                width: 100,
                                render: text => text === 'YES'
                                    ? react_1.default.createElement(antd_1.Badge, { status: "success", text: t('是') })
                                    : react_1.default.createElement(antd_1.Badge, { status: "error", text: t('否') })
                            },
                            {
                                title: t('键'),
                                dataIndex: 'Key',
                                key: 'key',
                                width: 100,
                                render: key => {
                                    if (key === 'PRI')
                                        return react_1.default.createElement(antd_1.Tag, { color: "red" }, "PRI");
                                    if (key === 'UNI')
                                        return react_1.default.createElement(antd_1.Tag, { color: "purple" }, "UNI");
                                    if (key === 'MUL')
                                        return react_1.default.createElement(antd_1.Tag, { color: "orange" }, "MUL");
                                    return key;
                                }
                            },
                            {
                                title: t('默认值'),
                                dataIndex: 'Default',
                                key: 'default',
                                render: value => value === null ? react_1.default.createElement(Text, { type: "secondary" }, "NULL") : value
                            }
                        ], pagination: false, size: "small", bordered: true }))),
                onOk() { }
            });
        })
            .catch(error => {
            antd_1.notification.error({
                message: t('获取表结构失败'),
                description: error.message || t('未知错误')
            });
        })
            .finally(() => {
            setTableInfoLoading(false);
        });
    };
    // 过滤表名
    const filteredTables = tables.filter(table => table.toLowerCase().includes(tableSearchText.toLowerCase()));
    // 连接列表表格列定义
    const columns = [
        {
            title: t('连接名称'),
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => (react_1.default.createElement(antd_1.Button, { type: "link", onClick: () => handleViewConnectionDetail(record) }, text))
        },
        {
            title: t('主机'),
            dataIndex: 'host',
            key: 'host',
        },
        {
            title: t('端口'),
            dataIndex: 'port',
            key: 'port',
        },
        {
            title: t('数据库'),
            dataIndex: 'database',
            key: 'database',
        },
        {
            title: t('用户名'),
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: t('状态'),
            key: 'status',
            dataIndex: 'status',
            render: (status) => (react_1.default.createElement(antd_1.Badge, { status: status === 'connected' ? 'success' : 'default', text: status === 'connected' ? t('已连接') : t('已断开') })),
        },
        {
            title: t('操作'),
            key: 'action',
            render: (_, record) => (react_1.default.createElement(antd_1.Space, null,
                react_1.default.createElement(antd_1.Button, { icon: react_1.default.createElement(icons_1.TableOutlined, null), onClick: () => handleViewTables(record.id), size: "small", type: "primary", ghost: true }, t('查看表')),
                react_1.default.createElement(antd_1.Popconfirm, { title: t('确定要断开此连接吗？'), description: t('断开后可重新连接'), onConfirm: () => handleDisconnect(record.id), okText: t('确定'), cancelText: t('取消'), icon: react_1.default.createElement(icons_1.ExclamationCircleOutlined, { style: { color: 'red' } }) },
                    react_1.default.createElement(antd_1.Button, { danger: true, icon: react_1.default.createElement(icons_1.DeleteOutlined, null), size: "small" }, t('断开'))))),
        },
    ];
    // 表格列定义
    const tableColumns = [
        {
            title: t('表名'),
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: t('操作'),
            key: 'action',
            render: (_, { name }) => (react_1.default.createElement(antd_1.Space, null,
                react_1.default.createElement(antd_1.Button, { type: "primary", size: "small", onClick: () => handleImportTable(name), loading: importLoading, icon: react_1.default.createElement(icons_1.ImportOutlined, null) }, t('导入')),
                react_1.default.createElement(antd_1.Button, { size: "small", onClick: () => handleViewTableInfo(name), loading: tableInfoLoading, icon: react_1.default.createElement(icons_1.EyeOutlined, null) }, t('查看结构')))),
        },
    ];
    return (react_1.default.createElement("div", { style: { padding: 24 } },
        react_1.default.createElement(antd_1.Alert, { message: t("MySQL连接器"), description: react_1.default.createElement("div", null,
                react_1.default.createElement(Paragraph, null, t("通过此插件可连接外部MySQL数据库并将表导入为NocoBase集合。")),
                react_1.default.createElement("ul", null,
                    react_1.default.createElement("li", null, t("支持连接多个数据库")),
                    react_1.default.createElement("li", null, t("支持浏览数据库表结构")),
                    react_1.default.createElement("li", null, t("导入的表将作为NocoBase集合使用")),
                    react_1.default.createElement("li", null, t("建议使用只读权限的数据库用户以保证数据安全")))), type: "info", showIcon: true, style: { marginBottom: 16 } }),
        react_1.default.createElement(antd_1.Card, { title: react_1.default.createElement(antd_1.Space, null,
                react_1.default.createElement(icons_1.DatabaseOutlined, null),
                t('MySQL 数据库连接')), extra: react_1.default.createElement(antd_1.Space, null,
                react_1.default.createElement(antd_1.Button, { onClick: refresh, icon: react_1.default.createElement(icons_1.ReloadOutlined, null) }, t('刷新')),
                react_1.default.createElement(antd_1.Button, { type: "primary", icon: react_1.default.createElement(icons_1.PlusOutlined, null), onClick: () => setConnectModalVisible(true) }, t('新建连接'))) },
            react_1.default.createElement(antd_1.Spin, { spinning: loading }, connections.length > 0 ? (react_1.default.createElement(antd_1.Table, { columns: columns, dataSource: connections.map(conn => ({ ...conn, key: conn.id })), rowKey: "id", pagination: { pageSize: 10 }, bordered: true })) : (react_1.default.createElement(antd_1.Result, { icon: react_1.default.createElement(icons_1.DatabaseOutlined, null), title: t('暂无数据库连接'), subTitle: t('点击"新建连接"按钮创建MySQL数据库连接'), extra: react_1.default.createElement(antd_1.Button, { type: "primary", icon: react_1.default.createElement(icons_1.PlusOutlined, null), onClick: () => setConnectModalVisible(true) }, t('新建连接')) })))),
        react_1.default.createElement(antd_1.Modal, { title: react_1.default.createElement(antd_1.Space, null,
                react_1.default.createElement(icons_1.DatabaseOutlined, null),
                t('创建 MySQL 连接')), open: connectModalVisible, onCancel: () => {
                if (!submitting) {
                    setConnectModalVisible(false);
                    setFormErrors({});
                    form.resetFields();
                }
            }, footer: null, maskClosable: false, width: 600 },
            react_1.default.createElement(antd_1.Form, { form: form, layout: "vertical", onFinish: handleConnect, requiredMark: "optional", validateMessages: {
                    required: t('${label}是必填字段'),
                    types: {
                        number: t('${label}必须是数字')
                    },
                    number: {
                        range: t('${label}必须在${min}和${max}之间')
                    }
                } },
                react_1.default.createElement(antd_1.Alert, { message: t("填写MySQL数据库信息"), description: t("请确保提供的用户名和密码有权限连接到指定的数据库"), type: "info", showIcon: true, style: { marginBottom: 24 } }),
                react_1.default.createElement(antd_1.Row, { gutter: 16 },
                    react_1.default.createElement(antd_1.Col, { span: 24 },
                        react_1.default.createElement(antd_1.Form.Item, { name: "name", label: t('连接名称'), rules: [{ required: true }], validateStatus: formErrors.name ? 'error' : undefined, help: formErrors.name },
                            react_1.default.createElement(antd_1.Input, { placeholder: t('例如: 产品数据库'), suffix: react_1.default.createElement(antd_1.Tooltip, { title: t('给连接起一个易于识别的名称') },
                                    react_1.default.createElement(icons_1.InfoCircleOutlined, { style: { color: 'rgba(0,0,0,.45)' } })), maxLength: 50, showCount: true })))),
                react_1.default.createElement(antd_1.Row, { gutter: 16 },
                    react_1.default.createElement(antd_1.Col, { span: 16 },
                        react_1.default.createElement(antd_1.Form.Item, { name: "host", label: t('主机地址'), rules: [{ required: true }], validateStatus: formErrors.host ? 'error' : undefined, help: formErrors.host },
                            react_1.default.createElement(antd_1.Input, { placeholder: t('例如: localhost 或 127.0.0.1'), autoComplete: "off" }))),
                    react_1.default.createElement(antd_1.Col, { span: 8 },
                        react_1.default.createElement(antd_1.Form.Item, { name: "port", label: t('端口'), initialValue: 3306, rules: [
                                { required: true },
                                { type: 'number', min: 1, max: 65535 }
                            ], validateStatus: formErrors.port ? 'error' : undefined, help: formErrors.port },
                            react_1.default.createElement(antd_1.InputNumber, { style: { width: '100%' }, min: 1, max: 65535 })))),
                react_1.default.createElement(antd_1.Form.Item, { name: "database", label: t('数据库名称'), rules: [{ required: true }], validateStatus: formErrors.database ? 'error' : undefined, help: formErrors.database || t('要连接的MySQL数据库名称') },
                    react_1.default.createElement(antd_1.Input, { placeholder: t('输入数据库名称'), autoComplete: "off" })),
                react_1.default.createElement(antd_1.Row, { gutter: 16 },
                    react_1.default.createElement(antd_1.Col, { span: 12 },
                        react_1.default.createElement(antd_1.Form.Item, { name: "username", label: t('用户名'), rules: [{ required: true }], validateStatus: formErrors.username ? 'error' : undefined, help: formErrors.username },
                            react_1.default.createElement(antd_1.Input, { placeholder: t('输入数据库用户名'), autoComplete: "off" }))),
                    react_1.default.createElement(antd_1.Col, { span: 12 },
                        react_1.default.createElement(antd_1.Form.Item, { name: "password", label: t('密码'), rules: [{ required: true }], validateStatus: formErrors.password ? 'error' : undefined, help: formErrors.password },
                            react_1.default.createElement(antd_1.Input.Password, { placeholder: t('输入数据库密码'), autoComplete: "new-password" })))),
                react_1.default.createElement(antd_1.Form.Item, null,
                    react_1.default.createElement(antd_1.Space, { direction: "vertical", style: { width: '100%' } },
                        react_1.default.createElement(antd_1.Row, { gutter: 16 },
                            react_1.default.createElement(antd_1.Col, { span: 12 },
                                react_1.default.createElement(antd_1.Button, { onClick: () => {
                                        setConnectModalVisible(false);
                                        setFormErrors({});
                                        form.resetFields();
                                    }, block: true, disabled: submitting }, t('取消'))),
                            react_1.default.createElement(antd_1.Col, { span: 12 },
                                react_1.default.createElement(antd_1.Button, { type: "primary", htmlType: "submit", block: true, loading: submitting, disabled: submitting }, submitting ? t('连接中...') : t('连接')))),
                        Object.keys(formErrors).length > 0 && (react_1.default.createElement(antd_1.Alert, { message: t('连接失败'), description: t('请检查输入的信息是否正确'), type: "error", showIcon: true })),
                        react_1.default.createElement(antd_1.Alert, { message: t('安全提示'), description: t('建议使用只读权限的数据库用户，以保证数据安全'), type: "warning", showIcon: true }))))),
        react_1.default.createElement(antd_1.Modal, { title: react_1.default.createElement(antd_1.Space, null,
                react_1.default.createElement(icons_1.DatabaseOutlined, null),
                t('数据库表')), open: tablesModalVisible, onCancel: () => {
                setTablesModalVisible(false);
                setSelectedRowKeys([]);
            }, width: 800, footer: [
                react_1.default.createElement(antd_1.Button, { key: "close", onClick: () => {
                        setTablesModalVisible(false);
                        setSelectedRowKeys([]);
                    } }, t('关闭')),
                react_1.default.createElement(antd_1.Button, { key: "import", type: "primary", disabled: selectedRowKeys.length === 0, onClick: handleBatchImportTables },
                    t('批量导入选中表'),
                    " (",
                    selectedRowKeys.length,
                    ")")
            ] },
            react_1.default.createElement(antd_1.Spin, { spinning: tablesLoading },
                react_1.default.createElement("div", { style: { marginBottom: 16 } },
                    react_1.default.createElement(antd_1.Input, { placeholder: t('搜索表名'), value: tableSearchText, onChange: e => setTableSearchText(e.target.value), prefix: react_1.default.createElement(icons_1.SearchOutlined, null), allowClear: true, style: { width: 200, marginRight: 8 } }),
                    react_1.default.createElement("span", { style: { marginLeft: 8 } },
                        t('共 {count} 个表', { count: tables.length }),
                        tableSearchText && `, ${t('匹配 {count} 个', { count: filteredTables.length })}`)),
                tables.length > 0 ? (react_1.default.createElement(antd_1.Table, { rowSelection: {
                        selectedRowKeys,
                        onChange: (keys) => setSelectedRowKeys(keys),
                    }, columns: tableColumns, dataSource: filteredTables.map(name => ({ name, key: name })), rowKey: "name", pagination: {
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (total) => t('共 {total} 个表', { total })
                    }, bordered: true, size: "middle" })) : (react_1.default.createElement(antd_1.Result, { status: "info", title: t('暂无数据表'), subTitle: t('当前数据库中没有可用的表，请确认数据库权限或选择其他数据库') })))),
        react_1.default.createElement(antd_1.Modal, { title: t('连接详情'), open: detailModalVisible, onCancel: () => setDetailModalVisible(false), footer: [
                react_1.default.createElement(antd_1.Button, { key: "close", onClick: () => setDetailModalVisible(false) }, t('关闭')),
                react_1.default.createElement(antd_1.Button, { key: "view", type: "primary", onClick: () => {
                        setDetailModalVisible(false);
                        if (connectionDetail) {
                            handleViewTables(connectionDetail.id);
                        }
                    } }, t('查看表'))
            ] }, connectionDetail && (react_1.default.createElement(antd_1.Descriptions, { bordered: true, column: 1 },
            react_1.default.createElement(antd_1.Descriptions.Item, { label: t('连接名称') }, connectionDetail.name),
            react_1.default.createElement(antd_1.Descriptions.Item, { label: t('主机') }, connectionDetail.host),
            react_1.default.createElement(antd_1.Descriptions.Item, { label: t('端口') }, connectionDetail.port),
            react_1.default.createElement(antd_1.Descriptions.Item, { label: t('数据库') }, connectionDetail.database),
            react_1.default.createElement(antd_1.Descriptions.Item, { label: t('用户名') }, connectionDetail.username),
            react_1.default.createElement(antd_1.Descriptions.Item, { label: t('状态') },
                react_1.default.createElement(antd_1.Badge, { status: connectionDetail.status === 'connected' ? 'success' : 'default', text: connectionDetail.status === 'connected' ? t('已连接') : t('已断开') })),
            connectionDetail.createdAt && (react_1.default.createElement(antd_1.Descriptions.Item, { label: t('创建时间') }, new Date(connectionDetail.createdAt).toLocaleString())))))));
};
exports.MySQLConnectionList = MySQLConnectionList;
exports.default = exports.MySQLConnectionList;
