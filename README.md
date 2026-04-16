# Telegram 双向聊天机器人（Cloudflare Workers）

一个可直接部署到 **Cloudflare Workers** 的 Telegram 双向聊天项目，提供：

- 用户 ↔ 管理员双向私聊中转
- 支持管理员群 **话题模式（forum topics）**
- 黑名单、信任用户、管理员授权
- 首次私聊验证、防刷与基础风控
- 内置 `/admin` 后台页面与独立 `admin-panel` 前端
- 支持 `Workers + KV + Pages` 的标准化部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jokjit/tg-bot-and-panel-manager)

> 使用前请先把上面按钮里的仓库地址替换成你自己的公开 GitHub 仓库地址。

## 项目介绍

这个项目适合做以下场景：

- Telegram 私聊客服
- 频道/社群咨询入口
- 人工客服中转机器人
- 小团队工单接待机器人
- 需要“用户单开线程”的私聊管理场景

项目核心思路是：

1. 用户给机器人发私聊消息。
2. Worker 接收 Telegram Webhook。
3. 消息被转发到管理员私聊或管理员群话题。
4. 管理员回复后，消息再回传给对应用户。
5. KV 保存用户状态、授权、黑白名单、话题映射等数据。

## 功能清单

### 机器人侧

- 文本消息双向转发
- 管理员命令回复：`/reply 用户ID 内容`
- 黑名单：`/ban`、`/unban`、`/blacklist`
- 信任用户：`/trust`、`/untrust`
- 管理员授权：`/adminadd`、`/admindel`、`/admins`
- 用户查询：`/user`、`/users`
- 首次验证重置：`/restart`
- 关键词命中后自动处理
- 用户资料同步与头像代理
- Webhook 设置 / 删除 / 查询

### 后台侧

- 登录鉴权与密码修改
- 运行状态仪表盘
- Webhook 一键设置与检查
- 用户列表查询
- 黑名单 / 信任名单管理
- 管理员管理
- 系统配置维护
- 关键词与消息模板维护

## 技术架构

- `worker.js`：Cloudflare Worker 主入口
- `wrangler.toml`：Worker 部署配置
- `admin-panel/`：Vue 3 + Vite + Naive UI 后台前端
- `BOT_KV`：Cloudflare KV，用于保存机器人运行状态

```text
.
├─ worker.js
├─ wrangler.toml
├─ package.json
├─ README.md
├─ DEPLOY_BUTTON.md
├─ 项目说明.md
└─ admin-panel/
   ├─ src/
   ├─ public/
   ├─ .env.example
   ├─ package.json
   └─ README.md
```

## 部署前准备

你需要提前准备：

- 一个 Telegram Bot
- 一个 Cloudflare 账号
- 一个 GitHub 仓库
- Node.js 18+
- `npm` 或 `pnpm`

建议额外准备：

- 一个管理员超级群组
- 已开启 Topics 的超级群（如果你要用话题模式）
- 一个后台域名，例如 `tg-admin.example.com`
- 一个 Worker 域名，例如 `tg.example.com`

## 第一步：创建 Telegram 机器人

1. 在 Telegram 中打开 `@BotFather`
2. 执行 `/newbot`
3. 按提示创建机器人
4. 记录得到的 `BOT_TOKEN`

如果你要让机器人在管理员群内工作：

1. 把机器人拉进管理员群
2. 给予发消息权限
3. 若要使用 Topics，请确保该群为超级群并已开启 Topics
4. 记录管理员群的 `ADMIN_CHAT_ID`

## 第二步：准备 Git 仓库

把当前项目推送到你自己的 GitHub 仓库，然后把 README 中的一键部署按钮地址替换成你的真实仓库地址：

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jokjit/tg-bot-and-panel-manager)
```

替换示例：

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jokjit/tg-bot-and-panel-manager)
```

## 第三步：配置 Worker

编辑 `wrangler.toml`：

