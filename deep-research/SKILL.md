---
name: deep-research
description: 以 Research OS Core RC1 执行高风险、证据驱动的深度研究；适用于需要来源覆盖、逐证据回读、反证搜索和不确定性管理的研究，不用于简单事实查询或无需证据链的写作。
---

# Research OS Core RC1

以最低的 `Credits / Quality-Passed Report` 完成研究；质量未通过时，不用低成本掩盖失败。

## 固定架构与边界

- **1 Director：** 当前主 agent 必须使用 `gpt-5.6-sol`。Director 负责立题、批量路由、Ledger 写入、证据判断和最终结论。
- **1 Researcher persona：** 只使用已安装的 `researcher` 自定义 agent。可以按 QID 生成多个实例，但不得创建第二种常驻研究角色。
- **2 phases：** `Research → Judge`。Charter 是 Research 内的启动动作，bounded repair 是 Judge 触发的有界回补；二者都不是新 phase。
- **1 Evidence Ledger：** 每个项目从同目录的 `evidence.md` 复制一份工作副本。Researcher 不写文件；Director 批量追加 worker 返回。
- 不引入 Verifier、Plan Critic、Lane Memo、Compliance Agent、默认 Red Team 或其他常驻角色、文档与关卡。
- 不创建 benchmark，也不把 A/B 测试设为运行前提。

如果 Director 不是 Sol，或 `researcher` 自定义 agent 未安装，先明确报告配置缺口；不得把其他角色静默伪装成 RC1。

## 四个质量不变量

1. **Coverage：** Charter 先定义 Expected Source Map。Judge 对每个必需来源类别核对实际证据；零覆盖必须记为 `SOURCE_GAP`，不能把“未找到”写成“不存在”。
2. **Fidelity：** 每条可用证据必须保留原文、URL、日期和精确定位。Director 亲自选择并回读所有 decisive evidence，同时随机抽查 non-decisive evidence。
3. **Disconfirmation：** 每个 QID 都必须完成 support search 与 counter-search。支持证据充足也不能跳过反证搜索。
4. **Unknown：** 未解决的来源缺口、冲突、语义歧义和失败升级必须显式保留为 `UNKNOWN`；不允许靠推断补齐。

`UNKNOWN` 被完整揭示且结论没有越界时，Unknown gate 可以通过；它不要求研究中没有未知项。

## Phase 1 — Research

### 1. 在 Research 内建立 Charter

Director 在委派前一次性写入 Ledger：

- 决策问题、用户、地区、时间、渠道/业务边界、关键定义与排除项；
- 可独立验证的 QID；
- 每个 QID 的 L/T/S 初始路由及理由；
- Expected Source Map；
- 每个 QID 的完成条件、可接受证据和搜索边界；
- repair budget，默认 `1`。

Expected Source Map 按题型选择来源类别，不使用万能清单。每类至少写明：`class_id`、定义、适用 QID、`required/conditional`、覆盖条件。公司研究通常会考虑公司一手披露、财务/监管文件、本地语言来源、可信独立来源和生态/竞争证据，但只有与本题有关的类别才进入 Charter。

Charter 变更只能由 Director 决定，并以 amendment 追加到 Ledger；不得静默改题。

### 2. Sol 批量路由 L/T/S

| Route | 执行者 | 适用任务 |
|---|---|---|
| `L` | `researcher`，显式使用 `gpt-5.6-luna` | 已知来源中的定位、逐字提取、字段核验、重复格式化 |
| `T` | `researcher`，显式使用 `gpt-5.6-terra` | 跨来源语义对齐、多语言歧义、复杂上下文抽取；仍不做结论判断 |
| `S` | Director `gpt-5.6-sol` 亲自处理 | framing、取舍、因果、承重判断、证据裁决和结论 |

`researcher.toml` 故意不固定模型；每次 spawn 都必须按 Charter 显式指定 Luna 或 Terra。Researcher 绝不自我升级，只能返回 `DONE` 或 `UNCERTAIN`：

