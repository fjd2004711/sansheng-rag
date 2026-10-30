# VeriFlow 多智能体编排平台：实现说明

> 对应竞赛方案 [COMPETITION_PLAN.md](COMPETITION_PLAN.md)。本文说明**已经实现了什么、怎么用、怎么测、哪些没做**。所有结论以代码和 `artifacts/orchestration-eval.json` 为准。

## 1. 平台是什么

用 YAML 声明“知识库 / Agent / 团队 / 工作流 / 策略”，平台把工作流编译成可调度的节点图，并行执行，由**独立核查员**把关；不达标就**按失败类型修复，轮次有上限，没进展就停**；全过程落成可回放的事件。内置两套定义，证明换定义即可换场景：

| 定义 | 团队 | 场景 |
|---|---|---|
| `verified-report` | 规划师、检索员、撰稿人、独立核查员、修复员、分析师、主编 | 带分析和行动建议的调研报告 |
| `fact-check` | 说法抽取员、检索员、独立核查员、汇总员 | 把一段文字的事实性说法逐条联网查证 |

## 2. 代码在哪

| 层 | 位置 | 说明 |
|---|---|---|
| 定义层 | `backend/app/services/orchestration/spec.py` | Pydantic 模型 + YAML 解析；校验循环依赖、缺失 Agent/知识库、质量门缺阈值、**核查员不得读取执行者推理** |
| 内置定义 | `…/orchestration/builtin.py` | 两套 YAML |
| 调度器 | `…/orchestration/scheduler.py` | 就绪集 + 优先级、资源池（搜索/模型并发）、重试与超时、预算、模型降级、运行时插入任务；与业务无关 |
| 引擎 | `…/orchestration/engine.py` | 把工作流编译成调度组（`map` 节点在上游完成后按数据扇出），记录事件、算指标 |
| 技能 | `…/orchestration/skills.py` | 每个 Agent 真正做什么：规划、检索、分章撰写、独立复核、重写修复、综合研判、统稿；事实核查的四个技能 |
| 核查与门 | `…/orchestration/verification.py` | 质量指标、失败诊断（证据不足 / 缺权威来源 / 数字对不上原文 / 范围错置）、门阈值判定；纯函数 |
| 改进建议 | `…/orchestration/insights.py` | 失败类型与用户反馈聚合成改进提示（规则，人工应用） |
| 持久化 | `app/db/models/orchestration.py`、迁移 `0036_orchestration` | 运行、事件日志、用户自定义定义、运行反馈 |
| 接口 | `app/api/routes/v1/orchestration.py` | `/api/v1/orchestration/{specs,runs,insights}` |
| 前端 | `frontend/src/components/orchestration/` | 应用式界面（参考 Dify / n8n 的画布、LangSmith 的链路视图）：左侧栏（新建运行、历史运行、工作流定义、改进建议）；运行页 = 顶部指标行 + 节点卡片画布（实时着色，点击节点浮出详情）+ 底部面板（瀑布式调度时间线、质量门与自循环、事件日志）+ 报告阅读视图（目录、核实徽章、下载）；定义页 = 画布 + 智能体/策略/YAML 编辑与校验；改进建议仪表盘 |

LangChain 负责每个 Agent 内部的模型调用与检索（复用本项目已有的报告流水线）；**编排层是自研的 asyncio 调度器，没有使用 LangGraph**（与最初计划不同，见“没做的”）。

## 3. 定义长什么样

```yaml
kind: Agent
name: verifier
role: 独立核查员
skill: verify_report
model_tier: strong
independent: true
can_see: [draft, evidence]      # 写成 [draft, reasoning] 会在导入时被拒绝
---
kind: Workflow
name: verified-report
team: research-report-team
policy: {max_tokens: 900000, max_seconds: 2400, max_repair_rounds: 2, search_concurrency: 2, llm_concurrency: 4}
nodes:
  - {id: search, kind: map, agent: researcher, depends_on: [plan], map_over: query_batches, pool: search}
  - {id: sections, kind: map, agent: writer, depends_on: [search], map_over: sections, pool: llm}
  - {id: verify, kind: map, agent: verifier, depends_on: [sections], map_over: sections, pool: llm}
  - id: gate_sections
    kind: gate
    depends_on: [verify]
    on_fail: repair
    max_rounds: 2
    gate: {min_verified_ratio: 0.5, max_unsupported_numbers: 0, require_scope_disclosed: true, min_authoritative_sections: 0.5}
  - {id: repair, kind: loop, agent: repairer, essential: false, max_rounds: 2}
```

