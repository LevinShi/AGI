# 安装与配置

以下配置与当前RC1技能文件保持一致。它固定要求 `gpt-5.6-sol`、`gpt-5.6-luna`、`gpt-5.6-terra`；这些模型在你的环境中是否可选，需要先核对。不可用时应报告配置缺口，不要声称已按RC1运行。本次只整理文档，不修改模型路由或技能行为。

## Installation

### User installation

1. Copy this folder to `~/.codex/skills/deep-research/`.
2. Copy `researcher.toml` to `~/.codex/agents/researcher.toml` for a personal agent, or to the project’s `.codex/agents/researcher.toml` for a project-scoped agent.
3. Keep `evidence.md` as a template; copy it into each research project before starting a run.

The custom agent file must remain read-only. Do not add a model field to it: Sol must explicitly choose `gpt-5.6-luna` or `gpt-5.6-terra` for each QID.

### Agent invocation

Run the Director on `gpt-5.6-sol` and invoke:

```text
Use $deep-research for: [decision question]
Reader/decision: [who will act and what decision follows]
Scope: [geography, period, channel, definitions, exclusions]
Output: conclusion first, with Evidence IDs, boundaries, and unresolved Unknowns
```

The agent creates the Charter inside the Ledger, routes QIDs in one batch, performs Research → Judge, and stops after one default bounded repair round. It must disclose any missing agent configuration or failed quality gate.


## 模板与私有资料

`SKILL.md`、`researcher.toml`、`evidence.md`保留在包根目录；技能依赖相对位置。安装时复制完整deep-research目录。每次研究另建工作账本，来源摘录与敏感资料不要写回公开模板。
