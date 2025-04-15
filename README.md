# NocoBase MySQL 连接器插件使用指南

## 插件介绍

NocoBase MySQL 连接器是一个功能强大的插件，允许您连接外部 MySQL 数据库并将其表导入为 NocoBase 集合。通过这个插件，您可以轻松地集成和使用外部数据库中的数据，而无需复杂的编程操作。

### 主要功能

- 连接多个外部 MySQL 数据库
- 浏览和查看数据库表结构
- 导入数据库表作为 NocoBase 集合
- 支持批量导入表

## 安装指南

### 前提条件

- 已安装 NocoBase v1.6.20 或更高版本
- 具有插件管理权限的管理员账户
- 外部 MySQL 数据库的访问凭据（主机地址、端口、数据库名、用户名和密码）

### 安装步骤

1. 登录到 NocoBase 管理员控制台
2. 进入"插件管理"页面
3. 点击"添加插件"
4. 选择"从 NPM 安装"，输入包名：`@nocobase/plugin-mysql-connector`
5. 点击"安装"按钮
6. 安装完成后，启用插件

## 使用说明

### 创建数据库连接

1. 在 NocoBase 管理面板中，点击"设置"
2. 在设置菜单中找到"外部 MySQL 连接"选项
3. 点击"新建连接"按钮
4. 填写连接信息：
   - **连接名称**：为您的连接起一个易于识别的名称
   - **主机地址**：MySQL 服务器的主机名或 IP 地址
   - **端口**：MySQL 服务器端口（默认为 3306）
   - **数据库名称**：要连接的数据库名
   - **用户名**：有权访问该数据库的用户名
   - **密码**：对应用户的密码
5. 点击"连接"按钮

> **安全提示**：建议使用只读权限的数据库用户，以保证数据安全。

### 查看和导入表

1. 成功创建连接后，在连接列表中找到您的连接
2. 点击"查看表"按钮，显示数据库中所有可用的表
3. 您可以：
   - 使用搜索框筛选表名
   - 点击"查看结构"查看表的详细字段信息
   - 点击"导入"按钮将单个表导入为 NocoBase 集合
   - 选择多个表后点击"批量导入选中表"

### 导入表的注意事项

- 导入后的集合名称默认为 `mysql_表名`
- 导入过程会自动映射数据类型：
  - 整数类型 → integer
  - 浮点类型 → float
  - 日期时间类型 → datetime/date/time
  - 布尔类型 → boolean
  - 其他类型 → string
- 主键关系会被保留
- 导入完成后，您可以在 NocoBase 的数据表管理中找到新创建的集合

### 管理连接

- **查看连接详情**：点击连接名称可查看连接的详细信息
- **断开连接**：点击"断开"按钮可断开与数据库的连接（注意：这不会删除导入的集合）
- **刷新连接列表**：点击页面右上角的"刷新"按钮

## 使用场景示例

### 场景一：集成遗留系统数据

您可以连接到公司现有的 MySQL 数据库，将产品、客户或订单等关键表导入到 NocoBase 中，以便在新的低代码应用中使用这些数据，而无需迁移整个数据库。

### 场景二：数据分析和报表

连接到包含业务数据的 MySQL 数据库，导入相关表后，利用 NocoBase 的可视化和报表功能创建直观的数据分析仪表板。

### 场景三：构建混合应用

将部分数据保留在现有的 MySQL 数据库中（由其他系统维护），同时在 NocoBase 中创建新的功能和界面，形成一个混合应用架构。

## 故障排除

### 常见错误及解决方法

1. **无法连接到指定主机/端口**
   - 检查主机地址和端口是否正确
   - 确认 MySQL 服务器是否运行
   - 检查网络连接和防火墙设置

2. **用户名或密码不正确**
   - 验证用户名和密码
   - 确认用户是否有权限访问指定的数据库

3. **数据库不存在**
   - 确认数据库名称拼写正确
   - 确认数据库是否已创建

4. **导入表失败**
   - 检查用户是否有读取表结构的权限
   - 查看 NocoBase 日志获取详细错误信息

## 最佳实践

1. **使用只读账户**：为了保证数据安全，建议使用只有SELECT权限的只读数据库用户

2. **合理命名**：为连接和导入的表使用清晰、一致的命名规则

3. **定期刷新**：如果外部数据库结构发生变化，可能需要重新导入表

4. **性能考虑**：导入过多或过大的表可能会影响性能，建议只导入必要的表

## 限制与注意事项

- 当前版本不支持自动同步外部数据库结构的变化
- 不支持双向数据同步，导入的集合更改不会反映到原始MySQL表
- 复杂的表关系可能需要手动在NocoBase中重新设置
- 不支持MySQL的所有高级数据类型和特性

---

感谢使用 NocoBase MySQL 连接器插件！如有任何问题或建议，请通过 GitHub 仓库 (https://github.com/Nigori999/nocobase-plugin-mysql-connector) 提交反馈。