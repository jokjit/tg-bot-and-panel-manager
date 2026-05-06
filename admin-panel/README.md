# 后台管理面板

这是 Telegram 双向聊天项目的后台前端，基于 Vue 3、Vite 和 Naive UI。

## 功能

- 仪表盘状态查看
- 用户管理
- 黑名单和信任名单管理
- 管理员管理
- 关键词配置
- 消息模板配置
- 系统设置
- 后台密码修改

## 本地开发

```bash
npm install
npm run dev
```

可选 `.env.local`：

```bash
VITE_WORKER_BASE_URL=https://your-worker-domain
VITE_CANONICAL_HOST=tg-admin.example.com
```

## 构建

```bash
npm run build
```

构建产物输出到 `admin-panel/dist`。

## 部署

使用 TG Bot 部署工具部署。部署工具会构建面板，并通过 Cloudflare API 直接上传到 Cloudflare Pages，不再调用 Wrangler CLI。
