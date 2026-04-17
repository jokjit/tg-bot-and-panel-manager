# Telegram 双向聊天机器人（Cloudflare Workers）

一个可直接部署到 **Cloudflare Workers** 的 Telegram 双向聊天项目，提供：

- 用户 ↔ 管理员双向私聊中转
- 支持管理员群 **话题模式（forum topics）**
- 黑名单、信任用户、管理员授权
- 首次私聊验证、防刷与基础风控
- 主后台由 `admin-panel`（Cloudflare Pages）接管，Worker 仅保留 `/admin` 入口跳转与 `/admin/api/*` 接口
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

### 后台侧（Pages 主面板）

- 登录鉴权与密码修改
- 运行状态仪表盘
- Webhook 一键设置与检查
- 用户列表查询
- 黑名单 / 信任名单管理
- 管理员管理
- 系统配置维护
- 关键词与消息模板维护

> 当前默认架构：**Pages 作为唯一主后台入口**。Worker 的 `/admin` 在配置 `ADMIN_PANEL_URL` 后会直接跳转到 Pages，仅在未配置时显示轻量提示页；完整后台 UI 不再由 Worker 承载。
## 技术架构

- `worker.js`：Cloudflare Worker 主入口，负责 Telegram Webhook、消息转发、状态接口与 `/admin/api/*`
- `wrangler.toml`：Worker 部署配置
- `admin-panel/`：Vue 3 + Vite + Naive UI 主后台前端，部署到 Cloudflare Pages
- `BOT_KV`：Cloudflare KV，用于保存系统配置、管理员密码、用户状态、授权和映射数据

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

[[kv_namespaces]]
binding = "BOT_KV"

[vars]
WEBHOOK_PATH = "/webhook"
TOPIC_MODE = "false"
USER_VERIFICATION = "false"
WELCOME_TEXT = "你好，欢迎使用私聊中转机器人。"
BLOCKED_TEXT = "你已被管理员限制联系，如有需要请稍后再试。"
```

### 推荐配置说明

- `TOPIC_MODE=true`：启用管理员群话题模式
- `USER_VERIFICATION=true`：启用首次验证

如果你要启用 `TOPIC_MODE` 或 `USER_VERIFICATION`，请先确保 `BOT_KV` 已在部署时创建成功。

## 第四步：准备 KV（自动创建）

本项目使用 `BOT_KV` 保存：

- 面板首次登录密码
- 用户资料
- 话题映射
- 黑名单 / 信任名单
- 首次验证状态

当前 `wrangler.toml` 已保留：

```toml
[[kv_namespaces]]
binding = "BOT_KV"
```

在新版 Wrangler、Deploy Button 或 GitHub Actions 流程下，Cloudflare 可以在部署时自动创建这个 KV 资源。

## 可选：一键初始化 D1（历史消息）

如果你想给项目增加聊天历史能力，可以使用 D1。仓库已提供一键初始化脚本：

```bash
npm run setup:d1 -- --database-name tg-bot-history --binding DB --remote
```

这个脚本会自动：

- 创建 D1 数据库
- 把 `database_name` 和 `database_id` 写回本地部署配置；公开仓库模板中不要保留真实 `database_id`
- 执行 `migrations/0001_message_history.sql`

查看帮助：

```bash
npm run setup:d1 -- --help
```

> 说明：这一步只是先把 D1 和历史消息表结构准备好，后续我再帮你把 Worker 实际的消息写入和后台查询界面接上。

当前仓库已接入第一版历史消息：

- 用户发给机器人的消息会写入 D1
- 管理员回复用户的消息会写入 D1
- 后台新增“历史消息”页面，可按用户 ID 或最近记录查看

## 第五步：配置 Secret

如果你是手动部署，建议至少配置以下 Secret：

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_CHAT_ID
```

说明：

- `BOT_TOKEN`：机器人 Token，必要项
- `ADMIN_CHAT_ID`：管理员群或管理员私聊 ID，必要项

其中：

- `BOT_TOKEN` 和 `ADMIN_CHAT_ID` 是机器人正常工作的必要项
- 这两个值可以在 Worker Secrets/Vars 中配置，也可以在首次登录后台后写入 KV 覆盖
- 当这两个值可用后，系统会自动生成一个 1 小时有效的首次临时密码，并发送到 `ADMIN_CHAT_ID`
- 如果后台里清空某个字段，系统会回退使用 Worker 当前环境变量中的值
- 其他像 `ADMIN_IDS`、`WEBHOOK_SECRET`、`ADMIN_API_KEY`、`PUBLIC_BASE_URL`、`ADMIN_PANEL_URL` 等配置，后续都可以在面板中维护，不必在首次部署时一次性填满

