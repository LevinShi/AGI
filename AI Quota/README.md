# AI Quota / Quota Desk

[中文](#中文) · [English](#english)

## 中文

### 先看额度，再选工具

**把多个 AI 订阅的剩余额度和恢复时间，放进一个 Mac 窗口。**

你同时订了几个 AI 工具，却总要逐个打开官网，才知道哪个还能用。AI Quota 的桌面应用 **Quota Desk** 把这些信息集中起来，帮你决定下一项工作用哪个账户。

[下载 v0.5.1](https://github.com/LevinShi/AGI/releases/tag/ai-quota-v0.5.1) · Apple Silicon Mac · macOS 13+ · MIT

### 一个使用场景

准备开始长任务时，你看到：

```text
工具 A   剩余 12%   两小时后恢复
工具 B   剩余 78%   周额度
→ 先用 B，等 A 恢复后再切回。
```

这是说明性示例。实际界面按厂商提供的周期展示；读不到就标未知，不把旧数值伪装成最新额度。

你可以查看剩余比例、5小时／周／月额度和恢复时间，调整产品顺序，单独刷新。适合同时用多个订阅的人；如果只用一个产品，官方页面可能已经够用。

### 三步开始

1. 在 [Release](https://github.com/LevinShi/AGI/releases/tag/ai-quota-v0.5.1) 下载 `QuotaDesk-v0.5.1-macos-arm64.zip`，解压并打开 `Quota Desk.app`。
2. 在所需的官方客户端登录。部分产品还需要 CLI 或 Tabbit，先看[接入条件](docs/CONNECTORS.md)。
3. 点击产品旁的刷新按钮，查看额度和读取状态。

无需另装 Node.js。应用尚无 Apple Developer ID 签名及公证；首次打开可能被 macOS 拦截，可信来源下的处理方式见[使用说明](docs/USAGE.md)。

### 下载前的四个问题

**支持哪些产品？** 代码已有 Codex、Cursor、Kimi、MiniMax、ZCode、Grok Bot、YouMind、Muse.ai 的读取路径，但不是所有套餐都兼容。Codex额度不等于全部ChatGPT用量，Grok Bot路径也不是通用xAI额度接口。[逐项条件与边界](docs/CONNECTORS.md)。

**数字是实时的吗？** 不是。运行期间每个账户每24小时尝试自动更新一次，也可手动刷新。失败会保留旧值并显示状态；恢复时间按北京时间展示。它是额度快照，不是实时计费工具。

**会读取聊天吗？** 不读取对话或代码。额度缓存在本机；部分连接器会临时使用官方客户端或已登录网页的凭证，向厂商查询。内部接口可能变化或触发风控，本地运行不等于零风险。[隐私与账号边界](docs/PRIVACY.md)。

**支持 Windows、Intel Mac 或自动切换工具吗？** 当前发布包只支持 Apple Silicon Mac。它帮你看额度，不替你发送消息、处理任务或切换模型。

### 文件怎么找

`src/` 是额度读取与计算，`public/` 是界面，`desktop/` 是Mac窗口，`scripts/` 是构建，`test/` 是测试。详细操作集中在 `docs/`，版本变化见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

[使用与额度口径](docs/USAGE.md) · [开发与构建](docs/DEVELOPMENT.md) · [第三方声明](THIRD_PARTY_NOTICES.md) · [MIT许可](LICENSE)

## English

### Check your quota before choosing your next tool

**See your AI subscriptions’ remaining allowances and reset times in one Mac window.**

If you use several AI tools, checking each account separately gets old. **Quota Desk**, the desktop app in this project, brings those readings together so you can decide which account to use next.

[Download v0.5.1](https://github.com/LevinShi/AGI/releases/tag/ai-quota-v0.5.1) · Apple Silicon Mac · macOS 13+ · MIT

### A typical use case

```text
Tool A   12% remaining   Resets in two hours
Tool B   78% remaining   Weekly allowance
→ Use B now; come back to A after its allowance resets.
```

This is an illustrative example. Actual readings retain each provider’s quota periods. Missing data is marked unknown; old readings are not presented as fresh.

View remaining percentages, five-hour/weekly/monthly allowances, and reset times. Reorder products and refresh them individually. If you only use one service, its own account page may be all you need.

### Get started

1. Download `QuotaDesk-v0.5.1-macos-arm64.zip` from the [release page](https://github.com/LevinShi/AGI/releases/tag/ai-quota-v0.5.1), extract it, and open `Quota Desk.app`.
2. Sign in to the relevant official clients. Some integrations also require a CLI or Tabbit; see the [connection requirements (Chinese)](docs/CONNECTORS.md).
3. Refresh a product to see its allowance and the status of the reading.

Node.js is bundled. The app is not Developer ID-signed or notarized, so macOS may block it on first launch. See the [usage guide (Chinese)](docs/USAGE.md); do not disable system-wide security protections.

### Four questions before downloading

**Which products are supported?** The code includes readers for Codex, Cursor, Kimi, MiniMax, ZCode, Grok Bot, YouMind, and Muse.ai. Compatibility varies by plan and client. Codex limits do not represent all ChatGPT usage, and the Grok Bot integration is not a general xAI quota API. See [per-product requirements (Chinese)](docs/CONNECTORS.md).

**Is it real-time?** No. While the app is running, each account gets an automatic refresh attempt every 24 hours; you can also refresh manually. Failed refreshes retain the previous reading with a status indicator. Reset times use Beijing time. This is a quota snapshot, not a live billing meter.

**Does it read my chats?** No chats or code are read. Quota data is cached locally. Some integrations temporarily use credentials from official clients or signed-in web pages to query providers. Internal interfaces can change or trigger account checks; running locally does not remove that risk. See [privacy details (Chinese)](docs/PRIVACY.md).

**Does it support Windows, Intel Macs, or automatic tool switching?** The current download is for Apple Silicon Macs only. It shows quotas; it does not send messages, carry out tasks, or switch models for you.

### Where things live

`src/` handles quota retrieval and calculations, `public/` contains the UI, `desktop/` the Mac shell, `scripts/` the build tools, and `test/` the tests. Detailed documentation is in `docs/`; changes are listed in [RELEASE_NOTES.md](RELEASE_NOTES.md).

[Development guide, Chinese](docs/DEVELOPMENT.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [MIT License](LICENSE)
