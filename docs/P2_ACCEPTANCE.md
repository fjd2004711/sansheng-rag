# P2 验收规则：Retrieval Self-Correction

P2 仅处理检索阶段。系统必须先诊断证据失败类型，再决定是否重检索或改写查询；禁止用“分数低就重搜”替代诊断。

## 状态

question、current_query、query_history、retrieved_docs、relevance_scores、missing_information、failure_type、failure_reason、retrieval_round、trace。

## 路由

retrieve → evidence evaluate → PASS → return
FAIL → failure diagnosis → rewrite / query expansion / abstain
rewrite 或 expansion → bounded retrieve loop

## 门控

- LangGraph 只承载 state、节点与条件路由。
- Evidence relevance 与 sufficiency 都必须产出结构化结论。
- 失败类型、缺失信息、查询前后变化必须可回查。
- 默认最大检索轮数为 2；达到上限后返回有限结果或拒答，绝不循环。
- 证据不足场景至少验证一次 Q0 → FAIL → Q1 → PASS。
- 知识库缺失答案场景必须以 abstain 结束。
- P0/P1 回归和自动测试继续通过。