前端“团队与工作流定义”页可直接编辑、校验、保存为自己的版本（内置定义不可覆盖）。对照实验里的“串行”配置就是这样创建的：同一份定义，并发上限改成 1。

## 4. 关键机制

**动态调度**
- `map` 节点在上游完成后按真实数据扇出（章节数、搜索批次数不是写死的）。
- 搜索与模型分别有资源池；超限排队而不是失败。
- 质量门不达标时，门任务在运行中**插入**“定向补检索”和“逐章重写并复核”两组任务，等它们完成再复查。
- 模型报额度/权限错误时自动切到备选模型并无损重试（不消耗任务的重试次数）；预算用尽时非必要任务被跳过，必要任务超过硬上限才失败。

**独立核查**
- 核查员只拿到成稿和语料，自己重新检索证据、重新逐条分级；复核结果比撰稿时更差就**下调**（运行指标里的“核查员下调”）。
- 门的指标由纯函数计算：已核实比例、权威来源覆盖章节、来源里找不到的数字、范围错置（只有单个学校/地区数据且没声明不代表整体）。

**有界自循环**
- 失败类型决定动作：证据不足 / 缺权威来源 → 先补检索（官方发布、全国口径），再逐章重写；数字对不上 → 重写；范围错置 → 重写，仍不行就在正文里写明“不代表全国”。
- **重写只有在核查员复核后不比原稿差才被采用**，否则保留原稿（运行页里会显示“放弃重写，保留原稿”）。
- **一轮修复后核实比例没有提升就停止**，并把剩余问题写进报告的“争议与不确定”。轮次另有 `max_repair_rounds` 上限。
- 这两条是第一次真实运行后加的：旧版循环跑了 2 轮、多花约 14 分钟，核实比例反而从 38% 降到 34%。

**可回放**：每个任务的开始/结束/重试/失败/跳过、质量门每次检查的指标和失败项、修复被采用或放弃、模型降级，都是 `orch_events` 里的结构化事件；前端的图、时间线、门检查都由它们生成。

## 5. 怎么跑

```bash
cd backend && uv run alembic upgrade head          # 含 0036_orchestration
uv run uvicorn app.main:app --port 8010
cd ../frontend && npm run dev                       # 打开 /orchestration
```

接口：`POST /api/v1/orchestration/runs {"spec": "verified-report", "topic": "…"}`，`GET /runs/{id}` 返回结果、图和全部事件，`GET /runs/{id}/download?format=docx|pdf` 导出报告。

界面开发：没有数据库/搜索/模型时，`cd backend && uv run uvicorn scripts.orch_mock_server:app --port 8010` 会用 `artifacts/orchestration-runs/` 里保存的真实运行数据提供一个模拟后端（仅开发用，其中一个运行被截断成“进行中”以便设计实时状态），再用 `BACKEND_URL=http://localhost:8010` 启动前端、给浏览器一个任意的 `access_token` cookie 即可。

评测汇总：`python eval/orchestration_eval.py run1.json run2.json --serial serial.json`（输入是 `GET /runs/{id}` 的 JSON，指标全部从事件日志计算）。

## 6. 测试

- 后端：调度器 6 项（并行扇出、资源池上限、重试与下游跳过、运行中插入任务、预算下跳过非必要任务、模型降级）；引擎端到端 8 项（并行与统稿、质量门失败触发修复并修好、无进展停止、劣化重写被拒绝、模型死掉后降级完成、搜索全挂时给出可读错误、定义校验、诊断与门）；接口 5 项；全量 `pytest` 通过。
- 前端：事件折叠、节点进度、门检查与布局的纯函数测试；`type-check`、`build` 通过。
- 真实环境：见下节。

## 7. 实测

环境：讯飞星火 `spark-x2.6`；联网检索用自建 SearXNG；每次运行在临时库里进行。数据由 `eval/orchestration_eval.py` 从运行记录（`artifacts/orchestration-runs/`）的事件日志算出，汇总见 `artifacts/orchestration-eval.json`。

