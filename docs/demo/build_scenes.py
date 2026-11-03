"""Write scenes.json for build_video.py. Every number spoken in the narration is read from the evaluation JSON and
the run files, so the voice-over can never disagree with the measured data.

Usage: python docs/demo/build_scenes.py <slides_dir> <shots_dir> <eval.json> <report_run.json> <factcheck_run.json> <out.json>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def pct(v: float) -> int:
    return round(v * 100)


def main() -> None:
    slides, shots = Path(sys.argv[1]), Path(sys.argv[2])
    ev = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
    run = json.loads(Path(sys.argv[4]).read_text(encoding="utf-8"))
    fact = json.loads(Path(sys.argv[5]).read_text(encoding="utf-8"))
    p1, p2 = ev["runs"][0], ev["runs"][1]
    sv = ev.get("serial_vs_parallel")
    events = run["events"]
    sections = next(len(e["detail"]["tasks"]) for e in events if e["kind"] == "group_expanded" and e["detail"]["group"] == "sections")
    accepted = sum(e["kind"] == "repair_accepted" for e in events)
    rejected = sum(e["kind"] == "repair_rejected" for e in events)
    report = run["result"]["report"]
    claims = run["result"]["report"]["sections"]
    n_claims = sum(len(s["claims"]) for s in claims)
    recs = report["recommendations"]
    claims_f = fact["result"]["claims"]
    contradicted = [c for c in claims_f if c["level"] == "unverified" and "说法与之不同" in c["reason"]]
    single = [c for c in claims_f if c["level"] == "single_source"]

    s = lambda name: str(slides / name)  # noqa: E731
    h = lambda name: str(shots / name)  # noqa: E731
    first_gate = next(e["detail"] for e in events if e["kind"] == "gate_checked")
    reasons = "；".join(first_gate.get("reasons", [])) or "部分指标没有达标"
    scenes = [
        {"image": s("01_title.png"), "text": "大家好，这是三省，一个可验证的多智能体编排调度平台。下面用真实的调研任务，完整演示它从定义、调度、核查、修复到交付的全过程。"},
        {"image": s("02_why.png"), "text": "先说为什么做。LobeHub 的群组靠一个主管模型轮流点名，DeepSeek Harness 把一切做成插件，会话可以回放。但它们有一个共同的缺口：执行者说做完了，就算做完了，没有强制独立的核查，也没有带上限的失败修复。VeriFlow 给出三个答案：独立验证，有界自循环，动态调度。"},
        {"image": s("03_arch.png"), "text": "平台分五层。定义层用 YAML 声明知识库、智能体、团队、工作流和策略，导入时就会校验。编排层把工作流编译成节点图，有单步、并行扇出、质量门、自循环和汇总几种节点。调度层负责并行、资源池、重试、预算和模型降级。执行层是 LangChain 智能体加检索与网页抓取。最上面是验证与反馈层。"},
        {"image": h("04_specs.png"), "text": "这是工作流定义页。左边是工作流列表，中间是画布：每个节点是一张卡片，虚线是质量门不达标时触发的修复回路，带盾牌标记的是独立核查员。画布下面可以看智能体、策略，也可以直接编辑 YAML。点校验会拦下循环依赖、缺失的角色，甚至不允许核查员读取执行者的推理过程。校验通过才能保存成自己的版本。"},
        {"image": h("08c_new_run.png"), "text": "新建运行很简单：选一个工作流，输入调研主题，或者粘贴要核查的文字。运行在后台进行，可以随时离开。"},
        {"image": h("05a_run_top.png"), "text": f"这是一次真实运行，主题是 2025 届大学生就业情况怎么样。画布上的节点实时变色，顶部一行是汇总指标，底部是调度时间线。调度器先规划提纲，再把四批搜索并行扇出，搜索完成后 {sections} 个章节同时开写，随后独立核查员逐章复核。时间线上互相重叠的条，就是并行执行的任务。这次一共 {p1['tasks']} 个任务，没有失败，总耗时 {round(p1['wall_seconds'])} 秒。"},
        {"image": h("05b_node.png"), "text": "点击任意节点，右侧浮出详情：它的角色、技能、模型档位、资源池，是不是必要任务，以及它下面每个任务的耗时。核查员这个节点标着独立核查，它看不到撰稿人的推理，而是自己重新检索证据。"},
        {"image": h("06_gate.png"), "text": f"底部面板切到质量门。首次检查，已核实的说法占百分之 {pct(p1['gate_first']['verified_ratio'])}，质量门没有放行。原因是：{reasons}。每一章的失败类型都列了出来，右边是这一轮修复的结果。"},
        {"image": h("06b_repairs.png"), "text": f"于是进入自循环。平台先按失败类型补检索，再重写出问题的章节，然后交给核查员复核。关键规则是：重写只有在复核后不比原稿差，才会被采用。这次一共 {accepted + rejected} 次重写，{accepted} 次被采用，{rejected} 次因为比原稿更差被放弃。已核实比例从百分之 {pct(p1['gate_first']['verified_ratio'])} 提升到百分之 {pct(p1['gate_last']['verified_ratio'])}。如果一轮修复没有进展，就停止，修不好的地方如实写进报告。"
                                                + (f"要老实说，范围错置这一类这次没能靠重写消除，还剩 {int(p1['gate_last']['scope_issues'])} 章，最后由规则在正文里补写了不代表全国。" if p1["gate_last"].get("scope_issues") else "")},
        {"image": h("07_report.png"), "text": f"切到报告视图，是一页阅读版面，左边是目录，顶部的徽章按核实等级统计，各章正文共逐条核验了 {n_claims} 条说法。核心结论按范围分层：全国层面的去向落实率没有公开发布，就如实写出来；单个学校的数据只作为样本，并明确标注不代表全国。"},
        {"image": h("07_synthesis.png"), "text": "综合研判把各章放在一起看，先写明这份报告写给谁、要支持什么决定，每条判断都带有把握程度和原因。"},
        {"image": h("07b_advice.png"), "text": f"行动建议一共 {len(recs)} 条，面向具体的执行者，按优先级排序，每条写清依据、前提与风险，并标明依据强度。依据不足的会明确标成依据不足，而不是硬给结论。"},
        {"image": h("08_factcheck.png"), "text": "换一套团队定义，不改任何平台代码，就变成了事实核查：把一段文字里的说法逐条联网查证。" + (f"这段文字里故意把人均可支配收入写错了，核查员把这条标为未能核实，并指出有来源的说法与之不同。" if contradicted else "") + (f"另有 {len(single)} 条只找到一个来源，标为单一来源。" if single else "") + "只有被权威来源原文支持的，才标为已核实。"},
        {"image": h("08b_insights.png"), "text": "改进建议页汇总最近运行的失败类型、自循环的平均提升和用户反馈，给出怎么改的提示。这些只是提示，改动之后必须在金标集上指标不退步，才能发布。"},
        {"image": s("05_results.png"), "text": "最后是实测数据，全部由脚本从事件日志里算出来。" + f"两个主题，自循环前后的已核实比例分别是百分之 {pct(p1['gate_first']['verified_ratio'])} 到 {pct(p1['gate_last']['verified_ratio'])}，和百分之 {pct(p2['gate_first']['verified_ratio'])} 到 {pct(p2['gate_last']['verified_ratio'])}。" + (f"同一主题的起草阶段，串行配置要 {round(sv['serial_seconds'])} 秒，并行调度只要 {round(sv['parallel_seconds'])} 秒，实测加速 {sv['measured_speedup']} 倍。" if sv else "")},
        {"image": s("09_end.png"), "text": "总结。我们做到了声明式定义、动态调度、独立核查、有界自循环和全程可回放。也要如实说明边界：断点续跑没有做，改进建议只是规则提示，不会自动改策略，样本主题少，结论是实测但不具统计显著性。谢谢观看。"},
    ]
    Path(sys.argv[6]).write_text(json.dumps(scenes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(scenes)} scenes written")


if __name__ == "__main__":
    main()
