# 开发、构建与许可

请先进入仓库的 `AI Quota/` 目录再执行命令。

## 从源码开发与构建

需要 macOS、Xcode Command Line Tools（含 Swift 编译器）、Node.js 22 或以上。运行时没有额外 npm 包依赖。

```sh
npm test
npm start
npm run build:desktop
npm run build:release
npm run export:source
```

`npm start` 启动本地网页服务用于开发；`build:desktop` 生成依赖本机 Node 的开发 App；**只分发 `build:release` 生成的 release ZIP**，不要分发开发构建。

发布构建复制正在运行构建脚本的 Node 可执行文件，并要求其安装根目录提供完整 `LICENSE`。使用可信的官方 Node 发行版；CPU 架构跟随构建机器，不会自动跨平台编译。发布产物包括 ZIP 和 SHA-256 校验文件。ZIP 外层附带本说明与许可，App 内也附带 Node 许可。

`export:source` 按明确文件清单导出可发布源码到 `dist/source/quota-desk`，排除本地数据、开发报告及截图。

架构为 Swift/AppKit 窗口 + WKWebView、原生 JavaScript 界面、仅本机监听的 Node 服务和按厂商拆分的连接器。`src/catalog.js` 定义产品，`src/domain.js` 统一口径，连接器负责读取并校验额度，`src/service.mjs` 管理缓存、失败状态和刷新节奏。

新增产品应提供：固定官方请求范围、明确的登录前提、仅含额度的返回字段、原始周期到统一视图的映射、缺失字段与重置边界测试。优先使用官方稳定接口；不能证明分母或周期时返回未知，不推算虚假百分比。不得把真实账号数据提交为测试样本。

## 测试范围与限制

自动测试覆盖额度转换、Kimi 月度与 Code 去重、YouMind 分母与额外积分隔离、Muse 周期识别、隐私字段剔除、时区边界、错误与缓存语义等。桌面冒烟检查使用合成数据验证原生窗口和页面加载。开发时的实际账号验证仅说明当时机器与账号可用，不能替代其他用户环境的兼容性测试；相关私人验证资料不随发布提供。

## 参考项目与许可

本项目的原创代码采用 [MIT 许可](../LICENSE)，允许个人与商业使用、修改和再分发；再分发代码或其重要部分时需保留版权及许可文本。MIT **不要求将你的修改公开**，也不提供任何担保。MIT 不改变第三方组件原有许可，也不赋予任何厂商品牌或私有 API 的使用权。

| 项目 | 本项目参考内容 | 上游许可 |
| --- | --- | --- |
| [Token Monitor](https://github.com/Javis603/token-monitor) | 紧凑用量展示与信息组织 | MIT |
| [OpenQuota](https://github.com/deviffyy/OpenQuota) | 产品排序、状态与桌面交互思路 | MIT |
| [CodexBar](https://github.com/steipete/CodexBar) | 多厂商额度模型与接入方式；可解析部分 JSON 结构 | MIT |
| [MiniMax Code](https://github.com/MiniMax-AI/minimax-code) | 官方客户端认证服务协议参考 | MIT |
| [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) | 官方 Code 登录／额度结构参考 | Apache-2.0 |
| [Node.js](https://github.com/nodejs/node) | 发布包实际附带的 JavaScript 运行环境 | MIT 及其内嵌第三方许可 |

Quota Desk 不是以上项目的官方发行版，也没有把 CodexBar 的完整后端或 Token Monitor 的完整前端直接打包进来。更详细的使用关系和许可链接见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
