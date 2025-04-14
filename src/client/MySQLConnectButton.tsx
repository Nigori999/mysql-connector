// client/MySQLConnectButton.tsx - 连接按钮组件
import React from 'react';
import { Button } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export const MySQLConnectButton = () => {
  const navigate = useNavigate();

  return (
    <Button 
      icon={<DatabaseOutlined />} 
      onClick={() => navigate('/admin/mysql-connections')}
    >
      MySQL 连接器
    </Button>
  );
};