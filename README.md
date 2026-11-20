# DuoAI-AGENT-mobile

移动端可用的多 Agent 笔记库助手（桌面版 DuoAI-Agent-hub 的移动化改造）。在 Obsidian 手机 / 平板 / 桌面端直接与多种 AI Agent 对话，让 Agent 通过受控工具阅读、整理、改写你的笔记库。

A mobile-ready multi-agent vault assistant (the mobile port of DuoAI-Agent-hub). Chat with several AI agents inside Obsidian on phone / tablet / desktop and let them read, organize and rewrite your vault through gated tools.

## 功能 / Features

- **内置协议，无需 CLI / Built-in protocols, no CLI**：所有 Agent 均在插件内直接完成鉴权与模型调用，不依赖任何外部命令行程序，手机上开箱即用。
- **仅限 vault 的工具 / Vault-only tools**：列出 / 读取 / 搜索 / 创建 / 修改 / 追加 / 精确编辑 / 重命名 / 删除笔记，创建文件夹；联网搜索、抓取网页、下载图片入笔记。
- **三级权限确认 / Three-tier permissions**：读取免确认；写入需确认；删除强确认。可切换「最高权限」模式或会话级放行；确认弹窗超时自动拒绝。
- **移动安全的存储 / Mobile-safe storage**：凭据保存在插件数据（data.json），会话历史通过 vault adapter 读写（history.json），不使用任何 Node 文件系统 API。
- **纯浏览器网络与加密 / Browser-only networking & crypto**：网络一律 Obsidian `requestUrl`（非流式）；COSY 签名加密用 node-forge（纯 JS）；随机数用 WebCrypto；PKCE 用 `crypto.subtle`。
- **双语界面 / Bilingual UI**：中文 / English，自动跟随 Obsidian 语言。
- **会话历史 / Session history**：自动保存最近 50 条会话，可随时继续；右键复制消息。

## 支持的 Agent / Supported agents

| Agent | 协议 / Protocol | 登录方式 / Sign-in |
| --- | --- | --- |
| 千问办公 QwenWork | 内置 COSY | 设备流（浏览器授权 + 自动轮询）/ Device flow |
| Qoder CN | 内置 COSY | 设备流或 PAT / Device flow or PAT |
| Claude Code | Anthropic Messages | API Key，或浏览器授权 + 手动粘贴授权码（PKCE）/ API Key or manual-code OAuth |
| Codex | OpenAI | API Key（移动端不提供 OpenAI 浏览器 OAuth）/ API Key only on mobile |
| 豆包办公 Doubao | OpenAI 兼容（火山方舟）/ OpenAI-compatible (Volcano Ark) | API Key |
| 自定义 Custom | 任意 OpenAI 兼容 / Any OpenAI-compatible | Base URL + API Key + 模型 ID |

> 桌面版的 WorkBuddy（CLI）与其他 CLI 形态 Agent 在移动端不可用，已移除。
> The desktop WorkBuddy (CLI) agent and other CLI-based agents are not available on mobile and have been removed.

## 安装 / Installation

### BRAT（推荐 / recommended）

1. 安装社区插件 **BRAT**（Beta Reviewers Auto-update Tester）。
2. BRAT 设置 → Add Beta plugin → 填入本仓库地址 `https://github.com/sxpwx/DuoAI-AGENT-mobile`。
3. 启用插件 **DuoAI-AGENT-mobile**。

### 手动 / Manual

1. 从 Release 下载 `main.js`、`manifest.json`、`styles.css`。
2. 放入笔记库的 `.obsidian/plugins/duoai-agent-mobile/` 目录。
3. 在 Obsidian 设置 → 第三方插件中启用。

手机上可先在桌面端装好再同步 `.obsidian/plugins` 目录，或用支持插件管理的移动端工具。
On phones, install on desktop first and sync the `.obsidian/plugins` folder, or use a mobile plugin manager.

## 行为披露 / Behavior disclosure

- **网络 / Network**：插件会直连各 Agent 官方网关（gateway.qwenwork.cn、openapi/gateway.qoder.com.cn、api.anthropic.com、claude.ai、console.anthropic.com、api.openai.com、chatgpt.com、ark.cn-beijing.volces.com 或你自定义的 Base URL）完成登录、模型列表与聊天请求；联网工具会访问 Bing / 百度与你指定的公网网页。所有请求经 Obsidian `requestUrl` 发出，**非流式**：回复在请求完成后整体呈现。
- **凭据 / Credentials**：API Key、OAuth 令牌、COSY 登录态仅保存在本设备插件数据文件中，不上传到任何第三方服务器（官方鉴权端点除外）。
- **工具边界 / Tool boundary**：Agent 只能操作当前 vault；路径校验拒绝绝对路径、上级目录与隐藏目录；写入仅限 `.md` / `.canvas`；删除移入回收站可恢复。联网工具仅允许公网 http/https（阻断内网 / 回环地址），图片下载校验类型与 10MB 上限。
- **COSY 协议 / COSY protocol**：千问办公 / Qoder CN 协议移植自 MIT 社区实现（@magpie-community/opencode-qoder-auth / CLIProxyAPI），请求头携带机器标识（移动端为固定占位值）与账号令牌，与官方客户端行为一致。
- **无遥测 / No telemetry**：插件不含任何统计、上报或广告代码。

## 开发构建 / Development

```bash
npm install
npm run build   # tsc 类型检查请另跑 npx tsc --noEmit；产物 main.js
npm run dev     # 带 inline sourcemap 的开发构建
```

- 入口仅 `src/main.ts`；esbuild `platform: "browser"`、`format: "cjs"`、`target: "es2020"`、`external: ["obsidian"]`。
- `src/` 内禁止 Node 专用模块（child_process / fs / http / https / os / path / node:*）；加密用 node-forge，随机数用 `globalThis.crypto.getRandomValues`，UUID 为自实现 v4。

## 许可 / License

见 LICENSE 与 NOTICE.md（含第三方协议移植声明）。See LICENSE and NOTICE.md (includes third-party protocol porting notices).