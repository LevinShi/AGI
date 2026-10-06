AI Quota 的首个可分发 macOS 版本，桌面应用名称为 Quota Desk。

## 下载与启动

下载 `QuotaDesk-v0.5.0-macos-arm64.zip`，解压后运行，或将 App 拖入“应用程序”。适用于 M 系列 Mac，macOS 13+；随包附带 Node.js，无需另装运行环境。尚未经过 Apple Developer ID 签名和公证，首次启动可能需要在“隐私与安全性”中确认可信来源后允许打开。

## 本版功能

- 汇总账户额度，统一剩余百分比与 5 小时／周／月视图；北京时间恢复时间。
- 完整产品名称、可调整顺序、单项与全部刷新，每 24 小时自动尝试更新。
- 已实现 Codex、Cursor、Kimi 综合会员与 Code、MiniMax Token Plan、ZCode、Grok Bot、YouMind、Muse.ai 的指定读取路径。
- 不同产品需要各自官方客户端、CLI 或 Tabbit 的登录状态；不是所有套餐的通用额度接口。Gemini 隐藏，Claude/OpenCode Go 尚未接通。

完整接入条件、计算口径、隐私与账号风险见 [项目 README](https://github.com/LevinShi/AGI/tree/main/AI%20Quota)。

## 隐私与验证

发行文件不含开发者账号登录信息、真实额度缓存或私人截图。附带 MIT 许可、第三方声明和 Node.js 完整许可。41 项自动测试通过，并验证了 ZIP 解压到新位置后使用自带 Node 启动、窗口最小化、关闭与重新打开。尚未覆盖所有 macOS 版本或其他用户的厂商账号组合。

`SHA256SUMS` 提供两个 ZIP 的校验值。源码压缩包只包含 AI Quota 子项目；GitHub 自动生成的整个仓库源码还会包含仓库内其他项目。