```toml
name = "telegram-private-chatbot"
main = "worker.js"
compatibility_date = "2026-04-16"
workers_dev = true

[vars]
WEBHOOK_PATH = "/webhook"
PUBLIC_BASE_URL = "https://your-worker.your-subdomain.workers.dev"
ADMIN_PANEL_URL = "https://tg-admin.example.com"
TOPIC_MODE = "false"
USER_VERIFICATION = "false"
WELCOME_TEXT = "你好，欢迎使用私聊中转机器人。"
BLOCKED_TEXT = "你已被管理员限制联系，如有需要请稍后再试。"
```

### 推荐配置说明

- `PUBLIC_BASE_URL`：Worker 对外地址
- `ADMIN_PANEL_URL`：后台前端地址
- `TOPIC_MODE=true`：启用管理员群话题模式
- `USER_VERIFICATION=true`：启用首次验证

如果你要启用 `TOPIC_MODE` 或 `USER_VERIFICATION`，请先绑定 `BOT_KV`。

## 第四步：创建 KV（推荐）

在仓库根目录执行：

```bash
npm install
npx wrangler login
npx wrangler kv namespace create BOT_KV
npx wrangler kv namespace create BOT_KV --preview
```

把返回的 `id` 和 `preview_id` 填回 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "BOT_KV"
id = "<YOUR_KV_NAMESPACE_ID>"
preview_id = "<YOUR_KV_PREVIEW_NAMESPACE_ID>"
```

## 第五步：配置 Secret

建议至少配置以下 Secret：

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_CHAT_ID
npx wrangler secret put ADMIN_IDS
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put ADMIN_PANEL_PASSWORD
```

说明：

- `BOT_TOKEN`：机器人 Token
- `ADMIN_CHAT_ID`：管理员群或管理员私聊 ID
- `ADMIN_IDS`：可选，多管理员用户 ID 列表
- `WEBHOOK_SECRET`：建议配置
- `ADMIN_API_KEY`：后台 API Key，建议配置
- `ADMIN_PANEL_PASSWORD`：后台初始密码

## 第六步：部署 Worker

```bash
npm install
npm run deploy
```

如果你还没有根域名，默认会拿到一个 `workers.dev` 地址。

部署完成后，访问根路径确认状态：

```text
https://your-worker.your-subdomain.workers.dev/
```

你会看到当前 Worker 的状态信息，包括 webhook 地址、是否绑定 KV、是否已配置 Token 等。

## 第七步：设置 Telegram Webhook

部署成功后，访问：

```text
https://your-worker.your-subdomain.workers.dev/setWebhook
```

或者进入后台面板点击 “Set Webhook”。

也可以检查当前 Webhook：

```text
https://your-worker.your-subdomain.workers.dev/getWebhookInfo
```

## 第八步：部署后台前端到 Cloudflare Pages

进入前端目录：

```bash
cd admin-panel
npm install
```

创建本地配置文件：

```bash
cp .env.example .env.local
```

如果你在 Windows PowerShell 中执行，可以手动新建 `admin-panel/.env.local`，内容参考：

```bash
VITE_WORKER_BASE_URL=https://your-worker.your-subdomain.workers.dev
VITE_CANONICAL_HOST=tg-admin.example.com
```

本地调试：

```bash
npm run dev
```

生产构建：

```bash
npm run build
```

### 一键脚本部署面板

你也可以在仓库根目录直接运行下面这条命令，一次完成依赖安装、构建和 Pages 发布：

```bash
npm run deploy:panel -- --project-name tg-admin-panel --worker-base-url https://your-worker.your-subdomain.workers.dev --canonical-host tg-admin.example.com
```

常用参数：

- `--project-name`：Pages 项目名，默认 `tg-admin-panel`
- `--worker-base-url`：必填，前端请求的 Worker 地址
- `--canonical-host`：可选，正式后台域名
- `--branch`：可选，部署到指定分支环境
- `--account-id`：可选，显式指定 Cloudflare 账户 ID