| 主题 | 总耗时（含修复） | 任务数 | 修复轮次 | 重写被采用 / 放弃 | 核查员下调 | 已核实比例（首次 → 修复后） | 权威来源覆盖章节 |
|---|---|---|---|---|---|---|---|
| 2025 届大学生就业情况怎么样？ | 1239 秒 | 27 | 2 | 3 / 4 | 3 条 | 60% → 76% | 80% → 100% |
| 中国新能源汽车产销与渗透率 | 1338 秒 | 30 | 2 | 5 / 5 | 8 条 | 17% → 45% | 60% → 80% |

**并行调度**：同一主题、同一份定义，只把搜索与模型并发上限改成 1（用平台的“保存自定义定义”创建）。起草阶段（规划、检索、分章撰写、独立核查，不含自循环修复）串行 875 秒、并行 435 秒，**实测加速 2.01 倍**。串行那次预算用掉大半后自动跳过了第二轮修复（`repair_skipped_budget`）。表里的“并行度”（任务忙碌时间 ÷ 总耗时）是另一个口径，不要和实测加速混淆。

**第一次真实运行暴露的问题与修复**（旧版运行记录保留在 `p0-employment-old-loop.json`、`s0-employment-serial-gate-timeout.json`）：
1. 旧版自循环 2 轮、多花约 14 分钟，已核实比例反而从 38% 降到 34% → 加了“重写不比原稿差才采用”和“一轮无进展就停”。
2. 串行配置下质量门任务超过默认 900 秒超时，被**自动重试**，整个运行失败 → 门任务不重试、超时跟随整体预算，并在预算用掉 60% 后不再开始新一轮修复。
3. 事实核查里被抽取阶段漏掉的说法会无声消失 → 没被核查结果覆盖的原始说法明确标为“未能核实”。
4. SearXNG 冷查询约 20 秒，刚好踩在客户端超时上 → 超时放宽到 30 秒并重试一次。

**没有解决的**：
- “范围错置”（只有单校数据却没声明不代表整体）靠重写没有消除（两个主题的结果里仍是 2 章 / 0 章），最后由规则在正文补写“不代表全国”，这一步发生在最后一次质量门检查之后，所以质量门指标里它仍显示为 2。
- 两次运行的质量门最终都**没有通过**（门槛：已核实比例 ≥ 50%、有权威来源支持的章节 ≥ 50%、无范围错置）：就业主题已核实比例到了 76% 但范围错置还在，新能源主题只到 45%。平台的做法是交付稿件并在报告里披露，不是假装通过。
- 只有 2 个主题、各 1 次运行（串行对照 1 次），模型输出有随机性，这些数字是实测但不是统计显著的结论。

事实核查场景（`f1-fact-check.json`）：一段含 3 句话的文字，其中人均可支配收入故意写错（41218 元，原文 39218 元）。核查结果：GDP 两条被权威来源核实；写错的那条标为“未能核实，来源说法与之不同”；增速一条只找到单一来源。

演示视频：`docs/demo/veriflow-demo.mp4`（约 5.5 分钟，中文配音；画面是本机跑出的真实界面和上述数据，由 `docs/demo/` 下的脚本生成）。

## 8. 没做的与已知局限

- **断点续跑没有做**：运行状态和事件持久化了，但进程中断后需要整体重跑（每次运行的语料集合在 Qdrant 临时集合里，随运行结束删除）。
- **没有用 LangGraph 编排**：计划里写过把工作流编译成 LangGraph 状态图，实际用自研调度器实现了并行、资源池和运行时插入任务，这些用 LangGraph 的静态图不方便表达。
- **“反馈优化”只做到提示**：失败类型与用户反馈聚合成改进建议，不会自动改提示词或策略；发布改动仍要人工做并用金标集验证。
- **模型分级只有接口**：`model_tier: fast/strong` 和 `fast_model` 已支持，当前只有一个模型可用，所以两档用的是同一个。
- 免费搜索会被限流，冷查询偶发 20 秒以上（已加一次重试）；商用需要付费搜索源。
- 证据面窄时（如全国口径数据搜不到）修复帮不上忙，质量门会如实报“未通过”，报告里披露。
- 样本主题少，指标是实测但不具统计显著性。
