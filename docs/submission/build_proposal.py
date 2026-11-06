"""Render the proposal (方案书) from proposal.template.html + data.json, then print it to PDF with headless Chrome.

Placeholders: {{p8.wall_text}} reads data.json through the aliases in `context()`; {{TABLE:name}} inserts a table built
here from the data; {{IMG:name}} inserts a cropped screenshot. Every number in the PDF therefore comes from the saved
runs and evaluation reports (see build_data.py), never from the template text.

Usage: python docs/submission/build_proposal.py [out.pdf]
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
DATA = json.loads((HERE / "data.json").read_text(encoding="utf-8"))
SHOTS, CROPS = HERE / "shots", HERE / "fig" / "shots"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEFAULT_OUT = HERE / "out" / "赛题一+【队伍名称】+三省-方案书.pdf"

# screenshot crops in CSS px of the 1920x1080 capture (the files are 2x)
CROP = {
    "spec-graph": (330, 200, 1920, 450),
    "spec-yaml-reject": (330, 600, 1920, 1080),
    "run-live": (330, 0, 1920, 1080),
    "run-done": (0, 0, 1920, 1080),
    "inspector": (1040, 90, 1920, 880),
    "gate-first": (330, 440, 1920, 1080),
    "gate-after": (330, 440, 1920, 1000),
    "report-top": (330, 90, 1920, 1080),
    "report-synthesis": (570, 90, 1920, 1080),
    "fact-check": (330, 60, 1920, 760),
    "insights": (330, 0, 1920, 700),
    "new-run": (700, 230, 1220, 850),
    "about": (480, 230, 1440, 850),
    "event-log": (330, 760, 1920, 1080),
}


def context() -> dict:
    by = DATA["by_file"]
    return {
        "p9": by["p9-employment-latest.json"], "p8": by["p8-nev-pipeline.json"], "p3": by["p3-nev-parallel.json"],
        "p1": by["p1-employment-parallel.json"], "p2": by["p2-nev-parallel.json"], "old": DATA["old_loop"],
        "sp": DATA["serial_vs_parallel"], "fc": DATA["fact_check"], "ve": DATA["verification"], "qa": DATA["qa"],
        "code": DATA["code"], "tests": DATA["tests"], "d": DATA,
        "evo_first": DATA["nev_evolution"][0], "evo_last": DATA["nev_evolution"][-1],
        "runs_n": len(DATA["runs"]),
        "gate_failed": len(DATA["runs"]) - DATA["gate_passed_final"],
        "sched_lines": DATA["code"]["orchestration"]["scheduler.py"],
        "real_fp": round(DATA["verification"]["real"]["false_pass"]["rate"] * DATA["verification"]["real"]["false_pass"]["n"]),
    }  # fmt: skip


def lookup(ctx: dict, path: str) -> str:
    cur: object = ctx
    for part in path.split("."):
        cur = cur[int(part)] if isinstance(cur, list) else cur[part]  # type: ignore[index]
    if isinstance(cur, float):
        return str(round(cur)) if abs(cur) >= 100 else f"{cur:g}"
    return str(cur)


def pct(v: float | None) -> str:
    return "—" if v is None else f"{v * 100:.1f}%".replace(".0%", "%")


def ci(m: dict) -> str:
    lo, hi = m["ci95"] or (None, None)
    return f"{pct(m['rate'])}（n={m['n']}，95% 区间 {pct(lo)}–{pct(hi)}）" if lo is not None else f"{pct(m['rate'])}（n={m['n']}）"


def table(head: list[str], rows: list[list[object]], cls: str = "") -> str:
    th = "".join(f"<th>{h}</th>" for h in head)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'


def tables() -> dict[str, str]:
    runs = DATA["runs"]
    gate = lambda r: ("首检即通过" if r["gate_first_passed"] else ("修复后通过" if r["gate_final_passed"] else "未通过，带披露交付"))  # noqa: E731
    t = {}
    t["runs"] = table(
        ["主题（版本）", "总耗时", "起草阶段", "任务", "模型调用", "token", "并行度", "修复轮", "已核实（首→末）", "质量门"],
        [[f"{r['topic']}<br><span class='k'>{r['file']}</span>", r["wall_text"], f"{r['draft_seconds']:.0f} 秒", r["tasks"],
          r["llm_calls"], f"{r['tokens_wan']} 万", f"{r['speedup']}×", r["repair_rounds"],
          f"{r['verified_first']}% → {r['verified_final']}%", gate(r)] for r in runs],
        "num",
    )  # fmt: skip
    t["evolution"] = table(
        ["版本", "这一版改了什么", "总耗时", "起草阶段", "修复轮", "并行度", "最终已核实", "质量门"],
        [[f"V{i + 1}", e["change"], f"{e['wall_seconds']} 秒", f"{e['draft_seconds']:.0f} 秒", e["repair_rounds"],
          f"{e['speedup']}×", f"{e['verified_final']}%", "通过" if e["gate_final_passed"] else "未过"]
         for i, e in enumerate(DATA["nev_evolution"])],
        "num",
    )  # fmt: skip
    ve = DATA["verification"]
    t["verification"] = table(
        ["金标集", "用例 / 金标说法", "等级判断准确率", "假通过（错说法被判已核实）", "“已核实”精确率", "说法抽取召回"],
        [[name, f"{v['cases']} / {v['gold_claims']}", ci(v["level_accuracy"]),
          f"{round(v['false_pass']['rate'] * v['false_pass']['n'])} / {v['false_pass']['n']}", ci(v["verified_precision"]),
          ci(v["extraction_recall"])]
         for name, v in (("合成疑难用例（刻意构造）", ve["synthetic"]), ("真实网页（保存的真实页面）", ve["real"]))],
    )  # fmt: skip
    t["qa"] = table(
        ["做法", "Recall@5", "有据率", "完整度", "引用准确率", "拒答准确率", "平均耗时"],
        [[m["name"], f"{m['recall5']:.2f}", f"{m['grounded']:.2f}", f"{m['complete']:.2f}", f"{m['citation']:.2f}",
          f"{m['abstain']:.2f}", f"{m['latency_s']} 秒"] for m in DATA["qa"]["modes"]],
        "num",
    )  # fmt: skip
    fc = DATA["fact_check"]
    t["fact"] = table(["输入里的说法", "等级", "平台给出的理由"],
                      [[html.escape(c["text"]), c["level"], html.escape(c["reason"])] for c in fc["claims"]])  # fmt: skip
    code = DATA["code"]["orchestration"]
    desc = {
        "spec.py": "定义层：YAML 解析与 Pydantic 校验（循环依赖、缺失引用、门阈值、核查员隔离）",
        "builtin.py": "两套内置定义（调研报告、事实核查）的 YAML",
        "scheduler.py": "调度器：就绪集与优先级、资源池、重试与超时、预算、模型降级、运行中插入、逐项依赖",
        "engine.py": "编译工作流为调度组，按数据扇出，记录事件，计算运行指标",
        "skills.py": "每个 Agent 的实际工作：规划、检索、撰写、核查、质量门循环、修复、研判、统稿与事实核查",
        "verification.py": "质量指标、失败诊断、门阈值判定（纯函数）",
        "facade.py": "对外服务：定义与运行管理、取消、导出、运行时模型选择",
        "state.py": "运行状态与预算（软上限与 1.5 倍硬上限）",
        "insights.py": "失败类型与用户反馈聚合为改进建议",
        "registry.py": "进行中运行的登记与取消",
        "store.py": "运行与事件的持久化",
        "exceptions.py": "领域异常",
        "research/audit.py": "说法抽取与分级规则、来源独立性、逐条独立复核",
        "research/report_builder.py": "分章撰写、数据点逐字核对、综合研判、报告组装",
        "research/report_diagrams.py": "证据核实图与关键数据时间线",
    }
    t["code"] = table(["文件（backend/app/services/…）", "行数", "职责"],
                      [[f"<span class='k'>{'orchestration/' + k if '/' not in k else k}</span>", v, desc.get(k, "")]
                       for k, v in code.items()], "num")  # fmt: skip
    tests = DATA["code"]["tests"]
    tdesc = {
        "test_orchestration_scheduler": "并行扇出、资源池上限、失败重试与下游阻断、运行中插入组、预算下丢弃非必要任务、模型降级不耗重试、逐项流水线、上游单项失败",
        "test_orchestration_engine": "端到端：并行与统稿、质量门失败触发修复并修好、无进展停止、劣化重写被拒绝、模型失效降级、搜索全挂报错、定义校验、范围错置诊断、门任务不重试、预算不足跳过修复",
        "test_orchestration_models": "统一模型与按 Agent 指定的优先级、失效模型被摘除、运行时模型写入副本",
        "test_orchestration_national_search": "全国口径检索词生成与分批、修复只补未搜过的、质量门等待全国口径检索而撰写不等",
        "test_orchestration_cancel": "取消运行、搭建引擎阶段出错立即标记失败",
        "test_report_via_orchestration": "调研报告走编排引擎、失败如实抛出、删除进行中运行先取消",
        "test_support_recheck": "逐条复核：两次否决才剔除来源、调用失败保留原判、无支持说法不送模型",
        "test_report_diagrams": "证据核实图与时间线的生成与渲染",
    }
    t["tests"] = table(["测试文件", "用例数", "覆盖的行为"], [[f"<span class='k'>{k}</span>", v, tdesc.get(k, "")] for k, v in tests.items()], "num")
    return t


def crop_shots() -> None:
    CROPS.mkdir(parents=True, exist_ok=True)
    for name, (x0, y0, x1, y1) in CROP.items():
        src = SHOTS / f"{name}.png"
        if not src.exists():
            continue
        im = Image.open(src).convert("RGB").crop((x0 * 2, y0 * 2, x1 * 2, y1 * 2))
        if im.width > 2400:
            im = im.resize((2400, round(im.height * 2400 / im.width)), Image.LANCZOS)
        im.save(CROPS / f"{name}.jpg", quality=86, optimize=True)


def render() -> Path:
    ctx, tbl = context(), tables()
    text = (HERE / "proposal.template.html").read_text(encoding="utf-8")
    text = re.sub(r"\{\{TABLE:(\w+)\}\}", lambda m: tbl[m.group(1)], text)
    text = re.sub(r"\{\{IMG:([\w-]+)\}\}", lambda m: f'<img src="fig/shots/{m.group(1)}.jpg" alt="">', text)
    text = re.sub(r"\{\{SVG:([\w-]+)\}\}", lambda m: (HERE / "fig" / f"{m.group(1)}.svg").read_text(encoding="utf-8").split("?>", 1)[-1], text)
    text = re.sub(r"\{\{([\w.\-]+)\}\}", lambda m: lookup(ctx, m.group(1)), text)
    left = re.findall(r"\{\{.*?\}\}", text)
    if left:
        sys.exit(f"unresolved placeholders: {left}")
    out = HERE / "proposal.html"
    out.write_text(text, encoding="utf-8")
    return out


def to_pdf(src: Path, pdf: Path) -> None:
    pdf.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=8000",
                    f"--print-to-pdf={pdf}", src.as_uri()], check=True, capture_output=True)  # fmt: skip
    print(f"pdf: {pdf.relative_to(ROOT)}")


def main() -> None:
    crop_shots()
    page = render()
    plain = re.sub(r"<style.*?</style>|<svg.*?</svg>|<[^>]+>", "", page.read_text(encoding="utf-8"), flags=re.S)
    print("汉字数：", len(re.findall(r"[一-鿿]", plain)))
    to_pdf(page, Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT)


if __name__ == "__main__":
    main()
