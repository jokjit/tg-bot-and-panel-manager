# Telegram 双向聊天机器人

一个部署在 Cloudflare 上的 Telegram 双向私聊中转机器人，通过配套桌面客户端完成部署、更新和管理。

## 功能

- 用户和管理员双向私聊中转
- 管理员群话题模式，每个用户独立话题
- 黑名单、信任名单、多管理员授权
- 首次私聊验证和基础风控
- 关键词过滤
- R2 图床，支持图片上传、公开链接、分页管理和删除
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

使用 `electron-app/` 中的桌面客户端完成部署。客户端通过 Cloudflare API 创建或更新 Worker、Pages、KV、D1、R2、Secrets 和自定义域名，不需要安装或执行 Wrangler。

### 构建客户端

该项目已发布便携式客户端

```bash
npm ci
npm --prefix electron-app ci
npm --prefix electron-app run build
```

安装包输出到 `electron-app/dist/tg-bot-deploy-setup.exe`。

### 首次部署
##机器人创建与话题模式群聊id获取

1.Telegram Bot：找 @BotFather 申请一个机器人，获取 Token。
  重要设置：在 BotFather 中关闭 Group Privacy (/mybots > Settings > Group Privacy > Turn off)。
2.管理员群组：创建一个 Telegram 群组，并开启话题功能 (Topics)。
  将机器人拉入群组，并设为管理员（给予管理话题权限）。
  获取群组 ID（通常以 -100 开头）。 获取 SUPERGROUP_ID 小技巧： 在 Telegram 桌面端右键群内任意消息，复制消息链接；链接里会有一段 -100xxxxxxxxxx 或 xxxxxxxxxx；若只看到纯数字   xxxxxxxxxx，在前面加上 -100，就是完整的 SUPERGROUP_ID（私密频道/群组同理）。
### 电脑端
1. 打开客户端，在左侧添加 Cloudflare 账号，填写 API Token 和 Account ID。

cloudflare api设置
<img width="1108" height="517" alt="image" src="https://github.com/user-attachments/assets/ec8a1aa4-40e9-40c7-8f3e-72a4910fd427" />
开启图床功能需用到r2，API需增加以下权限
<img width="1171" height="137" alt="image" src="https://github.com/user-attachments/assets/6f88a2f8-aaa3-44f1-a630-2e95a5ebf30a" />


  下边的选择包含你的cloudflare账户

2. 打开首次部署向导，填写 `BOT_TOKEN`、`ADMIN_CHAT_ID`，并在高级选项中按需填写 Worker 地址、验证页面域名（`VERIFY_PUBLIC_BASE_URL`）、pages域名建议不填写使用cf默认分配的即可（已改为只读状态）。
3. 点击开始部署，客户端会自动初始化 KV/D1/R2、上传 Worker、写入 Secrets、绑定 Worker 自定义域名、部署 Pages 面板。R2 bucket 默认使用 `<worker-name>-images`。填写“图床独立域名”（例如 `https://img.example.com`）后，部署器会通过 Cloudflare API 自动识别 Zone、绑定 R2 自定义域名、创建独立缓存规则并轮询证书状态；Cloudflare 会同步创建所需 DNS 记录。
4. 面板入口为 `https://你的Worker域名/admin`，Worker 会自动重定向跳转到 Pages 管理面板。
5. 面板登录密码，在部署完成后会发送到你绑定的tg上，没收到可以使用机器人命令获取当前的临时密码，还可以强制重新生成
6. 使用临时密码登录面板后，会让修改密码，改密码为永久密码，存储在kv里，后续可以在面板当中修改

### 手机端
跟电脑一样填写好变量，点击开始部署即可一键部署

pages域名一样建议不填使用默认分配好的即可，直接在你的worker域名后加 `/admin`,进行访问


### tg设置
1. 创建一个群聊，并开启话题模式
2. 把创建好的机器人bot拉进群聊，并授予管理员权限


### 后续操作

