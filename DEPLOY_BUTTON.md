# 一键部署按钮说明

本项目支持使用 Cloudflare 官方的 **Deploy to Cloudflare** 按钮快速初始化 Worker。

## 按钮代码

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jokjit/tg-bot-and-panel-manager)
```

## 使用方式

1. 先把本项目推送到你自己的公开 GitHub 仓库。
2. 将上面的仓库地址替换为你的真实仓库地址。
3. 把按钮放到根目录 `README.md` 顶部。

替换示例：

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jokjit/tg-bot-and-panel-manager)
```

## 作用范围

- 支持：Cloudflare Worker 部分
- 不支持：`admin-panel` 的 Pages 一键部署

`admin-panel` 仍建议在 Cloudflare Pages 控制台中连接 Git 仓库部署。

## 说明

- 这是 Cloudflare Workers 官方部署按钮。
- Cloudflare 官方文档说明该按钮支持自动创建 KV 等资源。
- 你的仓库仍需要保留正确的 `wrangler.toml` 配置。
- 私密配置如 `BOT_TOKEN`、`ADMIN_CHAT_ID` 等仍建议通过 Secret 手动填写。

## 官方文档

- Deploy Buttons：<https://developers.cloudflare.com/workers/platform/deploy-buttons/>
