# P5 验收规则：Evaluation, Ablation, Demo Polish

P5 交付可复现评测和答辩 Dashboard，而不是只展示单次成功案例。

## 固定评测协议

- 场景保存在 `eval/p5-scenarios.jsonl`，每个场景明确问题、初始查询、目标证据、失败类型和拒答预期。
- `eval/run_p5_evaluation.py` 每次重建隔离的 `p5_eval` collection，并写入目标证据和固定近主题干扰文档。
- Baseline RAG 与 Hybrid RAG 只使用场景给出的初始查询；Corrective RAG 和 Full Self-Correcting RAG 必须运行上限为两轮的 P2 图。
- Full Self-Correcting RAG 还必须以不受支持的初始草稿触发 P3，最多执行一次生成纠错。
- 输出机器可读报告到 `artifacts/p5-evaluation-report.json` 和 `frontend/public/evaluation/p5-report.json`。指标绝不手写。
- 本地 Ollama endpoint 不返回账单 token usage；报告的 `Estimated Tokens` 是按字符数估算，不能作为账单成本。

## 对比

- Baseline RAG
- Hybrid RAG
- Corrective RAG
- Full Self-Correcting RAG

## 指标

Recall@1/@5/@10、MRR、nDCG、Groundedness、Completeness、Answer Relevance、Citation Accuracy、Corrective Success Rate、Abstention Accuracy、Average Retrieval Rounds、Latency、Estimated Tokens。

报告同时保留两个可解释子指标：

- **Retrieval Corrective Success Rate**：首轮 Top-5 没有目标证据，P2 纠错后目标证据进入最终 Top-5 的比例。
- **Generation Corrective Success Rate**：P3 修复预置的不受支持草稿且最终验证通过的比例。

## 消融

BM25、Reranker、Evidence Judge、Query Rewrite、Groundedness Judge、Completeness Judge。

## PASS / FAIL 门控

P5 只有同时满足以下条件才能 PASS：

- 固定对抗语料中，Corrective RAG 的 Recall@5、MRR 和 nDCG 均高于 Hybrid RAG。
- Full Self-Correcting RAG 的 Groundedness 与 Completeness 均不低于 Corrective RAG，并完成 P3 验证。
- out-of-scope 场景由 Corrective 与 Full 正确拒答。
- ECharts Dashboard 可加载报告、显示模式对比、消融、延迟与轮数、逐场景结果。
- 前端 type-check、lint、生产构建通过；P0 至 P4 回归和 P5 脚本通过。


## 补充：场景扩展与置信区间

- 场景可用 `expected_phrases`（多跳）要求**全部**关键事实都进入 Top-5；排名取最差的那条。
- 长文档按 500 字分块入库，检查检索能否在长文里命中目标段落。
- 每个模式的 `confidence_95` 是对场景做 1000 次自助重采样得到的 95% 区间，样本很少时区间会很宽——这是如实反映，不是缺陷。
- 真实使用中的错误问题可经“管理 → 评测候选”导出，人工确认关键词并补充对应资料后再并入场景文件。
