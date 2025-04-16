// src/client/MySQLConnectionList.tsx - 使用reducer简化状态管理
import React, { useState, useReducer } from 'react';
import { 
  Table, Card, Button, Modal, Form, Input, InputNumber, message, 
  Popconfirm, Space, Spin, Tooltip, Alert, Typography, Badge, Divider,
  Descriptions, Tag, Result, notification, Row, Col
} from 'antd';
import { 
  PlusOutlined, DeleteOutlined, TableOutlined, InfoCircleOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, SearchOutlined,
  ReloadOutlined, EyeOutlined, ImportOutlined, DatabaseOutlined
} from '@ant-design/icons';
import { useMySQLConnections } from './MySQLConnectionsContext';
import { useTranslation } from 'react-i18next';
import { handleAPIError, getMySQLConnectionErrorMappings, getTableOperationErrorMappings } from './utils/errorHandlers';

const { Text, Link, Title, Paragraph } = Typography;

// 定义状态类型
interface ConnectionState {
  connectModalVisible: boolean;
  tablesModalVisible: boolean;
  currentConnection: string | null;
  tables: string[];
  tablesLoading: boolean;
  importLoading: boolean;
  tableInfoLoading: boolean;
  tableSearchText: string;
  formErrors: Record<string, string>;
  submitting: boolean;
  selectedRowKeys: string[];
  connectionDetail: any;
  detailModalVisible: boolean;
}

// 定义状态操作类型
type ConnectionAction = 
  | { type: 'TOGGLE_CONNECT_MODAL', payload: boolean }
  | { type: 'TOGGLE_TABLES_MODAL', payload: boolean }
  | { type: 'SET_CURRENT_CONNECTION', payload: string | null }
  | { type: 'SET_TABLES', payload: string[] }
  | { type: 'SET_TABLES_LOADING', payload: boolean }
  | { type: 'SET_IMPORT_LOADING', payload: boolean }
  | { type: 'SET_TABLE_INFO_LOADING', payload: boolean }
  | { type: 'SET_TABLE_SEARCH_TEXT', payload: string }
  | { type: 'SET_FORM_ERRORS', payload: Record<string, string> }
  | { type: 'CLEAR_FORM_ERRORS' }
  | { type: 'SET_SUBMITTING', payload: boolean }
  | { type: 'SET_SELECTED_ROW_KEYS', payload: string[] }
  | { type: 'SET_CONNECTION_DETAIL', payload: any }
  | { type: 'TOGGLE_DETAIL_MODAL', payload: boolean }
  | { type: 'RESET_TABLE_SELECTION' };

// 初始状态
const initialState: ConnectionState = {
  connectModalVisible: false,
  tablesModalVisible: false,
  currentConnection: null,
  tables: [],
  tablesLoading: false,
  importLoading: false,
  tableInfoLoading: false,
  tableSearchText: '',
  formErrors: {},
  submitting: false,
  selectedRowKeys: [],
  connectionDetail: null,
  detailModalVisible: false,
};

// Reducer函数
function connectionReducer(state: ConnectionState, action: ConnectionAction): ConnectionState {
  switch (action.type) {
    case 'TOGGLE_CONNECT_MODAL':
      return { ...state, connectModalVisible: action.payload };
    case 'TOGGLE_TABLES_MODAL':
      return { ...state, tablesModalVisible: action.payload };
    case 'SET_CURRENT_CONNECTION':
      return { ...state, currentConnection: action.payload };
    case 'SET_TABLES':
      return { ...state, tables: action.payload };
    case 'SET_TABLES_LOADING':
      return { ...state, tablesLoading: action.payload };
    case 'SET_IMPORT_LOADING':
      return { ...state, importLoading: action.payload };
    case 'SET_TABLE_INFO_LOADING':
      return { ...state, tableInfoLoading: action.payload };
    case 'SET_TABLE_SEARCH_TEXT':
      return { ...state, tableSearchText: action.payload };
    case 'SET_FORM_ERRORS':
      return { ...state, formErrors: action.payload };
    case 'CLEAR_FORM_ERRORS':
      return { ...state, formErrors: {} };
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.payload };
    case 'SET_SELECTED_ROW_KEYS':
      return { ...state, selectedRowKeys: action.payload };
    case 'SET_CONNECTION_DETAIL':
      return { ...state, connectionDetail: action.payload };
    case 'TOGGLE_DETAIL_MODAL':
      return { ...state, detailModalVisible: action.payload };
    case 'RESET_TABLE_SELECTION':
      return { ...state, selectedRowKeys: [] };
    default:
      return state;
  }
}

