// MySQLDataSourceConfigForm.tsx - MySQL数据源配置表单
import React from 'react';
import { Form, Input, InputNumber, Button, message } from 'antd';
import { useAPIClient } from '@nocobase/client';

interface MySQLDataSourceConfigProps {
  onSubmit?: (values: any) => void;
  onCancel?: () => void;
  initialValues?: any;
}

export const MySQLDataSourceConfigForm: React.FC<MySQLDataSourceConfigProps> = ({
  onSubmit,
  onCancel,
  initialValues
}) => {
  const [form] = Form.useForm();
  const apiClient = useAPIClient();

  const handleSubmit = async (values: any) => {
    try {
      // 测试连接
      const response = await apiClient.request({
        url: 'mysql:connect',
        method: 'post',
        data: values,
      });

      if (response.data) {
        message.success('连接测试成功！');
        onSubmit?.(values);
      }
    } catch (error) {
      message.error(`连接失败: ${error.message}`);
    }
  };

  const testConnection = async () => {
    try {
      const values = form.getFieldsValue();
      await form.validateFields();
      
      const response = await apiClient.request({
        url: 'mysql:connect',
        method: 'post',
        data: values,
      });

      if (response.data) {
        message.success('连接测试成功！');
      }
    } catch (error) {
      message.error(`连接测试失败: ${error.message}`);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={handleSubmit}
    >
      <Form.Item
        name="name"
        label="数据源名称"
        rules={[{ required: true, message: '请输入数据源名称' }]}
      >
        <Input placeholder="例如: 外部MySQL数据库" />
      </Form.Item>

      <Form.Item
        name="host"
        label="主机地址"
        rules={[{ required: true, message: '请输入主机地址' }]}
      >
        <Input placeholder="例如: localhost 或 192.168.1.100" />
      </Form.Item>

      <Form.Item
        name="port"
        label="端口"
        rules={[{ required: true, message: '请输入端口号' }]}
      >
        <InputNumber
          min={1}
          max={65535}
          placeholder="3306"
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        name="database"
        label="数据库名"
        rules={[{ required: true, message: '请输入数据库名' }]}
      >
        <Input placeholder="数据库名称" />
      </Form.Item>

      <Form.Item
        name="username"
        label="用户名"
        rules={[{ required: true, message: '请输入用户名' }]}
      >
        <Input placeholder="数据库用户名" />
      </Form.Item>

      <Form.Item
        name="password"
        label="密码"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password placeholder="数据库密码" />
      </Form.Item>

      <Form.Item>
        <Button type="default" onClick={testConnection} style={{ marginRight: 8 }}>
          测试连接
        </Button>
        <Button type="primary" htmlType="submit" style={{ marginRight: 8 }}>
          确认
        </Button>
        {onCancel && (
          <Button onClick={onCancel}>
            取消
          </Button>
        )}
      </Form.Item>
    </Form>
  );
}; 