查看脚本帮助：

```bash
npm run deploy:panel -- --help
```

> 注意：如果这个 Pages 项目还不存在，首次脚本部署通常会创建一个 Direct Upload 类型的 Pages 项目。若你计划长期使用 Git 自动部署，建议先在 Cloudflare Pages 控制台创建项目，再用这个脚本做后续发布。

### Pages 控制台推荐配置

- Framework preset：`Vue`
- Root directory：`admin-panel`
- Build command：`npm run build`
- Build output directory：`dist`

也可以命令行部署：

```bash
npx wrangler pages deploy dist --project-name tg-admin-panel
```

## 第九步：绑定自定义域名（可选）

### Worker 域名

例如：

- `https://tg.example.com`

然后把 `PUBLIC_BASE_URL` 改成你的正式域名。

### 后台域名

例如：

- `https://tg-admin.example.com`

然后把：

- Worker 里的 `ADMIN_PANEL_URL`
- 前端的 `VITE_CANONICAL_HOST`

都改成你的正式后台域名。

## 一键部署说明

本仓库已经预留 **Deploy to Cloudflare** 按钮，适合快速初始化 Worker。

按钮地址格式：

```text
https://deploy.workers.cloudflare.com/?url=<YOUR_GITHUB_REPO_URL>
```

按钮示例：

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jokjit/tg-bot-and-panel-manager)
```

注意：

- 这个按钮是 **Cloudflare Workers 官方能力**
- 它主要用于部署 Worker
- `admin-panel` 仍建议通过 **Cloudflare Pages** 单独部署
- Cloudflare 官方文档说明 Deploy Button 支持自动创建 KV 等资源，但你的仓库需要保留正确的 Wrangler 配置

## 常用环境变量

### `vars`

- `WEBHOOK_PATH`
- `PUBLIC_BASE_URL`
- `ADMIN_PANEL_URL`
- `TOPIC_MODE`
- `USER_VERIFICATION`
- `WELCOME_TEXT`
- `BLOCKED_TEXT`

### `secret`

- `BOT_TOKEN`
- `ADMIN_CHAT_ID`
- `ADMIN_IDS`
- `WEBHOOK_SECRET`
- `ADMIN_API_KEY`
- `ADMIN_PANEL_PASSWORD`

## 常用管理命令

```text
/help
/reply 用户ID 内容
/ban 用户ID 原因
/unban 用户ID
/trust 用户ID 备注
/untrust 用户ID
/restart 用户ID
/users 20
/user 用户ID
/blacklist
/admins
/adminadd 用户ID 备注
/admindel 用户ID
```

## 常见问题

### 1. `/setWebhook` 失败

请优先检查：

- `BOT_TOKEN` 是否正确
- `PUBLIC_BASE_URL` 是否正确
- Worker 是否已经可公网访问
- 是否设置了错误的 `WEBHOOK_PATH`

### 2. 话题模式不工作

请检查：

- `TOPIC_MODE=true`
- `ADMIN_CHAT_ID` 是否为超级群 ID
- 群组是否开启 Topics
- 是否已经绑定 `BOT_KV`
- 机器人在群里是否有发消息权限

### 3. 后台登录失败

请检查：

- 是否配置了 `ADMIN_PANEL_PASSWORD`
- Worker 与前端的域名是否一致
- `VITE_WORKER_BASE_URL` 是否指向正确 Worker

## 相关文档

- Cloudflare Deploy Buttons：<https://developers.cloudflare.com/workers/platform/deploy-buttons/>
- Wrangler 配置：<https://developers.cloudflare.com/workers/wrangler/configuration/>
- Wrangler Secret：<https://developers.cloudflare.com/workers/wrangler/commands/#secret>
- Cloudflare Pages 构建配置：<https://developers.cloudflare.com/pages/configuration/build-configuration/>

## 许可证

如需对外开源，建议你补充 `MIT` 或你自己的许可证文件。
