# Telegram 双向聊天机器人

一个部署在 Cloudflare 上的 Telegram 双向私聊中转机器人，通过配套桌面客户端完成部署、更新和管理。

## 功能

- 用户和管理员双向私聊中转
- 管理员群话题模式，每个用户独立话题
- 黑名单、信任名单、多管理员授权
- 首次私聊验证和基础风控
- 关键词过滤
- Cloudflare Pages 后台管理面板
- Worker 自定义域名入口，支持 `/webhook` 和 `/admin`

## 项目结构

```text
worker.js          # Cloudflare Worker 后端，处理 Webhook 和管理 API
wrangler.toml      # 本地部署配置模板，部署工具读取它，不再调用 Wrangler CLI
migrations/        # D1 数据库 Schema
admin-panel/       # 后台管理面板，Vue 3 + Vite，部署到 Cloudflare Pages
electron-app/      # 桌面部署客户端，Electron
scripts/           # 配置合并和资源初始化辅助脚本
```

## 部署方式

使用 `electron-app/` 中的桌面客户端完成部署。客户端通过 Cloudflare API 创建或更新 Worker、Pages、KV、D1、Secrets 和自定义域名，不需要安装或执行 Wrangler。

### 构建客户端

```bash
cd electron-app
npm install
npm run build
```

安装包输出到 `electron-app/dist/tg-bot-deploy-setup.exe`。

### 首次部署

1. 打开客户端，在左侧添加 Cloudflare 账号，填写 API Token 和 Account ID。
2. 打开首次部署向导，填写 `BOT_TOKEN`、`ADMIN_CHAT_ID`、Worker 地址和面板地址。
3. 点击开始部署，客户端会自动初始化 KV/D1、上传 Worker、写入 Secrets、绑定 Worker 自定义域名、部署 Pages 面板。
4. 推荐入口为 `https://你的Worker域名/admin`，Worker 会把 `/admin` 跳转到 Pages 面板。

### 后续操作

| 操作 | 说明 |
|---|---|
| 部署 Worker | 更新 `worker.js` 后重新上传覆盖 |
| 部署面板 | 更新 `admin-panel/` 后重新构建并上传 Pages |
| 初始化 KV/D1 | 自动创建或复用当前 Cloudflare 账号下的资源 |
| 切换账号 | 客户端按 Cloudflare Account ID 隔离本地配置和资源绑定 |

## 配置说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `BOT_TOKEN` | 是 | Telegram Bot Token |
| `ADMIN_CHAT_ID` | 是 | 管理员 Chat ID 或超级群 ID |
| `TOPIC_MODE` | 否 | 默认 `true`，启用管理员群话题模式 |
| `USER_VERIFICATION` | 否 | `true` 启用首次验证 |
| `WEBHOOK_SECRET` | 建议 | Telegram Webhook 安全密钥 |
| `ADMIN_API_KEY` | 建议 | 后台 API 访问密钥 |
| `PUBLIC_BASE_URL` | 否 | Worker 对外地址，例如自定义域名 |
| `ADMIN_PANEL_URL` | 否 | Cloudflare Pages 面板地址 |

## 首次登录后台

部署完成后，Worker 会通过 Telegram API 设置 Webhook，并向 `ADMIN_CHAT_ID` 发送后台临时密码。临时密码 1 小时有效。

使用临时密码登录 `<worker_url>/admin` 后，系统会引导设置永久密码。若未收到临时密码，可在管理员 Telegram 会话中发送 `/panelpass` 重发。

## 话题模式

首次部署默认启用话题模式。`ADMIN_CHAT_ID` 建议填写已开启话题功能的 Telegram 超级群 ID，并确保机器人已加入该群且具备创建/管理话题权限。

如果只想让机器人私聊管理员个人账号，可以在后台设置里关闭 `TOPIC_MODE` 后重新部署 Worker。

## 本地开发

```bash
npm --prefix electron-app run start
npm run build:panel
```
