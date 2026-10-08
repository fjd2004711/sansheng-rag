# P3 验收规则：Generation Self-Correction

P3 在 P2 的有界检索自纠错之上，验证回答是否能由已返回的证据支撑。控制层在最终答案发送给前端前运行，所有控制 JSON 与用户可见 token 流隔离。

## 状态

question、answer、evidence、groundedness、completeness、answer_relevance、citation_coverage、claims、missing_information、failure_type、failure_reason、correction_round、trace。

## 路由

```text
Generate → Verify → PASS → return
                 ↓ FAIL
     hallucination → regenerate from existing evidence → verify once
     insufficient evidence / incomplete → diagnose sub-query → retrieve → regenerate → verify once
     out of scope → abstain
```

## 门控

- Groundedness、Completeness、Answer Relevance、Citation Coverage 与 claim-level verification 都必须输出结构化结论。
- 幻觉只能基于既有证据重生成，不能把“重搜一次”当作默认处理。
- 证据不足或回答不完整必须生成聚焦 sub-query 后再检索。
- 超出知识库范围必须拒答。
- 默认最多一次回答纠正；复核仍失败时必须拒答，绝不循环。
- 用户只收到已校验的最终答案；Trace 保留失败原因、缺失信息、sub-query 与纠正路径。
- P0/P1/P2 回归和自动测试继续通过。
