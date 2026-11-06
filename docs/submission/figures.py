"""Draw the proposal's data figures from data.json (SVG, text kept as text so the page's Song face renders it).

Palette: four mineral hues checked with the dataviz validator against the rice-paper surface #F7F3EA
(lightness band, chroma floor, CVD and normal-vision separation, contrast all pass). Status is never colour alone:
every pass / fail mark also carries a text label.

Usage: python docs/submission/figures.py   (writes docs/submission/fig/*.svg)
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).parent
FIG = HERE / "fig"
DATA = json.loads((HERE / "data.json").read_text(encoding="utf-8"))

PAPER, INK, MUTED, RULE = "#F7F3EA", "#231F1A", "#6B6257", "#CFC6B4"
STONE, VERM, VIOLET, PINE = "#1F6FA8", "#B4432F", "#7D58A0", "#3C8A5A"

plt.rcParams.update({
    "font.family": ["Songti SC"], "font.size": 9, "svg.fonttype": "none", "axes.unicode_minus": False,
    "figure.facecolor": PAPER, "axes.facecolor": PAPER, "savefig.facecolor": PAPER,
    "axes.edgecolor": RULE, "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": False,
})  # fmt: skip


def save(fig: plt.Figure, name: str) -> None:
    FIG.mkdir(exist_ok=True)
    fig.savefig(FIG / name, bbox_inches="tight", pad_inches=0.08)
    plt.close(fig)
    print("figure", name)


# the three branches of the name: drafting, review, execution
BRANCH = {"plan": "起草", "sections": "起草", "synthesis": "起草", "verify": "审核", "gate_sections": "审核",
          "search": "执行", "search_national": "执行", "assemble": "执行"}  # fmt: skip
BRANCH_COLOR = {"起草": STONE, "审核": VERM, "执行": PINE}
GROUP_CN = {"plan": "规划", "search": "检索", "sections": "分章撰写", "search_national": "全国口径检索",
            "verify": "独立核查", "gate_sections": "质量门", "repair#r1:search": "修复·补检索",
            "repair#r1:rewrite": "修复·重写复核", "synthesis": "综合研判", "assemble": "统稿"}  # fmt: skip


def gantt() -> None:
    rows = DATA["timeline_p8"]
    order = list(dict.fromkeys(r["group"] for r in rows))
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    y, ticks, labels = 0, [], []
    for g in order:
        tasks = [r for r in rows if r["group"] == g]
        branch = BRANCH.get(g, "执行")
        for t in tasks:
            ax.barh(y, t["end"] - t["start"], left=t["start"], height=0.62, color=BRANCH_COLOR[branch], linewidth=0)
            y += 1
        ticks.append(y - (len(tasks) + 1) / 2)
        labels.append(f"{GROUP_CN.get(g, g)}（{len(tasks)}）" if len(tasks) > 1 else GROUP_CN.get(g, g))
        y += 0.9
    gates = [e for e in DATA["by_file"]["p8-nev-pipeline.json"]["repairs"]]  # noqa: F841 (kept for clarity)
    run = DATA["by_file"]["p8-nev-pipeline.json"]
    gate_rows = [r for r in rows if r["group"] == "gate_sections"]
    if gate_rows:
        g0 = gate_rows[0]
        for x, text in ((g0["start"], f"首检 {run['verified_first']}%，未过"), (g0["end"], f"复查 {run['verified_final']}%，通过")):
            ax.axvline(x, color=MUTED, lw=0.6, ls=(0, (3, 3)))
            ax.text(x + 4, -0.9, text, fontsize=8, color=INK, va="bottom", family="Kaiti SC")
    ax.set_yticks(ticks, labels, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlabel("运行时间（秒）")
    ax.tick_params(axis="y", length=0)
    ax.set_xlim(0, max(r["end"] for r in rows) * 1.02)
    for name, color in BRANCH_COLOR.items():
        ax.barh(0, 0, color=color, label={"起草": "起草（规划、撰写、研判）", "审核": "审核（核查、质量门）", "执行": "执行（检索、修复、统稿）"}[name])
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=3, frameon=False, fontsize=8)
    save(fig, "gantt.svg")


def evolution() -> None:
    ev = DATA["nev_evolution"]
    fig, ax = plt.subplots(figsize=(7.2, 2.9))
    xs = range(len(ev))
    draft = [e["draft_seconds"] for e in ev]
    rest = [e["wall_seconds"] - e["draft_seconds"] for e in ev]
    ax.bar(xs, draft, width=0.56, color=STONE, label="起草阶段（规划→核查，至首次质量门）")
    ax.bar(xs, rest, width=0.56, bottom=[d + 3 for d in draft], color=VIOLET, label="修复与综合研判、统稿")
    for i, e in enumerate(ev):
        ax.text(i, e["wall_seconds"] + 25, f"{e['wall_seconds']} 秒\n修复 {e['repair_rounds']} 轮", ha="center", fontsize=7.5, color=INK)
    ax.set_xticks(list(xs), [f"V{i + 1}" for i in range(len(ev))], fontsize=8)
    ax.set_ylabel("总耗时（秒）")
    ax.set_ylim(0, max(e["wall_seconds"] for e in ev) * 1.25)
    ax.tick_params(axis="x", length=0)
    ax.legend(loc="upper right", frameon=False, fontsize=8)
    save(fig, "evolution.svg")


SHORT = {"p9-employment-latest.json": "就业·最新版", "p8-nev-pipeline.json": "新能源·最新版",
         "p3-nev-parallel.json": "新能源·早期版", "p1-employment-parallel.json": "就业·初版",
         "p2-nev-parallel.json": "新能源·初版"}  # fmt: skip


def gate() -> None:
    runs = DATA["runs"]
    fig, ax = plt.subplots(figsize=(7.2, 2.6))
    for i, r in enumerate(runs):
        a, b = r["verified_first"], r["verified_final"]
        ax.plot([a, b], [i, i], color=RULE, lw=2, solid_capstyle="round", zorder=1)
        ax.scatter([a], [i], s=36, color=PAPER, edgecolor=MUTED, linewidth=1.2, zorder=2)
        ax.scatter([b], [i], s=40, color=PINE if r["gate_final_passed"] else VERM, edgecolor=PAPER, linewidth=1.5, zorder=3)
        verdict = "通过" if r["gate_final_passed"] else "未过，带披露交付"
        ax.text(max(a, b) + 2.5, i, f"{a}% → {b}%  {verdict}（修复 {r['repair_rounds']} 轮，{r['wall_text']}）", va="center", fontsize=8, color=INK)
    ax.axvline(50, color=MUTED, lw=0.7, ls=(0, (3, 3)))
    ax.text(51, -0.55, "门槛 50%", fontsize=8, color=MUTED, ha="left", family="Kaiti SC")
    ax.set_yticks(range(len(runs)), [f"{SHORT.get(r['file'], r['topic'])}" for r in runs], fontsize=8)
    ax.invert_yaxis()
    ax.set_xlim(0, 150)
    ax.set_xticks([0, 25, 50, 75, 100])
    ax.set_xlabel("已核实说法占比（%）：空心 = 首次检查，实心 = 最后一次检查")
    ax.tick_params(axis="y", length=0)
    save(fig, "gate.svg")


def repairs() -> None:
    rs = DATA["by_file"]["p8-nev-pipeline.json"]["repairs"]
    fig, ax = plt.subplots(figsize=(7.2, 2.2))
    for i, r in enumerate(rs):
        a, b = r["before"] * 100, r["after"] * 100
        color = PINE if r["accepted"] else VERM
        ax.annotate("", xy=(b, i), xytext=(a, i), arrowprops={"arrowstyle": "-|>", "color": color, "lw": 1.4, "shrinkA": 3, "shrinkB": 3})
        ax.scatter([a], [i], s=28, color=PAPER, edgecolor=MUTED, linewidth=1.1, zorder=3)
        verdict = "采用重写" if r["accepted"] else "放弃重写，保留原稿"
        ax.text(102, i, f"{a:.0f}% → {b:.0f}%  {verdict}", va="center", fontsize=8, color=INK)
    ax.set_yticks(range(len(rs)), [r["section"] for r in rs], fontsize=8)
    ax.invert_yaxis()
    ax.set_xlim(0, 160)
    ax.set_xticks([0, 25, 50, 75, 100])
    ax.set_xlabel("该章已核实说法占比（%）：空心 = 原稿，箭头指向重写后复核结果")
    ax.tick_params(axis="y", length=0)
    save(fig, "repairs.svg")


if __name__ == "__main__":
    gantt()
    evolution()
    gate()
    repairs()