## 第六步：部署 Worker

建议使用 `wrangler 4.45+`，以便和当前仓库的自动资源创建流程保持一致。

```bash
npm install
npm run deploy
```

如果你还没有自定义域名，系统会默认使用 Cloudflare 分配的 `workers.dev` 地址。

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

或者进入后台面板点击 “Set Webhook”。如果没有配置 `PUBLIC_BASE_URL`，Webhook 会自动使用当前 Worker 的默认访问域名。后台主入口建议始终使用 Pages 域名。

## GitHub Actions 全自动部署

仓库已包含自动部署工作流：`.github/workflows/deploy.yml:1`

触发方式：

- 推送到 `main`
- 在 GitHub Actions 页面手动执行 `workflow_dispatch`

### 需要配置的 GitHub Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `BOT_TOKEN`
- `ADMIN_CHAT_ID`

### 可选的 GitHub Variables

- `PAGES_PROJECT_NAME`：Pages 项目名，默认 `tg-admin-panel`
- `PUBLIC_BASE_URL`：如果你已有 Worker 自定义域名，可显式指定；不填则自动回退到 `workers.dev`
- `ADMIN_PANEL_CANONICAL_HOST`：如果你有正式后台域名，可用于 Pages 自动跳转
- `CF_PAGES_BRANCH`：Pages 生产分支，默认 `main`

### 自动部署流程

1. 自动部署 Worker
2. 自动写入 `BOT_TOKEN`、`ADMIN_CHAT_ID`
3. 自动创建或复用 `BOT_KV`
4. 自动生成首次临时密码并发送到 `ADMIN_CHAT_ID`
5. 自动解析 Worker 访问地址
6. 自动创建或复用 Pages 项目
7. 自动构建并发布 `admin-panel`

如果管理员没有收到首次临时密码，可以在 Telegram 管理会话里使用：

- `/panelpass`：重发当前仍有效的临时密码
- `/panelreset`：强制生成一个新的临时密码并发送

> `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 只用于 GitHub Actions 调用 Cloudflare API 和 Wrangler 发版，不参与机器人业务运行。

也可以检查当前 Webhook：

```text
https://your-worker.your-subdomain.workers.dev/getWebhookInfo
```

## 第八步：部署主后台到 Cloudflare Pages

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

### 后台域名（推荐作为唯一主入口）

例如：

- `https://tg-admin.example.com`

然后把：

- Worker 里的 `ADMIN_PANEL_URL`（建议指向 Pages 正式域名）
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
- `admin-panel` 应通过 **Cloudflare Pages** 部署，并作为唯一主后台入口
- Cloudflare 官方文档说明 Deploy Button 支持自动创建 KV 等资源，但你的仓库需要保留正确的 Wrangler 配置

## 常用环境变量

### 初始必填

- `BOT_TOKEN`
- `ADMIN_CHAT_ID`

### 后续可在面板维护

- `ADMIN_IDS`
- `PUBLIC_BASE_URL`
- `ADMIN_PANEL_URL`
- 面板登录永久密码
- `TOPIC_MODE`
- `USER_VERIFICATION`
- `WELCOME_TEXT`
- `BLOCKED_TEXT`
- 其他扩展配置

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

### 3. Pages 后台登录失败

请检查：

- `BOT_TOKEN` 与 `ADMIN_CHAT_ID` 是否已正确配置
- Worker 与前端的域名是否一致
- `VITE_WORKER_BASE_URL` 是否指向正确 Worker

## 相关文档

- Cloudflare Deploy Buttons：<https://developers.cloudflare.com/workers/platform/deploy-buttons/>
- Wrangler 配置：<https://developers.cloudflare.com/workers/wrangler/configuration/>
- Wrangler Secret：<https://developers.cloudflare.com/workers/wrangler/commands/#secret>
- Cloudflare Pages 构建配置：<https://developers.cloudflare.com/pages/configuration/build-configuration/>

## 许可证

如需对外开源，建议你补充 `MIT` 或你自己的许可证文件。
