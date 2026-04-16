# Admin Panel

这是 Telegram 双向聊天项目的后台前端，基于 `Vue 3 + Vite + Naive UI`。

## 功能

- 仪表盘状态查看
- 用户管理
- 黑名单 / 信任名单管理
- 管理员管理
- 关键词配置
- 消息模板配置
- 系统设置
- 后台密码修改

## 本地开发

```bash
npm install
```

新建 `admin-panel/.env.local`：

```bash
VITE_WORKER_BASE_URL=https://your-worker.your-subdomain.workers.dev
VITE_CANONICAL_HOST=tg-admin.example.com
```

启动开发环境：

```bash
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `admin-panel/dist`。

## 部署到 Cloudflare Pages

### 推荐控制台配置

- Framework preset：`Vue`
- Root directory：`admin-panel`
- Build command：`npm run build`
- Build output directory：`dist`

### 命令行部署

```bash
npx wrangler pages deploy dist --project-name tg-admin-panel
```

## 重要说明

- `VITE_WORKER_BASE_URL` 指向你的 Worker 地址。
- `VITE_CANONICAL_HOST` 用于把 `pages.dev` 域名跳转到你的正式后台域名。
- 如果不需要自动跳转，可不填写 `VITE_CANONICAL_HOST`。
