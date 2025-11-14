# n8n-nodes-x

这是一个 n8n 社区节点包，提供了多个实用的节点集成，包括 GitHub Issues 和 iCafe 操作。

[n8n](https://n8n.io/) 是一个 [fair-code 许可](https://docs.n8n.io/reference/license/) 的工作流自动化平台。

[安装](#安装)  
[节点说明](#节点说明)  
[凭证配置](#凭证配置)  
[兼容性](#兼容性)  
[开发](#开发)  
[资源](#资源)

## 安装

按照 [n8n 社区节点文档](https://docs.n8n.io/integrations/community-nodes/installation/) 中的安装指南进行安装。

## 节点说明

本包包含以下节点：

### 1. GitHub Issues 节点

GitHub Issues 节点提供了完整的 GitHub Issues 集成功能，使用声明式风格构建：

- **低代码方式** - 无需编写请求逻辑，通过声明式定义操作
- 多个资源（Issues、Comments）
- 多个操作（Get、Get All、Create）
- 两种认证方式（OAuth2 和个人访问令牌）
- 列表搜索功能，支持动态下拉选择
- 完善的错误处理和类型定义

**支持的操作：**

- 获取 Issue
- 获取所有 Issues
- 创建 Issue
- 获取 Issue 评论

### 2. iCafe 节点

iCafe 节点用于与百度 iCafe 系统集成，支持查询卡片和评论卡片等操作。

**支持的操作：**

- **查询卡片** - 根据 IQL 查询条件获取卡片列表
- **查询卡片详情** - 根据卡片 ID 获取卡片详情
- **评论卡片** - 对指定卡片添加评论
- **解析卡片详情** - 卡片详情 HTML 转义字符解析

### 3. Example 节点

示例节点，展示了基本的节点结构和自定义 `execute` 方法的实现方式。

## 凭证配置

### GitHub Issues 凭证

支持两种认证方式：

1. **OAuth2 认证** (`GithubIssuesOAuth2Api`)
   - 需要配置 OAuth2 客户端 ID 和客户端密钥
   - 适用于需要用户授权的场景

2. **个人访问令牌** (`GithubIssuesApi`)
   - 需要配置 GitHub 个人访问令牌
   - 适用于自动化场景

### iCafe 凭证

`ICafeApi` 凭证需要配置以下信息：

- **baseURL** - iCafe API 基础 URL（默认：`http://icafeapi.baidu-int.com`）
- **space** - 空间标识（必填）
- **username** - 用户名（评论操作时必填）
- **password** - 密码（评论操作时必填）

## 兼容性

- **n8n 版本**: 建议使用最新版本的 n8n
- **Node.js 版本**: v22 或更高版本

## 开发

### 本地开发

启动开发环境：

```bash
npm run dev
```

这将启动 n8n 并加载你的节点，支持热重载。

### 构建

构建生产版本：

```bash
npm run build
```

### 代码检查

检查代码错误：

```bash
npm run lint
```

自动修复问题：

```bash
npm run lint:fix
```

### 可用脚本

| 脚本                | 描述                                    |
| ------------------- | --------------------------------------- |
| `npm run dev`         | 启动 n8n 并监听文件变化                 |
| `npm run build`       | 编译 TypeScript 到 JavaScript           |
| `npm run build:watch` | 监听模式构建（自动重建）                |
| `npm run lint`        | 检查代码错误和风格问题                  |
| `npm run lint:fix`    | 自动修复可修复的代码问题                |
| `npm run release`     | 创建新版本发布                           |

## 资源

- [n8n 节点文档](https://docs.n8n.io/integrations/creating-nodes/) - 构建节点的完整指南
- [n8n 社区论坛](https://community.n8n.io/) - 获取帮助和分享你的节点
- [@n8n/node-cli 文档](https://www.npmjs.com/package/@n8n/node-cli) - CLI 工具参考
- [n8n 社区节点文档](https://docs.n8n.io/integrations/#community-nodes) - 社区节点使用指南

## 许可证

[MIT](LICENSE.md)
