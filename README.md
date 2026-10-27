# CineScript V1：Story → Raw Agent Output

面向中短篇小说的 TypeScript / Node.js 项目。边界止于经过结构及引用校验的 RawStoryAnalysis；不含前端、数据库、Domain Builder 或 graph layout。

## 快速运行

要求 Node.js >= 22.19，推荐 pnpm；依赖及锁文件已在当前电脑安装完成。当前终端没有全局 Node.js，`run-local.sh` 会优先使用已有 Node，否则使用 Codex 已安装的本地运行时，无需修改 shell 配置。

```sh
cd /Users/lujingan/Documents/Codex/2026-10-27/referenced-chatgpt-conversation-this-is-an/outputs/cinescript-v1
./run-local.sh --input samples/story.md --mode demo --out artifacts/demo
./run-local.sh --text '清晨，林舟把书还给陈雨。' --mode demo --out artifacts/paste
cat samples/story.md | ./run-local.sh --stdin --format markdown --mode demo --out artifacts/stdin
```

demo 仅验证解析、接口、校验、文件输出，不进行人物和关系语义分析。其输出包含 DEMO_ONLY 警告、一个原文段落的证据及明确标注的占位事件，人物/关系数组为空。

在安装标准 Node.js/pnpm 的环境中：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm demo
pnpm start --input samples/story.md --provider anthropic --model YOUR_MODEL_ID
```

真实分析使用 `--mode pi`（默认）。当前电脑已通过 Pi 登录 OpenAI，项目默认使用已验证可调用的 `openai/gpt-6-astra`：

```sh
./run-local.sh --input samples/story.md --out artifacts/real
```

可用 `--provider` / `--model` 或 `CINESCRIPT_PROVIDER` / `CINESCRIPT_MODEL` 覆盖默认值。凭据由 Pi 保存在用户级配置中，不写入项目。真实 Pi 模式会将小说文本发送到所选模型服务。

每次成功运行写出：

- `structured_story.json`：保留完整原文及稳定定位信息。
- `raw_story_analysis.json`：通过校验的候选分析。
- `run_manifest.json`：demo/pi 标识、模型、文档哈希、校验结果和时间。

失败时 CLI 返回非零退出码，不写出本次分析结果。重复使用输出目录时，上一次成功输出会保留；请结合 manifest 时间核对，或每次使用新目录。

## 架构与职责

```text
.txt / .md / .markdown / --text / --stdin
  → source/parser.ts
  → StructuredStory（原文、章节、段落、绝对 SourceSpan）
  → agent/orchestrator.ts（全文、七阶段 skill、一次修复）
  → agent/pi.ts（Pi SDK 会话和模型调用）
  → validation/index.ts
  → RawStoryAnalysis + run_manifest
  → 后续 Domain Builder
```

`src/domain/schema.ts` 以 Zod schema 为唯一字段定义来源，导出 TypeScript 类型和 JSON Schema。`schemas/` 包含可供其他语言或下游消费的 JSON Schema 快照。

`skills/` 七个目录分别承担 character extraction、alias resolution、event extraction、timeline reasoning、relation inference、evidence linking、reconcile。编排层明确加载它们的文本并加入任务，不依赖 Pi 自动发现文件。V1 将这些逻辑阶段合并为一次全文调用；不是七个独立 agent，也没有启动七次模型请求。未来可在 `AnalysisAgent` 边界替换模型适配器，或把编排细分为有依赖关系的阶段。

Pi 使用官方 `@earendil-works/pi-coding-agent` 1.4.0 SDK（当前包名），固定版本并提交 pnpm 锁文件。会话不持久化，不启用文件/终端工具或自动发现扩展。详见 [Pi SDK 官方文档](https://pi.dev/docs/latest/sdk)。

## Source Model 与定位约定

- 原文不 trim、不统一换行、不剥离 Markdown，从而保留字符位置。
- 文档 SHA-256 内容哈希产生 document ID；同一原文解析得到相同 ID 和定位。修改原文会产生新 document ID。
- Markdown `#` 到 `######` 标题及独立的“第…章/节/回/部”、`Chapter 数字` 行作为章节边界；无标题则建立默认章节。章节为扁平结构，标题本身不算叙事段落。
- 空行分段；同段非空行保留换行。纯标题或空白输入报错。
- `span.start/end` 是完整 document.text 的 **UTF-16 code unit** 索引，左闭右开，等同 JS `text.slice(start,end)`；不是 UTF-8 字节，也不是 Unicode 字符数。emoji、CRLF 均需按这个规则处理。
- Evidence 引用 paragraph ID，同时给出绝对 span 和逐字 quote；默认提示模型采用完整段落证据以降低数字定位错误。
- 解析器为轻量叙事格式解析，不是完整 CommonMark AST；代码围栏、复杂嵌套 Markdown 不做特殊处理。

## RawStoryAnalysis 合约

必含 `schema_version`, `document_id`, `characters`, `events`, `relations`, `timeline_constraints`, `evidences`, `warnings`。

人物包含名字和别名；事件包含参与者；关系引用人物和相关事件；时间约束引用事件并标记 before/after/simultaneous/unknown；证据引用原文。各类推断支持 `confidence`（0–1）、`alternatives`、`unresolved`，顶层也支持这些不确定性字段。

`validation/index.ts` 检查：schema、document ID、全局 ID 唯一性、人物/事件/证据引用、quote 与 span 一致性、span 位于对应段落内、缺证据的主张必须标记 unresolved、严格 before/after 关系是否成环。校验通过只表示结构与定位可信，不保证文学解释正确，也不校验所有语义矛盾（例如 simultaneous 与 before 混合矛盾）。confidence 为模型自报值，未经概率校准。

## 全文策略和错误处理

V1 使用全文，默认限制 60,000 UTF-16 单位；超限会明确报错，不截断、不自动检索。Pi 适配器还根据模型上下文窗口进行保守长度估计（非精确 tokenizer），为响应预留空间。复杂模型和长输出可能仍触发服务端限制；截断、模型错误、取消都不会作为成功结果输出。

结构/引用校验失败最多调用一次修复；最终失败报错。SDK 网络重试最多一次，每次 generate 设 180 秒中止计时。修复使用新会话，避免重复积累全文。章节分块、跨章节协调、缓存、独立阶段并行均为后续扩展点，当前未实现。Embedding / retrieval / vector DB 不属于当前依赖或处理流程。

## 接 Domain Builder

下游通过 `src/index.ts` 导入类型和 `validateAnalysis`。建议接口：

```ts
interface DomainBuilder<TDomain> {
  build(input: {
    story: StructuredStory;
    analysis: RawStoryAnalysis;
  }): Promise<TDomain>;
}
```

调用顺序为 `validateAnalysis(raw, story)` → `builder.build({story, analysis})`。Domain Builder 负责领域实体不变量、身份最终归并、接受/拒绝未决候选以及持久化 ID 映射；本阶段不承担这些职责。保留原始 evidence ID、document ID 和 span，确保后续图节点与关系可回溯。schema_version 当前为 `1.0`，后续破坏性变更需显式版本迁移。

## 本地验证

已运行 TypeScript 编译、10 项自动测试（Unicode/换行定位、章节、空输入、错引证据、重复 ID、悬空引用、时间环、修复上限、长度拒绝），并执行文件、粘贴文本、stdin 和编译后入口的离线端到端测试。Pi SDK 已加载并检查类型兼容；尚未运行真实付费模型分析，不能据此评价抽取质量。
