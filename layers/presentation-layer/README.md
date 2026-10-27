# Presentation Layer

基于 **AntV G6 5.1.1** 的人物关系图谱。只读取现有 `RawStoryAnalysis` JSON，不修改提取流程、后端或领域模型。

## 运行前端

需要 Node.js 22+ 和 pnpm。

```sh
pnpm --dir layers/presentation-layer install
pnpm --dir layers/presentation-layer start
```

打开 `http://127.0.0.1:4173`，点击「打开 JSON」选择已有分析结果。仓库不包含实际分析 JSON，首页不会把测试数据当成真实分析展示。

也可以构建后直接打开 `layers/presentation-layer/dist/index.html`，不需要服务器或 CDN：

```sh
pnpm --dir layers/presentation-layer build
pnpm --dir layers/presentation-layer test
```

## 从现有 JSON 生成独立 HTML

保留原有展示入口和参数：

```sh
node layers/llm-layer/v1/build_relation_web.mjs path/to/raw-analysis.json artifacts/relationships.html
```

或使用前端命令：

```sh
pnpm --dir layers/presentation-layer generate /absolute/path/raw-analysis.json /absolute/path/relationships.html
```

HTML 内嵌原始 JSON、G6 和样式，双击即可交互；无需联网获取脚本。头像如果是远程 URL，则仍需要访问该图片地址。相对头像地址以 HTML 所在位置为基准。HTML 包含完整分析 JSON，分享前请自行确认数据适合公开。

## 数据适配

直接使用 `layers/llm-layer/v1/src/domain/schema.ts` 中的现有字段：

- `characters[]`: `id`、`name`、`aliases`、`description`；若输入已有 `avatar` / `avatar_url`，显示头像，否则使用名字首字。图片加载失败正常降级。
- `relations[]`: `id`、`source_character_id`、`target_character_id`、`type`、`description`。
- 无需任何坐标。缺少可选展示信息时显示默认文案。
- 所有有效人物（包括没有关系的孤立人物）都保留。缺少人物 ID、重复人物 ID 或不存在的关系端点会跳过，并在页面显示数据提示。
- 方向严格按 source → target 绘制。两条相反方向的记录是两条独立关系，不推测关系的语义方向。若外部 JSON 已提供 `bidirectional: true` 或 `direction: "both"`，单条关系可以显示两端箭头；现有 schema 不需要增加字段。
- 展示层为每条关系生成独立内部 ID，即使输入关系 ID 缺失或重复也不会覆盖；原始 ID 保留在详情中。

## 操作与布局

- G6 `D3ForceLayout` 一次性力导向布局：只在导入 JSON 或点击「重新布局」时计算，完成后停止并释放模拟。节点自然展开，不再按层级拉成长树；拖动时不会被力拉回。
- 使用与连线标签一致的字体实测文字宽度，结合卡片边界计算弹簧距离；较长关系文字预留更多空间，短文字保持紧凑。斥力也参考相邻关系的文字宽度，使用矩形碰撞处理避免卡片重叠，并在初始计算中对连线和标签做无关卡片避让。
- 不同人物对的连线相交时加入交叉惩罚，推动较易移动的端点解开交叉；解开后立即释放对应约束，避免网络越推越远。小型网络再进行有上限的静态位置优化，同时检查卡片重叠、文字遮挡和紧凑度，避免力导向陷入局部交叉。只处理布局，不隐藏或删减任何关系。
- 无关系的孤立人物不参与力导向，单独按网格排列。列数和网格放在网络右侧还是下方，由生成时的画布比例自动选择；所有人物仍保留，无需后端坐标。仅有自环关系的人物仍属于关系网络。
- 同一对人物（不分起终点）默认聚合为「N 条关系」。聚合箭头表示原记录包含的方向；点击后展开每条原始关系。
- 展开关系使用独立二次贝塞尔曲线。反向关系按统一物理方向分配曲率，避免重合；自环使用独立环半径。不限制关系条数。
- 展开/折叠只重绘连线，不改变人物位置、拖动结果或缩放。点击详情中的按钮重新折叠，也可使用工具栏批量操作。
- 滚轮缩放、空白拖动平移、人物拖动；点击卡片/列表查看全文，点击关系查看方向、原始 ID 和完整描述。长标签在画布上限制宽度，在详情中保留全文。
- 「重新布局」主动恢复自动排列；导入新 JSON 时自动重新布局。尺寸变化调整画布但保留当前缩放，可点击「适应画布」重新适配。
- 卡片和列表支持键盘操作，侧栏提供等价的文字关系和展开/折叠入口。小屏侧栏位于图谱下方。

交叉检测针对不同人物对的直连线，共同端点不算交叉；同一对人物的多条关系仍各自保留曲线路径。任意关系网络不一定可平面展开（例如 K₅、K₃,₃），有限次优化也不是全局最优保证，因此不能承诺任意数据或展开后的所有曲线都零交叉。高密度网络建议默认聚合、局部展开并缩放查看。

## 复用组件

`src/relationship-graph.js` 导出无框架依赖的 `RelationshipGraph`，宿主加载 `src/styles.css`：

```js
import { RelationshipGraph } from './src/relationship-graph.js';

const view = new RelationshipGraph(container, { onSelect, onChange, onError });
await view.setData(rawAnalysis); // 每次更新自动布局；不改写输入
await view.setExpanded(true);   // 展开全部
await view.fit();
await view.destroy();          // 卸载时释放画布与 ResizeObserver
```

数据适配与连线分配位于 `src/graph-data.js`，一次性力导向与孤立网格布局位于 `src/graph-layout.js`，均有独立测试。构建产物保留在忽略的 `dist/`，不提交生成文件。原有 SVG、时间线和其他展示文件保持不变。

## 验证

`pnpm test`（在此目录执行）运行数据适配、曲线分配、安全 HTML 序列化及原有 CLI 生成流程的测试。无需启动后端。

`tests/browser-check.mjs` 导出 `runBrowserChecks(page, { url, screenshotDir })`，可传入 Playwright Page 验证真实前端，包括连线点击、展开/折叠、初始计算后静止、拖动后不回弹、平移、缩放、重新布局、键盘选择、小屏、数据更新和错误恢复。测试数据明确为人工构造，不会作为首页默认数据。
