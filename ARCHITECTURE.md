# 基于 LangChain 的可解释自纠错 RAG Agent

## 1. 冻结定位

本项目以 LangChain 为主框架。LangGraph 仅承担自纠错状态、条件路由和有界循环控制，不承载文档解析、检索、生成或评估领域逻辑。

技术栈固定为：FastAPI、Next.js / React、Tailwind、shadcn/ui 风格组件、React Flow、ECharts、Qdrant，以及 Dense + BM25 + RRF + Reranker 检索链。

所有最终回答以 `claim -> evidence -> source` 为目标数据模型。自纠错先诊断失败类型，再选择重检索、Query Rewrite、问题拆解、重生成或拒答。所有纠错路径必须设置最大轮数。

## 2. 开源底座决策

项目骨架来自 `vstorm-co/full-stack-ai-agent-template`，固定 upstream commit：

`475f799f7df02738f804fa350f2de244d7331a94`

采用它的 FastAPI、Next.js、认证、会话、知识库、上传、流式通信、Qdrant、Docker 和测试骨架。关闭与本项目无关的支付、Teams、营销页、研究 Agent、Web Search 和 Reranker 功能。

P1 之后的检索、评估和有界纠错设计参考 `AnbriSamir/hybrid-rag-pipeline`，但不直接复制其产品结构。

底座自带的 BM25 只重排 Dense 候选，不是真正独立的稀疏召回，因此不得作为 P1 的实现。P1 必须让 Dense 与 BM25 分别从完整索引召回，再进行 RRF 和 Rerank。

## 3. 分层边界

```text
frontend
  Chat / Knowledge Base / Evidence / Trace / Evaluation
                         |
                    REST / WebSocket
                         |
backend FastAPI
  api -> services -> chains -> retrieval / ingestion / evaluators
                                  |
                              Qdrant / BM25
                                  |
                     LangChain model and document APIs

LangGraph（P2 起）
  只编排 state、edge、route、bounded retry
```

## 4. P0 边界

P0 只实现单路 Dense RAG：上传、解析、切块、Embedding、Qdrant Top-K、LangChain 回答、来源引用、流式输出和基础前端。

P0 禁止启用：BM25、RRF、Reranker、Retriever Grader、Query Rewrite、回答验证和纠错循环。

## 5. 模型部署

开发环境使用服务器上的 Ollama：

- Chat：`qwen3-vl:8b-instruct`
- Embedding：`nomic-embed-text`
- OpenAI-compatible base URL：`http://host.docker.internal:11434/v1`

模型地址、模型名、密钥和维度全部由环境变量提供，领域代码不得硬编码服务器地址。

## 6. 核心不变量

1. 每个检索结果保留稳定的文档、页码、章节和 chunk 标识。
2. 最终引用必须能反查原始 chunk。
3. Trace 是结构化事件，不从日志文本反向解析。
4. 评测索引与运行索引隔离。
5. 每一阶段必须通过验收门控，提交并冻结后才能进入下一阶段。

