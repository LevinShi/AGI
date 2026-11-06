# AI Quota · 先看额度，再选工具

**把多个 AI 订阅的剩余额度和恢复时间，放进一个 Mac 窗口。**

你同时订了几个 AI 工具，却总要逐个打开官网，才知道哪个还能用。AI Quota 的桌面应用 **Quota Desk** 把这些信息集中起来，帮你决定下一项工作用哪个账户。

[下载 v0.5.1](https://github.com/LevinShi/AGI/releases/tag/ai-quota-v0.5.1) · Apple Silicon Mac · macOS 13+ · MIT

## 一个使用场景

准备开始长任务时，你看到：

```text
工具 A   剩余 12%   两小时后恢复
工具 B   剩余 78%   周额度
→ 先用 B，等 A 恢复后再切回。
```

这是说明性示例。实际界面按厂商提供的周期展示；读不到就标未知，不把旧数值伪装成最新额度。

你可以查看剩余比例、5小时／周／月额度和恢复时间，调整产品顺序，单独刷新。适合同时用多个订阅的人；如果只用一个产品，官方页面可能已经够用。

## 三步开始

1. 在 [Release](https://github.com/LevinShi/AGI/releases/tag/ai-quota-v0.5.1) 下载 `QuotaDesk-v0.5.1-macos-arm64.zip`，解压并打开 `Quota Desk.app`。
2. 在所需的官方客户端登录。部分产品还需要 CLI 或 Tabbit，先看[接入条件](docs/CONNECTORS.md)。
3. 点击产品旁的刷新按钮，查看额度和读取状态。

无需另装 Node.js。应用尚无 Apple Developer ID 签名及公证；首次打开可能被 macOS 拦截，可信来源下的处理方式见[使用说明](docs/USAGE.md)。

## 下载前的四个问题

**支持哪些产品？** 代码已有 Codex、Cursor、Kimi、MiniMax、ZCode、Grok Bot、YouMind、Muse.ai 的读取路径，但不是所有套餐都兼容。Codex额度不等于全部ChatGPT用量，Grok Bot路径也不是通用xAI额度接口。[逐项条件与边界](docs/CONNECTORS.md)。

**数字是实时的吗？** 不是。运行期间每个账户每24小时尝试自动更新一次，也可手动刷新。失败会保留旧值并显示状态；恢复时间按北京时间展示。它是额度快照，不是实时计费工具。

**会读取聊天吗？** 不读取对话或代码。额度缓存在本机；部分连接器会临时使用官方客户端或已登录网页的凭证，向厂商查询。内部接口可能变化或触发风控，本地运行不等于零风险。[隐私与账号边界](docs/PRIVACY.md)。

**支持 Windows、Intel Mac 或自动切换工具吗？** 当前发布包只支持 Apple Silicon Mac。它帮你看额度，不替你发送消息、处理任务或切换模型。

## 文件怎么找

`src/` 是额度读取与计算，`public/` 是界面，`desktop/` 是Mac窗口，`scripts/` 是构建，`test/` 是测试。详细操作集中在 `docs/`，版本变化见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

[使用与额度口径](docs/USAGE.md) · [开发与构建](docs/DEVELOPMENT.md) · [第三方声明](THIRD_PARTY_NOTICES.md) · [MIT许可](LICENSE)