export const MySQLConnectionList: React.FC = () => {
  const { t } = useTranslation('mysql-connector');
  const { connections, loading, refresh, connect, disconnect, listTables, importTable,importTables, listTableColumns } = useMySQLConnections();
  
  // 使用reducer替代多个useState
  const [state, dispatch] = useReducer(connectionReducer, initialState);
  const [form] = Form.useForm();

  // 获取连接详情
  const handleViewConnectionDetail = (connection) => {
    dispatch({ type: 'SET_CONNECTION_DETAIL', payload: connection });
    dispatch({ type: 'TOGGLE_DETAIL_MODAL', payload: true });
  };

  // 连接到数据库
  const handleConnect = async (values) => {
    dispatch({ type: 'SET_SUBMITTING', payload: true });
    dispatch({ type: 'CLEAR_FORM_ERRORS' });
    
    try {
      await connect(values);
      dispatch({ type: 'TOGGLE_CONNECT_MODAL', payload: false });
      form.resetFields();
      
      notification.success({
        message: t('连接成功'),
        description: t('已成功连接到MySQL数据库'),
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
      });
      
      refresh();
    } catch (error) {
      // 使用优化的错误处理
    const { formErrors } = handleAPIError(
        error, 
        t, 
        getMySQLConnectionErrorMappings(t),
        '连接失败'
      );
      
      if (formErrors) {
        dispatch({ type: 'SET_FORM_ERRORS', payload: formErrors });
      }
    } finally {
      dispatch({ type: 'SET_SUBMITTING', payload: false });
    }
  };

  // 断开连接
  const handleDisconnect = async (id: string) => {
    try {
      await disconnect(id);
      
      notification.success({
        message: t('断开连接成功'),
        description: t('已成功断开数据库连接'),
        duration: 3
      });
      
      refresh();
    } catch (error) {
        handleAPIError(error, t, [], '断开连接失败');
    }
  };

  // 查看表列表
  const handleViewTables = async (id: string) => {
    dispatch({ type: 'SET_CURRENT_CONNECTION', payload: id });
    dispatch({ type: 'SET_TABLES_LOADING', payload: true });
    dispatch({ type: 'SET_TABLE_SEARCH_TEXT', payload: '' });
    
    try {
      const result = await listTables(id);
      dispatch({ type: 'SET_TABLES', payload: result.data?.data || [] });
      dispatch({ type: 'TOGGLE_TABLES_MODAL', payload: true });
    } catch (error) {
        handleAPIError(error, t, [], '获取表列表失败');
    } finally {
      dispatch({ type: 'SET_TABLES_LOADING', payload: false });
    }
  };

  // 导入表
  const handleImportTable = async (tableName: string) => {
    if (!state.currentConnection) return;
    
    dispatch({ type: 'SET_IMPORT_LOADING', payload: true });
    try {
      // 使用表名作为默认集合名称
      const collectionName = `mysql_${tableName}`;
      
      await importTable({
        connectionId: state.currentConnection,
        tableName,
        collectionName,
      });
      
      notification.success({
        message: t('导入成功'),
        description: t('表 {tableName} 已成功导入为集合', { tableName }),
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
      });
    } catch (error) {
        handleAPIError(
            error, 
            t, 
            getTableOperationErrorMappings(t), 
            '导入表失败'
          );
    } finally {
      dispatch({ type: 'SET_IMPORT_LOADING', payload: false });
    }
  };

  // 批量导入表
  const handleBatchImportTables = async () => {
    if (!state.currentConnection || state.selectedRowKeys.length === 0) return;
  
  Modal.confirm({
    title: t('批量导入表'),
    content: (
      <>
        <p>{t('确定要导入选中的 {count} 个表吗？', { count: state.selectedRowKeys.length })}</p>
        <Alert 
          message={t('提示')} 
          description={t('导入过程中请勿关闭此页面。根据表的数量和复杂度，导入可能需要一些时间。')} 
          type="info" 
          showIcon
          style={{ marginTop: 16 }}
        />
      </>
    ),
    icon: <ExclamationCircleOutlined />,
    onOk: async () => {
      dispatch({ type: 'SET_IMPORT_LOADING', payload: true });
      
      try {
        // 使用批量API进行导入
        const result = await importTables({
          connectionId: state.currentConnection,
          tableNames: state.selectedRowKeys
        });
        
        notification.success({
          message: t('批量导入完成'),
          description: t('成功导入 {successCount} 个表，失败 {failCount} 个', { 
            successCount: result.data.successful?.length || 0, 
            failCount: result.data.failed?.length || 0 
          }),
          duration: 5
        });
        
        // 如果有失败的表，显示详细信息
        if (result.data.failed && result.data.failed.length > 0) {
          Modal.warning({
            title: t('部分表导入失败'),
            content: (
              <div>
                <p>{t('以下表导入失败:')}</p>
                <ul>
                  {result.data.failed.map(failure => (
                    <li key={failure.tableName}>
                      {failure.tableName}: {failure.error}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            width: 600
          });
        }
      } catch (error) {
        notification.error({
          message: t('批量导入出错'),
          description: error.message || t('未知错误'),
          duration: 5
        });
      } finally {
        dispatch({ type: 'SET_IMPORT_LOADING', payload: false });
        dispatch({ type: 'RESET_TABLE_SELECTION' });
      }
    }
  });
  };

  // 查看表结构信息
  const handleViewTableInfo = (tableName) => {
    if (!state.currentConnection) return;
    dispatch({ type: 'SET_TABLE_INFO_LOADING', payload: true });
    
    listTableColumns(state.currentConnection, tableName)
      .then(columns => {
        Modal.info({
          title: (
            <Space>
              <DatabaseOutlined />
              {t('表结构信息')} - {tableName}
            </Space>
          ),
          width: 700,
          content: (
            <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label={t('表名')}>{tableName}</Descriptions.Item>
                <Descriptions.Item label={t('字段数量')}>{columns.length}</Descriptions.Item>
              </Descriptions>
              
              <Table 
                dataSource={columns.map((col, idx) => ({ ...col, key: idx }))}
                columns={[
                  { title: t('字段名') as string, dataIndex: 'Field', key: 'field', width: 150 },
                  { 
                    title: t('类型') as string, 
                    dataIndex: 'Type', 
                    key: 'type',
                    width: 150,
                    render: type => <Tag color="blue">{type}</Tag>
                  },
                  { 
                    title: t('允许为空') as string, 
                    dataIndex: 'Null', 
                    key: 'null',
                    width: 100,
                    render: text => text === 'YES' 
                      ? <Badge status="success" text={t('是')} /> 
                      : <Badge status="error" text={t('否')} />
                  },
                  { 
                    title: t('键') as string, 
                    dataIndex: 'Key', 
                    key: 'key',
                    width: 100,
                    render: key => {
                      if (key === 'PRI') return <Tag color="red">PRI</Tag>;
                      if (key === 'UNI') return <Tag color="purple">UNI</Tag>;
                      if (key === 'MUL') return <Tag color="orange">MUL</Tag>;
                      return key;
                    }
                  },
                  { 
                    title: t('默认值') as string, 
                    dataIndex: 'Default', 
                    key: 'default',
                    render: value => value === null ? <Text type="secondary">NULL</Text> : value
                  }
                ]}
                pagination={false}
                size="small"
                bordered
              />
            </div>
          ),
          onOk() {}
        });
      })
      .catch(error => {
        notification.error({
          message: t('获取表结构失败'),
          description: error.message || t('未知错误')
        });
      })
      .finally(() => {
        dispatch({ type: 'SET_TABLE_INFO_LOADING', payload: false });
      });
  };

  // 过滤表名
  const filteredTables = state.tables.filter(table => 
    table.toLowerCase().includes(state.tableSearchText.toLowerCase())
  );

  // 连接列表表格列定义
  const columns = [
    {
      title: t('连接名称') as string,
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Button 
          type="link" 
          onClick={() => handleViewConnectionDetail(record)}
        >
          {text}
        </Button>
      )
    },
    {
      title: t('主机') as string,
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
      render: (status) => (
        <Badge 
          status={status === 'connected' ? 'success' : 'default'} 
          text={status === 'connected' ? t('已连接') : t('已断开')} 
        />
      ),
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<TableOutlined />} 
            onClick={() => handleViewTables(record.id)}
            size="small"
            type="primary"
            ghost
          >
            {t('查看表')}
          </Button>
          <Popconfirm
            title={t('确定要断开此连接吗？')}
            description={t('断开后可重新连接')}
            onConfirm={() => handleDisconnect(record.id)}
            okText={t('确定')}
            cancelText={t('取消')}
            icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
          >
            <Button 
              danger 
              icon={<DeleteOutlined />} 
              size="small"
            >
              {t('断开')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 表格列定义
  const tableColumns = [
    {
      title: t('表名') as string,
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('操作') as string,
      key: 'action',
      render: (_, { name }) => (
        <Space>
          <Button 
            type="primary" 
            size="small" 
            onClick={() => handleImportTable(name)}
            loading={state.importLoading}
            icon={<ImportOutlined />}
          >
            {t('导入')}
          </Button>
          <Button
            size="small"
            onClick={() => handleViewTableInfo(name)}
            loading={state.tableInfoLoading}
            icon={<EyeOutlined />}
          >
            {t('查看结构')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Alert
        message={t("MySQL连接器")}
        description={
          <div>
            <Paragraph>
              {t("通过此插件可连接外部MySQL数据库并将表导入为NocoBase集合。")}
            </Paragraph>
            <ul>
              <li>{t("支持连接多个数据库")}</li>
              <li>{t("支持浏览数据库表结构")}</li>
              <li>{t("导入的表将作为NocoBase集合使用")}</li>
              <li>{t("建议使用只读权限的数据库用户以保证数据安全")}</li>
            </ul>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Card
        title={
          <Space>
            <DatabaseOutlined />
            {t('MySQL 数据库连接')}
          </Space>
        }
        extra={
          <Space>
            <Button 
              onClick={refresh}
              icon={<ReloadOutlined />}
            >
              {t('刷新')}
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => dispatch({ type: 'TOGGLE_CONNECT_MODAL', payload: true })}
            >
              {t('新建连接')}
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          {connections.length > 0 ? (
            <Table 
              columns={columns} 
              dataSource={connections.map(conn => ({ ...conn, key: conn.id }))} 
              rowKey="id"
              pagination={{ pageSize: 10 }}
              bordered
            />
          ) : (
            <Result
              icon={<DatabaseOutlined />}
              title={t('暂无数据库连接')}
              subTitle={t('点击"新建连接"按钮创建MySQL数据库连接')}
              extra={
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />} 
                  onClick={() => dispatch({ type: 'TOGGLE_CONNECT_MODAL', payload: true })}
                >
                  {t('新建连接')}
                </Button>
              }
            />
          )}
        </Spin>
      </Card>

      {/* 连接表单对话框 */}
      <Modal
        title={
          <Space>
            <DatabaseOutlined />
            {t('创建 MySQL 连接')}
          </Space>
        }
        open={state.connectModalVisible}
        onCancel={() => {
          if (!state.submitting) {
            dispatch({ type: 'TOGGLE_CONNECT_MODAL', payload: false });
            dispatch({ type: 'CLEAR_FORM_ERRORS' });
            form.resetFields();
          }
        }}
        footer={null}
        maskClosable={false}
        width={600}
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={handleConnect}
          requiredMark="optional"
          validateMessages={{
            required: t('${label}是必填字段'),
            types: {
              number: t('${label}必须是数字')
            },
            number: {
              range: t('${label}必须在${min}和${max}之间')
            }
          }}
        >
          <Alert
            message={t("填写MySQL数据库信息")}
            description={t("请确保提供的用户名和密码有权限连接到指定的数据库")}
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />
          
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="name"
                label={t('连接名称')}
                rules={[{ required: true }]}
                validateStatus={state.formErrors.name ? 'error' : undefined}
                help={state.formErrors.name}
              >
                <Input 
                  placeholder={t('例如: 产品数据库')} 
                  suffix={
                    <Tooltip title={t('给连接起一个易于识别的名称')}>
                      <InfoCircleOutlined style={{ color: 'rgba(0,0,0,.45)' }} />
                    </Tooltip>
                  }
                  maxLength={50}
                  showCount
                />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="host"
                label={t('主机地址')}
                rules={[{ required: true }]}
                validateStatus={state.formErrors.host ? 'error' : undefined}
                help={state.formErrors.host}
              >
                <Input 
                  placeholder={t('例如: localhost 或 127.0.0.1')} 
                  autoComplete="off"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="port"
                label={t('端口')}
                initialValue={3306}
                rules={[
                  { required: true },
                  { type: 'number', min: 1, max: 65535 }
                ]}
                validateStatus={state.formErrors.port ? 'error' : undefined}
                help={state.formErrors.port}
              >
                <InputNumber style={{ width: '100%' }} min={1} max={65535} />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="database"
            label={t('数据库名称')}
            rules={[{ required: true }]}
            validateStatus={state.formErrors.database ? 'error' : undefined}
            help={state.formErrors.database || t('要连接的MySQL数据库名称')}
          >
            <Input placeholder={t('输入数据库名称')} autoComplete="off" />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label={t('用户名')}
                rules={[{ required: true }]}
                validateStatus={state.formErrors.username ? 'error' : undefined}
                help={state.formErrors.username}
              >
                <Input 
                  placeholder={t('输入数据库用户名')} 
                  autoComplete="off"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="password"
                label={t('密码')}
                rules={[{ required: true }]}
                validateStatus={state.formErrors.password ? 'error' : undefined}
                help={state.formErrors.password}
              >
                <Input.Password 
                  placeholder={t('输入数据库密码')} 
                  autoComplete="new-password"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Button 
                    onClick={() => {
                      dispatch({ type: 'TOGGLE_CONNECT_MODAL', payload: false });
                      dispatch({ type: 'CLEAR_FORM_ERRORS' });
                      form.resetFields();
                    }}
                    block
                    disabled={state.submitting}
                  >
                    {t('取消')}
                  </Button>
                </Col>
                <Col span={12}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    block 
                    loading={state.submitting}
                    disabled={state.submitting}
                  >
                    {state.submitting ? t('连接中...') : t('连接')}
                  </Button>
                </Col>
              </Row>
              
              {Object.keys(state.formErrors).length > 0 && (
                <Alert 
                  message={t('连接失败')} 
                  description={t('请检查输入的信息是否正确')} 
                  type="error" 
                  showIcon 
                />
              )}
              
              <Alert 
                message={t('安全提示')} 
                description={t('建议使用只读权限的数据库用户，以保证数据安全')} 
                type="warning" 
                showIcon 
              />
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 表格列表对话框 */}
      <Modal
        title={
          <Space>
            <DatabaseOutlined />
            {t('数据库表')}
          </Space>
        }
        open={state.tablesModalVisible}
        onCancel={() => {
          dispatch({ type: 'TOGGLE_TABLES_MODAL', payload: false });
          dispatch({ type: 'RESET_TABLE_SELECTION' });
        }}
        width={800}
        footer={[
          <Button 
            key="close" 
            onClick={() => {
              dispatch({ type: 'TOGGLE_TABLES_MODAL', payload: false });
              dispatch({ type: 'RESET_TABLE_SELECTION' });
            }}
          >
            {t('关闭')}
          </Button>,
          <Button 
            key="import" 
            type="primary" 
            disabled={state.selectedRowKeys.length === 0}
            onClick={handleBatchImportTables}
          >
            {t('批量导入选中表')} ({state.selectedRowKeys.length})
          </Button>
        ]}
      >
        <Spin spinning={state.tablesLoading}>
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder={t('搜索表名')}
              value={state.tableSearchText}
              onChange={e => dispatch({ type: 'SET_TABLE_SEARCH_TEXT', payload: e.target.value })}
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 200, marginRight: 8 }}
            />
            <span style={{ marginLeft: 8 }}>
              {t('共 {count} 个表', { count: state.tables.length })}
              {state.tableSearchText && `, ${t('匹配 {count} 个', { count: filteredTables.length })}`}
            </span>
          </div>
          
          {state.tables.length > 0 ? (
            <Table 
              rowSelection={{
                selectedRowKeys: state.selectedRowKeys,
                onChange: (keys) => dispatch({ type: 'SET_SELECTED_ROW_KEYS', payload: keys as string[] }),
              }}
              columns={tableColumns} 
              dataSource={filteredTables.map(name => ({ name, key: name }))} 
              rowKey="name"
              pagination={{ 
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => t('共 {total} 个表', { total })
              }}
              bordered
              size="middle"
            />
          ) : (
            <Result
              status="info"
              title={t('暂无数据表')}
              subTitle={t('当前数据库中没有可用的表，请确认数据库权限或选择其他数据库')}
            />
          )}
        </Spin>
      </Modal>
{/* 连接详情对话框 */}
<Modal
        title={t('连接详情')}
        open={state.detailModalVisible}
        onCancel={() => dispatch({ type: 'TOGGLE_DETAIL_MODAL', payload: false })}
        footer={[
          <Button 
            key="close" 
            onClick={() => dispatch({ type: 'TOGGLE_DETAIL_MODAL', payload: false })}
          >
            {t('关闭')}
          </Button>,
          <Button 
            key="view" 
            type="primary" 
            onClick={() => {
              dispatch({ type: 'TOGGLE_DETAIL_MODAL', payload: false });
              if (state.connectionDetail) {
                handleViewTables(state.connectionDetail.id);
              }
            }}
          >
            {t('查看表')}
          </Button>
        ]}
      >
        {state.connectionDetail && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label={t('连接名称')}>{state.connectionDetail.name}</Descriptions.Item>
            <Descriptions.Item label={t('主机')}>{state.connectionDetail.host}</Descriptions.Item>
            <Descriptions.Item label={t('端口')}>{state.connectionDetail.port}</Descriptions.Item>
            <Descriptions.Item label={t('数据库')}>{state.connectionDetail.database}</Descriptions.Item>
            <Descriptions.Item label={t('用户名')}>{state.connectionDetail.username}</Descriptions.Item>
            <Descriptions.Item label={t('状态')}>
              <Badge 
                status={state.connectionDetail.status === 'connected' ? 'success' : 'default'} 
                text={state.connectionDetail.status === 'connected' ? t('已连接') : t('已断开')} 
              />
            </Descriptions.Item>
            {state.connectionDetail.createdAt && (
              <Descriptions.Item label={t('创建时间')}>
                {new Date(state.connectionDetail.createdAt).toLocaleString()}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default MySQLConnectionList;
      