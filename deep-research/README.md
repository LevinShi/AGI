# deep-research

[中文](#中文) · [English](#english)

## 中文

### 让研究结论经得起追问

**不只让 AI 写一份报告，还要让它交代：证据在哪里，反例查过没有，还有什么不知道。**

当研究会影响产品、市场或业务决策，一篇流畅的总结并不够。这个 Codex 技能包把来源检查、原文核对和反证搜索加入研究流程，让你更容易判断结论能不能用。

当前是 **Research OS Core RC1**：一套研究工作流与模板，不是独立App，也不附带模型或搜索服务。

### 你会得到什么

- 一份先给判断、再讲决定性依据的报告。
- 一份可追溯的证据账本：原文、链接、日期与定位。
- 明确留下的未知项，以及它们可能怎样改变结论。

例如你问“这个品牌值得进入某个市场吗？”，工作流会要求既找支持材料，也找失败案例和口径冲突，而不是只收集看起来利好的信息。**这是使用示例，不是已完成的研究结果。**

`明确决策 → 双向找证据 → 回读核查 → 给出结论与未知项`

### 怎么开始

1. 先看[安装与配置](docs/SETUP.md)：当前版本有明确的模型与自定义研究Agent要求，不满足时不能直接运行。
2. 安装技能与研究Agent，每个项目复制一份 `evidence.md` 作为工作账本。
3. 对符合配置的主Agent说：

```text
用 $deep-research 研究：这个品牌是否值得进入目标市场？
我要据此决定是否投入下一轮调研。
范围：指定地区、近两年、明确品类。
请先给判断，附关键证据、反例和未解决的问题。
```

### 四个常见问题

**与直接说“帮我深度研究”有什么不同？** 它规定必须检查来源覆盖、核对原文、搜索反证、保留未知项。只有四项都通过，才允许标记质量通过；这仍不是事实绝对正确的保证。

**会不会一直研究下去？** 默认最多做一轮针对缺口的回补。仍解决不了的内容记为未知，而不是让多个Agent无限往返。

**所有 Codex 用户都能直接用吗？** 不能保证。当前配置固定使用 `gpt-5.6-sol/luna/terra`，还需安装只读 `researcher` Agent；先核对你的环境是否提供这些模型。模型不可用时需要先适配，不应静默换模型后声称符合RC1。

**什么时候不值得用？** 简单事实查询、一般改稿不必走整套流程。适合需要核对证据和反例的复杂判断；模型与搜索成本由你的环境承担，本包不承诺固定费用或节省比例。

### 文件很少，各司其职

- [SKILL.md](SKILL.md)：主Agent如何组织研究、何时判定完成。
- [researcher.toml](researcher.toml)：只读研究Agent配置。
- [evidence.md](evidence.md)：可复制的证据账本模板。
- [docs/SETUP.md](docs/SETUP.md)：安装、调用与配置限制。

研究中的真实材料只放在项目工作账本里，不要写回公开模板。三个运行文件保留在根目录，安装时保持相对位置。

## English

### Research you can question—and trace back to its sources

**Ask AI for more than a polished report: ask where the evidence comes from, what challenges the conclusion, and what remains unknown.**

When research informs a product, market, or business decision, a fluent summary is not enough. This Codex skill adds source coverage checks, verification against original passages, and searches for counterevidence to help you judge whether a conclusion is usable.

**Research OS Core RC1** is a workflow and a set of templates—not a standalone app. Models and search services are not included.

### What you get

- A report that leads with a judgment and the evidence that matters most.
- A traceable evidence ledger with original excerpts, links, dates, and source locations.
- Explicit unknowns and an explanation of how they could change the conclusion.

For example, ask whether a brand should enter a particular market. The workflow requires evidence in favor as well as failed cases and conflicting definitions—not just encouraging findings. **This is an example task, not a completed study.**

`Frame the decision → Seek support and counterevidence → Verify sources → Report conclusions and unknowns`

### Get started

1. Read [installation and configuration](docs/SETUP.md). RC1 requires specific models and a custom research agent; check those prerequisites first.
2. Install the skill and agent, then copy `evidence.md` into each research project as its working ledger.
3. Ask the configured lead agent:

```text
Use $deep-research to assess whether this brand should enter the target market.
The decision is whether to fund a further round of research.
Scope: the specified region, the past two years, and a clearly defined category.
Lead with your judgment, key evidence, counterevidence, and unresolved questions.
```

### Four common questions

**How is this different from asking for “deep research”?** It specifies checks for source coverage, faithful extraction, counterevidence, and unresolved unknowns. All four must pass before a report can be marked Quality-Passed. That label is not a guarantee that every claim is correct.

**Can it keep researching indefinitely?** By default, it allows one targeted round to address gaps. Remaining issues are recorded as unknowns rather than passed endlessly between agents.

**Can every Codex user run it as-is?** No. The current configuration requires `gpt-5.6-sol/luna/terra` and a read-only `researcher` agent. Verify model availability in your environment. If they are unavailable, adapt the configuration first; do not silently substitute models and claim RC1 compliance.

**When is it overkill?** Simple fact lookups and routine editing do not need the full workflow. Use it for complex judgments that warrant evidence checks and counterarguments. Model and search costs depend on your environment; no fixed cost or savings are promised.

### A small package with clear roles

- [SKILL.md](SKILL.md): how the lead agent runs the study and determines completion.
- [researcher.toml](researcher.toml): the read-only research agent configuration.
- [evidence.md](evidence.md): a reusable evidence ledger template.
- [docs/SETUP.md](docs/SETUP.md): installation, invocation, and configuration limits.

Keep real research material in a project-specific working ledger, not in the public template. Preserve the three runtime files’ relative locations when installing.
