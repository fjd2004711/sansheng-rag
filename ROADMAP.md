# Roadmap（三省）

## 阶段规则

每一级执行：实现 -> 测试 -> 审计 -> PASS -> commit -> 冻结 -> 下一阶段。

任何 FAIL 都阻止阶段升级。修复必须留在当前阶段范围内，不能用后续阶段功能掩盖失败。

## P0 Project Foundation + Baseline RAG

- 建立仓库、Docker、FastAPI、Next.js 和测试骨架
- LangChain 文档加载、解析和切块
- PDF / DOCX / Markdown / TXT 上传
- Ollama Embedding + Qdrant Dense Top-K
- 基于证据生成回答和来源引用
- WebSocket 流式输出
- 基础 Chat 和 Knowledge Base UI
- 建立自动验收脚本与门控报告

禁止加入 Hybrid、Reranker 或自纠错。

## P1 Hybrid Retrieval

- 独立 Dense 与 BM25 全量索引
- RRF 融合
- CrossEncoder Reranker
- 建立检索黄金集
- 对比 Recall@K、MRR、nDCG
- 只有 Hybrid 相对 Baseline 的收益通过门控后才冻结

## P2 Retrieval Self-Correction

- Retriever Grader、Evidence Relevance、Evidence Sufficiency
- Missing Information 与 Failure Diagnosis
- Query Rewrite、Expansion、History
- LangGraph 状态和最大检索轮数

## P3 Generation Self-Correction

- Groundedness、Completeness、Answer Relevance、Citation Coverage
- Claim-level Verification
- 区分幻觉、证据不足、回答不完整和知识库无答案
- 有界重生成、子问题检索和 Abstain

## P4 Full Agent + Explainable UI

- 三栏主界面
- React Flow Agent Trace
- Evidence Viewer 及四阶段分数
- 自纠错原因、缺失证据、Query 变化和新增证据解释

## P5 Evaluation + Ablation + Demo Polish

- Baseline / Hybrid / Corrective / Full 对比
- 检索、生成、引用、纠错、拒答、延迟和成本指标
- BM25、Reranker、Evidence Judge、Query Rewrite、Groundedness、Completeness 消融
- ECharts Dashboard 与答辩模式

