# TG Bot Android 部署客户端（MVP）

这个目录是移动端部署客户端，目标是和 `exe` 类似：在手机本地一键完成 Worker 部署。

## 已实现流程

1. Cloudflare API 初始化 / 复用 KV Namespace
2. Cloudflare API 初始化 / 复用 D1 Database
3. Cloudflare API 初始化 / 复用 R2 Bucket，并绑定为 `IMAGE_BUCKET`
4. 自动执行 `migrations/*.sql`
5. 上传 `worker.js`（multipart + metadata bindings）
6. 自动启用 `workers.dev`，或绑定你填写的自定义域名
7. 自动创建 / 复用 Pages 项目并直传管理面板静态资源
8. 回写 `ADMIN_PANEL_URL` 到 Worker 变量并重新上传生效
9. 写入 Worker Secrets：`BOT_TOKEN`、`ADMIN_CHAT_ID`、`DEPLOY_BOOTSTRAP_TOKEN`
10. 调用 `/deploy/bootstrap` 完成 Webhook / 命令 / 面板初始密码链路

部署配置中的“图床独立域名”对应 `IMAGE_PUBLIC_BASE_URL`。默认开启一键配置：部署器会自动识别 Zone、把域名绑定到 R2 bucket、创建一年 Edge TTL 的缓存规则并轮询证书状态。图片访客流量直接走 R2/CDN，不经过 Worker。Token 需要 R2 Edit、Zone Read 和 Cache Rules Edit 权限；若域名已经手工配置，可关闭自动配置选项。

## 本地开发

```bash
cd mobile-app
npm install
npm run dev
```

## 构建 Web 资源

```bash
npm run build
```

构建前会自动执行 `npm run sync-assets`，将根目录的部署资源打包进 app：

- `worker.js`
- `wrangler.toml`
- `migrations/*.sql`
- `admin-panel/dist/*`（用于 Pages 直传）

## 生成 Android 工程

```bash
npm run cap:add
npm run cap:sync
npm run cap:open
```

说明：

- `cap:add` 只需要执行一次。
- 之后每次改动前端后，执行 `npm run build && npm run cap:sync`。
- 在 Android Studio 中可直接运行到真机，或 `Build > Build APK(s)` 导出 APK。

## 打包约定（默认流程）

- 测试包使用 debug：
  - `cd android && gradlew.bat assembleDebug`
  - 产物：`android/app/build/outputs/apk/debug/app-debug.apk`
- 正式发布使用签名 release：
  - `cd android && gradlew.bat assembleRelease`
  - 如果检测到 `android/keystore/release-v2.3.credentials.txt`（或同名环境变量），会自动使用签名配置；
  - 产物：`android/app/build/outputs/apk/release/app-release.apk`

## 注意事项

- 在桌面浏览器调试时，Cloudflare API 可能受 CORS 影响；安卓原生运行会走 `CapacitorHttp`，不受浏览器 CORS 限制。
- 直传 Pages 前请确保 `admin-panel/dist` 是你希望发布的版本（`sync-assets` 会直接打包该目录）。