| 操作 | 说明 |
|---|---|
| 部署 Worker | 更新 `worker.js` 后重新上传覆盖 |
| 部署面板 | 更新 `admin-panel/` 后重新构建并上传 Pages |
| 初始化 KV/D1/R2 | 自动创建或复用当前 Cloudflare 账号下的资源 |
| 切换账号 | 客户端按 Cloudflare Account ID 隔离本地配置和资源绑定 |

### 数据索引与分页

用户资料、黑名单和信任名单以 KV 保存运行时状态，并同步写入 D1 查询索引。升级已有部署后，定时维护会使用 KV cursor 分批回填历史数据；回填完成前后台继续读取完整 KV 列表，完成后自动切换到 D1 分页查询，D1 查询异常时仍会回退 KV。

管理员可通过 `POST /admin/api/maintenance/directory-index-backfill` 手动推进回填，JSON 参数支持 `batchSize` 和 `reset`。`GET /admin/api/status` 的 `directoryIndexBackfill` 字段包含当前阶段、cursor、处理数量和完成状态。

### 图床

后台“图床”页面支持 JPG、PNG、WebP 和 GIF，单张最大 10 MB。图片原文件保存在 R2，元数据和分页索引保存在 D1，SVG 不允许上传。

配置 `IMAGE_PUBLIC_BASE_URL=https://img.example.com` 后，公开地址格式为 `<image_domain>/<object-key>`，访客直接访问 R2 自定义域名和 Cloudflare 边缘缓存，不经过 Worker。未配置时回退为 `<worker_url>/media/<object-key>`，用于本地开发和旧部署兼容。

自动配置需要 Token 至少具备 Account 的 R2 Edit，以及目标 Zone 的 Read 和 Cache Rules Edit 权限；部分账户策略还会要求 DNS Edit。部署器只增改带有 `TG Bot image hosting cache:` 标记的规则，不会覆盖 Zone 中的其他缓存规则。若域名已经手工绑定，可关闭“自动绑定 R2 域名并创建缓存规则”。

图片域名应在 R2 bucket 的“自定义域”中完成绑定，并配置匹配该 hostname 的缓存规则。建议 Edge TTL 一年；图片对象使用不可变 UUID key，因此无需覆盖同名对象。

Cloudflare API Token 需要包含 R2 编辑权限；升级已有部署后重新执行一次 Worker 部署，客户端会自动创建 bucket、执行 `0005_image_assets.sql` 并补齐 `IMAGE_BUCKET` 绑定。

## 配置说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `BOT_TOKEN` | 是 | Telegram Bot Token |
| `ADMIN_CHAT_ID` | 是 | 管理员 Chat ID 或超级群 ID |
| `TOPIC_MODE` | 否 | 默认 `true`，启用管理员群话题模式 |
| `USER_VERIFICATION` | 否 | `true` 启用首次验证 |
| `PUBLIC_BASE_URL` | 否 | Worker 对外地址，例如自定义域名 |
| `VERIFY_PUBLIC_BASE_URL` | 否 | 验证页面对外域名；留空时默认使用 `PUBLIC_BASE_URL` |
| `IMAGE_PUBLIC_BASE_URL` | 否 | R2 图床自定义域名，例如 `https://img.example.com`；留空时使用 Worker `/media` 回退 |

## 首次登录后台

部署完成后，Worker 会通过 Telegram API 设置 Webhook，并向 `ADMIN_CHAT_ID` 发送后台临时密码。临时密码 1 小时有效。

使用临时密码登录 `<worker_url>/admin` 后，系统会引导设置永久密码。若未收到临时密码，可在管理员 Telegram 会话中发送 `/panelpass` 重发。

## 话题模式

首次部署默认启用话题模式。`ADMIN_CHAT_ID` 建议填写已开启话题功能的 Telegram 超级群 ID，并确保机器人已加入该群且具备创建/管理话题权限。

如果只想让机器人私聊管理员个人账号，可以在后台设置里关闭 `TOPIC_MODE` 

