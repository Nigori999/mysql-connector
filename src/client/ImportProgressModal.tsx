// src/client/ImportProgressModal.tsx - 导入进度显示组件
import React, { useState, useEffect } from 'react';
import { 
  Modal, Progress, Table, Button, Space, Typography, Alert, 
  Tag, Spin, notification, Divider 
} from 'antd';
import { 
  CheckCircleOutlined, ExclamationCircleOutlined, 
  ClockCircleOutlined, ReloadOutlined 
} from '@ant-design/icons';
import { useMySQLConnections } from './MySQLConnectionsContext';

const { Title, Text } = Typography;

interface ImportProgressModalProps {
  visible: boolean;
  onClose: () => void;
  progressId: string | null;
  connectionId: string | null;
}

export const ImportProgressModal: React.FC<ImportProgressModalProps> = ({
  visible,
  onClose,
  progressId,
  connectionId
}) => {
  const { getImportProgress, clearImportProgress, retryFailedImports } = useMySQLConnections();
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // 轮询获取进度
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const fetchProgress = async () => {
      if (!progressId) return;
      
      try {
        const response = await getImportProgress(progressId);
        if (response?.data?.success) {
          setProgress(response.data.data);
          
          // 如果完成或失败，停止轮询
          if (response.data.data?.status === 'completed' || 
              response.data.data?.status === 'failed') {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        }
      } catch (error) {
        console.error('获取进度失败:', error);
      }
    };

    if (visible && progressId) {
      // 立即获取一次
      fetchProgress();
      
      // 如果状态是running，开始轮询
      if (progress?.status === 'running') {
        intervalId = setInterval(fetchProgress, 2000); // 每2秒更新一次
      }
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [visible, progressId, progress?.status, getImportProgress]);

  // 重试失败的导入
  const handleRetry = async () => {
    if (!progressId || !connectionId) return;
    
    setRetrying(true);
    try {
      await retryFailedImports(progressId, connectionId);
      notification.success({
        message: '重试已启动',
        description: '正在重新导入失败的表'
      });
    } catch (error) {
      notification.error({
        message: '重试失败',
        description: error.message || '启动重试任务失败'
      });
    } finally {
      setRetrying(false);
    }
  };

  // 关闭模态框
  const handleClose = async () => {
    if (progressId && progress?.status === 'completed') {
      try {
        await clearImportProgress(progressId);
      } catch (error) {
        console.warn('清除进度信息失败:', error);
      }
    }
    onClose();
  };

  // 状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'pending':
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      default:
        return <Spin size="small" />;
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '表名',
      dataIndex: 'tableName',
      key: 'tableName',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Space>
          {getStatusIcon(status)}
          <Tag color={
            status === 'success' ? 'green' : 
            status === 'failed' ? 'red' : 
            status === 'pending' ? 'blue' : 'orange'
          }>
            {status === 'success' ? '成功' :
             status === 'failed' ? '失败' :
             status === 'pending' ? '等待中' : '处理中'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      render: (error: string) => error ? (
        <Text type="danger" style={{ fontSize: '12px' }}>
          {error}
        </Text>
      ) : '-',
    },
  ];

  if (!progress) {
    return (
      <Modal
        title="导入进度"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="close" onClick={onClose}>
            关闭
          </Button>
        ]}
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>正在加载进度信息...</div>
        </div>
      </Modal>
    );
  }

  const progressPercent = progress.total > 0 ? 
    Math.round(((progress.completed + progress.failed) / progress.total) * 100) : 0;

  const failedCount = progress.failed || 0;
  const hasFailedItems = failedCount > 0;

  return (
    <Modal
      title="批量导入进度"
      open={visible}
      onCancel={handleClose}
      width={800}
      footer={[
        hasFailedItems && progress.status === 'completed' && (
          <Button 
            key="retry" 
            icon={<ReloadOutlined />}
            onClick={handleRetry}
            loading={retrying}
          >
            重试失败项
          </Button>
        ),
        <Button 
          key="close" 
          type={progress.status === 'completed' ? 'primary' : 'default'}
          onClick={handleClose}
        >
          {progress.status === 'completed' ? '完成' : '关闭'}
        </Button>
      ].filter(Boolean)}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 总体进度 */}
        <div>
          <Title level={5}>总体进度</Title>
          <Progress 
            percent={progressPercent}
            status={
              progress.status === 'completed' ? 
                (hasFailedItems ? 'exception' : 'success') : 
                'active'
            }
            format={() => `${progress.completed + progress.failed}/${progress.total}`}
          />
          <div style={{ marginTop: '8px' }}>
            <Space>
              <Text>成功: <Text type="success">{progress.completed}</Text></Text>
              <Text>失败: <Text type="danger">{progress.failed}</Text></Text>
              <Text>总数: {progress.total}</Text>
            </Space>
          </div>
        </div>

        {/* 状态提示 */}
        {progress.status === 'running' && (
          <Alert
            message="正在导入中"
            description="请耐心等待，导入过程可能需要一些时间..."
            type="info"
            showIcon
          />
        )}
        
        {progress.status === 'completed' && !hasFailedItems && (
          <Alert
            message="导入完成"
            description="所有表已成功导入到NocoBase中"
            type="success"
            showIcon
          />
        )}
        
        {progress.status === 'completed' && hasFailedItems && (
          <Alert
            message="导入完成（部分失败）"
            description={`${progress.completed}个表导入成功，${failedCount}个表导入失败。您可以点击"重试失败项"来重新导入失败的表。`}
            type="warning"
            showIcon
          />
        )}

        <Divider />

        {/* 详细进度表格 */}
        <div>
          <Title level={5}>详细进度</Title>
          <Table
            columns={columns}
            dataSource={progress.details || []}
            rowKey="tableName"
            pagination={false}
            size="small"
            scroll={{ y: 300 }}
          />
        </div>
      </Space>
    </Modal>
  );
}; 