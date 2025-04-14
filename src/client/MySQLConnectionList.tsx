// src/client/MySQLConnectionList.tsx
import React, { useState } from 'react';
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

const { Text, Link, Title, Paragraph } = Typography;

export const MySQLConnectionList: React.FC = () => {
  const { t } = useTranslation('mysql-connector');
  const { connections, loading, refresh, connect, disconnect, listTables, importTable, listTableColumns } = useMySQLConnections();
  
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [tablesModalVisible, setTablesModalVisible] = useState(false);
  const [currentConnection, setCurrentConnection] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [tableInfoLoading, setTableInfoLoading] = useState(false);
  const [tableSearchText, setTableSearchText] = useState('');
  const [formErrors, setFormErrors] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [connectionDetail, setConnectionDetail] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  
  const [form] = Form.useForm();

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
      
      notification.success({
        message: t('连接成功'),
        description: t('已成功连接到MySQL数据库'),
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
      });
      
      refresh();
    } catch (error) {
      // 处理特定类型的错误
      if (error.message.includes('ECONNREFUSED')) {
        setFormErrors({
          host: t('无法连接到指定主机'),
          port: t('无法连接到指定端口')
        });
      } else if (error.message.includes('Access denied')) {
        setFormErrors({
          username: t('用户名或密码不正确'),
          password: t('用户名或密码不正确')
        });
      } else if (error.message.includes('not exists')) {
        setFormErrors({
          database: t('数据库不存在')
        });
      } else {
        notification.error({
          message: t('连接失败'),
          description: error.message || t('未知错误'),
          duration: 5
        });
      }
    } finally {
      setSubmitting(false);
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
      notification.error({
        message: t('断开连接失败'),
        description: error.message || t('未知错误'),
        duration: 4
      });
    }
  };

  // 查看表列表
  const handleViewTables = async (id: string) => {
    setCurrentConnection(id);
    setTablesLoading(true);
    setTableSearchText('');
    
    try {
      const result = await listTables(id);
      setTables(result.data?.data || []);
      setTablesModalVisible(true);
    } catch (error) {
      notification.error({
        message: t('获取表列表失败'),
        description: error.message || t('未知错误'),
        duration: 4
      });
    } finally {
      setTablesLoading(false);
    }
  };

  // 导入表
  const handleImportTable = async (tableName: string) => {
    if (!currentConnection) return;
    
    setImportLoading(true);
    try {
      // 使用表名作为默认集合名称
      const collectionName = `mysql_${tableName}`;
      
      await importTable({
        connectionId: currentConnection,
        tableName,
        collectionName,
      });
      
      notification.success({
        message: t('导入成功'),
        description: t('表 {tableName} 已成功导入为集合', { tableName }),
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
      });
    } catch (error) {
      notification.error({
        message: t('导入表失败'),
        description: error.message || t('未知错误'),
        duration: 5
      });
    } finally {
      setImportLoading(false);
    }
  };

  // 批量导入表
  const handleBatchImportTables = async () => {
    if (!currentConnection || selectedRowKeys.length === 0) return;
    
    Modal.confirm({
      title: t('批量导入表'),
      content: t('确定要导入选中的 {count} 个表吗？', { count: selectedRowKeys.length }),
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        let successCount = 0;
        let failCount = 0;
        
        for (const tableName of selectedRowKeys) {
          try {
            const collectionName = `mysql_${tableName}`;
            await importTable({
              connectionId: currentConnection,
              tableName,
              collectionName,
            });
            successCount++;
          } catch (error) {
            failCount++;
            console.error(`导入表 ${tableName} 失败:`, error);
          }
        }
        
        if (successCount > 0) {
          notification.success({
            message: t('批量导入完成'),
            description: t('成功导入 {successCount} 个表，失败 {failCount} 个', { 
              successCount, failCount 
            }),
            duration: 5
          });
        } else if (failCount > 0) {
          notification.error({
            message: t('批量导入失败'),
            description: t('所有表导入均失败，请检查日志'),
            duration: 5
          });
        }
        
        setSelectedRowKeys([]);
      }
    });
  };

  // 查看表结构信息
  const handleViewTableInfo = (tableName) => {
    if (!currentConnection) return;
    setTableInfoLoading(true);
    
    listTableColumns(currentConnection, tableName)
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
                  { title: t('字段名'), dataIndex: 'Field', key: 'field', width: 150 },
                  { 
                    title: t('类型'), 
                    dataIndex: 'Type', 
                    key: 'type',
                    width: 150,
                    render: type => <Tag color="blue">{type}</Tag>
                  },
                  { 
                    title: t('允许为空'), 
                    dataIndex: 'Null', 
                    key: 'null',
                    width: 100,
                    render: text => text === 'YES' 
                      ? <Badge status="success" text={t('是')} /> 
                      : <Badge status="error" text={t('否')} />
                  },
                  { 
                    title: t('键'), 
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
                    title: t('默认值'), 
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
        setTableInfoLoading(false);
      });
  };

  // 过滤表名
  const filteredTables = tables.filter(table => 
    table.toLowerCase().includes(tableSearchText.toLowerCase())
  );

  // 连接列表表格列定义
  const columns = [
    {
      title: t('连接名称'),
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
      title: t('表名'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_, { name }) => (
        <Space>
          <Button 
            type="primary" 
            size="small" 
            onClick={() => handleImportTable(name)}
            loading={importLoading}
            icon={<ImportOutlined />}
          >
            {t('导入')}
          </Button>
          <Button
            size="small"
            onClick={() => handleViewTableInfo(name)}
            loading={tableInfoLoading}
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
              onClick={() => setConnectModalVisible(true)}
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
                  onClick={() => setConnectModalVisible(true)}
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
        open={connectModalVisible}
        onCancel={() => {
          if (!submitting) {
            setConnectModalVisible(false);
            setFormErrors({});
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
                validateStatus={formErrors.name ? 'error' : undefined}
                help={formErrors.name}
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
                validateStatus={formErrors.host ? 'error' : undefined}
                help={formErrors.host}
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
                validateStatus={formErrors.port ? 'error' : undefined}
                help={formErrors.port}
              >
                <InputNumber style={{ width: '100%' }} min={1} max={65535} />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="database"
            label={t('数据库名称')}
            rules={[{ required: true }]}
            validateStatus={formErrors.database ? 'error' : undefined}
            help={formErrors.database || t('要连接的MySQL数据库名称')}
          >
            <Input placeholder={t('输入数据库名称')} autoComplete="off" />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label={t('用户名')}
                rules={[{ required: true }]}
                validateStatus={formErrors.username ? 'error' : undefined}
                help={formErrors.username}
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
                validateStatus={formErrors.password ? 'error' : undefined}
                help={formErrors.password}
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
                      setConnectModalVisible(false);
                      setFormErrors({});
                      form.resetFields();
                    }}
                    block
                    disabled={submitting}
                  >
                    {t('取消')}
                  </Button>
                </Col>
                <Col span={12}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    block 
                    loading={submitting}
                    disabled={submitting}
                  >
                    {submitting ? t('连接中...') : t('连接')}
                  </Button>
                </Col>
              </Row>
              
              {Object.keys(formErrors).length > 0 && (
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
        open={tablesModalVisible}
        onCancel={() => {
          setTablesModalVisible(false);
          setSelectedRowKeys([]);
        }}
        width={800}
        footer={[
          <Button 
            key="close" 
            onClick={() => {
              setTablesModalVisible(false);
              setSelectedRowKeys([]);
            }}
          >
            {t('关闭')}
          </Button>,
          <Button 
            key="import" 
            type="primary" 
            disabled={selectedRowKeys.length === 0}
            onClick={handleBatchImportTables}
          >
            {t('批量导入选中表')} ({selectedRowKeys.length})
          </Button>
        ]}
      >
        <Spin spinning={tablesLoading}>
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder={t('搜索表名')}
              value={tableSearchText}
              onChange={e => setTableSearchText(e.target.value)}
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 200, marginRight: 8 }}
            />
            <span style={{ marginLeft: 8 }}>
              {t('共 {count} 个表', { count: tables.length })}
              {tableSearchText && `, ${t('匹配 {count} 个', { count: filteredTables.length })}`}
            </span>
          </div>
          
          {tables.length > 0 ? (
            <Table 
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
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
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button 
            key="close" 
            onClick={() => setDetailModalVisible(false)}
          >
            {t('关闭')}
          </Button>,
          <Button 
            key="view" 
            type="primary" 
            onClick={() => {
              setDetailModalVisible(false);
              if (connectionDetail) {
                handleViewTables(connectionDetail.id);
              }
            }}
          >
            {t('查看表')}
          </Button>
        ]}
      >
        {connectionDetail && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label={t('连接名称')}>{connectionDetail.name}</Descriptions.Item>
            <Descriptions.Item label={t('主机')}>{connectionDetail.host}</Descriptions.Item>
            <Descriptions.Item label={t('端口')}>{connectionDetail.port}</Descriptions.Item>
            <Descriptions.Item label={t('数据库')}>{connectionDetail.database}</Descriptions.Item>
            <Descriptions.Item label={t('用户名')}>{connectionDetail.username}</Descriptions.Item>
            <Descriptions.Item label={t('状态')}>
              <Badge 
                status={connectionDetail.status === 'connected' ? 'success' : 'default'} 
                text={connectionDetail.status === 'connected' ? t('已连接') : t('已断开')} 
              />
            </Descriptions.Item>
            {connectionDetail.createdAt && (
              <Descriptions.Item label={t('创建时间')}>
                {new Date(connectionDetail.createdAt).toLocaleString()}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default MySQLConnectionList;