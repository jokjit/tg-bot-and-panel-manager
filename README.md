# Telegram 双向聊天机器人

一个部署在Cloudflare上的 Telegram 双向私聊中转机器人，通过配套的桌面客户端一键完成部署与管理。

## 功能

- 用户 ↔ 管理员双向私聊中转
- 管理员群**话题模式**（每个用户独立话题）
- 黑名单、信任用户、多管理员授权
- 首次私聊验证与基础风控
- 关键词过滤
- 独立后台管理面板（Cloudflare Pages）

## 项目结构

```
worker.js          # Cloudflare Worker 主逻辑（Webhook + API）
wrangler.toml      # Worker 部署配置
migrations/        # D1 数据库 Schema
admin-panel/       # 后台管理面板（Vue 3 + Vite，部署到 Pages）
electron-app/      # 桌面部署客户端（Electron）
scripts/           # 部署辅助脚本（由客户端调用）
```

## 部署方式

使用 `electron-app/` 中的桌面客户端完成所有部署操作，无需手动执行命令行。

### 构建客户端

```bash
cd electron-app
npm install
npm run build
```

生成 `electron-app/dist/tg-bot-deploy.exe`，将其放到仓库根目录运行。

### 部署流程

1. 打开客户端，在左侧添加 Cloudflare 账号（API Token + Account ID）
2. 点击**首次部署向导**，填写：
   - `BOT_TOKEN`（从 [@BotFather](https://t.me/BotFather) 获取）
   - `ADMIN_CHAT_ID`（管理员 Telegram ID，从 [@userinfobot](https://t.me/userinfobot) 获取）
   - Worker 地址（可选，留空使用 workers.dev 默认域名）
   - 面板地址（可选，Pages 独立域名）
3. 点击开始，客户端自动完成 D1 初始化、Worker 部署、Secret 写入、面板部署

### 后续操作

| 操作 | 说明 |
|---|---|
| 部署 Worker | 更新 `worker.js` 后重新部署 |
| 部署面板 | 更新 `admin-panel/` 后重新部署 |
| 初始化 D1 | 首次启用历史消息功能时执行 |
| 切换账号 | 在左侧点击不同账号即可切换 |

## 配置说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `BOT_TOKEN` | 是 | Telegram Bot Token |
| `ADMIN_CHAT_ID` | 是 | 管理员 Chat ID 或超级群 ID |
| `TOPIC_MODE` | 否 | `true` 启用话题模式 |
| `USER_VERIFICATION` | 否 | `true` 启用首次验证 |
| `WEBHOOK_SECRET` | 建议 | Webhook 安全密钥 |
| `ADMIN_API_KEY` | 建议 | 后台 API 访问密钥 |
| `PUBLIC_BASE_URL` | 否 | Worker 自定义域名 |
| `ADMIN_PANEL_URL` | 否 | Pages 面板地址 |

## 首次登录后台

部署完成后，`BOT_TOKEN` 和 `ADMIN_CHAT_ID` 生效时，系统会自动向管理员发送一条包含**临时密码**的消息（1小时有效）。

使用临时密码登录 `<worker_url>/admin` 后会跳转到改密页，设置永久密码。

如未收到临时密码，在管理员 Telegram 会话中发送 `/panelpass` 重发。

## 本地开发

```bash
npm install
npm run dev        # 启动 wrangler dev
npm run build:panel  # 构建 admin-panel
```
