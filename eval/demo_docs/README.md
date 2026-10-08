# 架构演示语料与测试问题

用于在界面里亲手验证检索、自纠错、验证和拒答。把本目录下的 `*.md` 全部上传到**你自己新建的集合**（不要用已有集合），然后在对话页按下表提问，观察右侧 Trace。

也可以不开浏览器，用探针脚本批量跑并打印 Trace：

```bash
cd backend
uv run python ../scripts/probe_agent.py --email <邮箱> --password <密码> "问题1" "问题2"
```

## 语料

| 文件 | 内容 |
|---|---|
| `helios-release.md` | 发布前置凭证 JADE-LOCK；回滚窗口 30 分钟 |
| `helios-oncall.md` | 值班负责人林岚，备用周启 |
| `nebula-billing.md` | 对账差异 > 0.5% 须财务总监用 AMBER-SIGN 签批 |
| `nebula-calendar-01…08.md` | 干扰文档：同样讲 Nebula 对账，但不含答案 |
| `vega-incident.md` | P1 响应 15 分钟、P2 1 小时；升级口令 RED-HERON |
| `company-hr.md` | 年假 10 天（满五年 15 天），提前 3 个工作日申请 |

## 问题与应观察到的路径

以下是在本地实测的结果。LLM 有随机性，具体步骤可能略有差异，但路径类型应一致。

| 问题 | 验证什么 | 实测 Trace |
|---|---|---|
| Helios 发布前必须拿到什么凭证？ | 直接命中 | retrieve → evidence PASS → verify PASS |
| Helios 回滚窗口多长？ | 直接命中，同文档另一事实 | 同上 |
| Nebula 对账差异很大的时候，谁来拍板，要用什么代号？ | 干扰文档下仍命中 | 同上，答案 AMBER-SIGN |
| Helios 发布前必须拿到什么凭证，另外出问题了谁值班？ | 跨两份文档的复合问题 | verify 判 hallucination → regenerate → reverify PASS，答案含 JADE-LOCK 与林岚 |
| Vega 出了最严重的故障，要在多久内响应，升级口令是什么？ | 模型跳过检索工具时强制补检索 | 补检索 → verify FAIL → regenerate → PASS（修复前会误拒答） |
| 刚入职满一年能休几天假，要提前多久说？ | 口语问法 + 检索失败后的补救 | 两轮 retrieve/改写仍判证据不足 → max_rounds_reached → answer_diagnose 拆出子查询 → retrieve_missing → regenerate → PASS |
| 月底关账时账对不上超过千分之五，需要谁签字、用什么暗号？ | 换说法 + 干扰文档 | evidence FAIL → query_rewrite → 达到轮数上限 → regenerate → PASS |
| 公司的年终奖是怎么发的？ | 库外问题应拒答，且有界 | 两轮检索失败 → max_rounds_reached → regenerate → reverify FAIL → abstain |

观察到的现象：证据评审（本地 8B 模型）偏严格，库里明明有答案时也可能判"证据不足"，靠最大轮数限制和 P3 的子查询补救收尾。这是评审模型能力问题，不是 Trace 展示问题。