- `L → UNCERTAIN`：Director 最多升级一次到 `T`；
- `T → UNCERTAIN`，无论是初始 T 还是 L 升级后的 T：转由 Sol 接管；
- Sol 接管后仍无法解决：记录 `UNKNOWN`，不得继续踢回 subagent。

这使每个 QID 最多发生一次 subagent 升级，即 `Luna → Terra`；`Terra → Sol` 是 Director 接管，不是第二次 subagent 升级。

### 3. 每个 QID 执行双向搜索

Director 给 Researcher 的 assignment 必须包含 QID、route、适用 Source Map、地域/语言/时间边界、batch ID、完成条件，以及 `evidence.md` 中的 **Worker Batch** 返回 schema。

Researcher 必须分别执行：

- `support` pass：寻找能够直接建立命题的材料；
- `counter` pass：主动寻找相反事实、替代解释、失败案例、口径冲突或权威反例。

`search_pass` 只记录检索意图，不代表证据方向。Researcher 可以记录来源类别、来源类型、日期、原文、定位和访问障碍，但不得填写 `support/contradict`、reliability、decisive 或结论。`DONE` 只表示已完成 assignment，不表示证据充分或质量通过。无法可靠提取、来源不可达、语义仍歧义或任务超出边界时返回 `UNCERTAIN`，并保留已取得的有效片段和具体缺口。

### 4. Director 批量写入 Ledger

Researcher 始终 `read-only`，不得创建或修改 Ledger。Director 收齐一个 batch 后检查 schema、去重和字段完整性，再把 worker 文本批量 append 到项目的 `evidence.md`。Ledger 为 append-only：已接受记录不得覆盖；纠错用 amendment 追加并指向被替代的 ID。

## Phase 2 — Judge

Judge 只能由 Sol 执行，顺序如下：

1. **Coverage：** 将 Ledger 与 Expected Source Map 对照。必需类别为零时写 `SOURCE_GAP`；有记录不等于已满足覆盖条件。
2. **Fidelity：** Sol 独立选择 decisive evidence，逐条重新打开原始来源，核对原文、上下文、日期与定位。Researcher 没有权力预先标注 decisive。
3. **随机抽查：** 对 `N` 条 non-decisive evidence 抽取 `n = min(N, 10, max(2, ceil(0.05 × N)))`；当 `N = 0` 时 `n = 0`。记录随机 seed、样本 ID 和结果，不能凭印象挑样本。
4. **Disconfirmation：** 核对每个 QID 的 support 与 counter 两个 pass 均已执行；此时才由 Sol 标注证据与 claim 的 `supports / contradicts / context / unclear` 关系及 reliability。
5. **Unknown：** 把剩余冲突、缺口、不可验证项和可能改变结论的条件写入 Unknown Register，并相应收窄结论。

任一 decisive reread 失败、随机样本出现 fidelity 失败、必需来源类别缺失且影响结论，或任一 QID 未完成 counter-search，都使相应 gate 失败。

### Bounded repair

Judge 将失败项合并成一次定向 repair，只重开受影响的 QID，默认最多 `1` 轮。repair 若修改 Charter，先追加 amendment；随后沿用同一 L/T/S 路由与升级上限。第二次 Judge 后仍未解决的项进入 `UNKNOWN`，并明确说明报告未达到哪一项质量门。超过一轮必须由用户明确授权，不能自动延长。

### 可选跨模型 red-team

它不是常驻 agent，也不是第三 phase。仅在重大投资、强争议、高风险因果判断，或用户主动要求时，才可在权限与可用模型允许的前提下，用不同于 Director 的模型对 Charter 与拟定结论做一次对抗审查。red-team 只提交批评，不写 Ledger、不裁决证据；Sol 必须逐项依据 Ledger 接受或拒绝。未运行时不要暗示已运行。

## 完成条件

只有 Coverage、Fidelity、Disconfirmation、Unknown 四项均通过，才能称为 `Quality-Passed Report`。最终输出先给结论，再给决定性证据、适用边界和仍存在的 Unknown，并引用 Evidence ID；不要把流程日志写进读者正文。
