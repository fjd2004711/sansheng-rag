"""Trend chart PNG for a report section (matplotlib, headless)."""

from __future__ import annotations

import io

import matplotlib

matplotlib.use("Agg")

from matplotlib import font_manager
from matplotlib import pyplot as plt

from app.services.research.report_fonts import cjk_font_path
from app.services.research.report_models import ChartSeries


def chart_png(series: ChartSeries) -> bytes:
    path = cjk_font_path()
    font = font_manager.FontProperties(fname=path) if path else None
    fig, ax = plt.subplots(figsize=(6.4, 3.2), dpi=150)
    try:
        positions = list(range(len(series.values)))
        ax.plot(positions, series.values, marker="o", color="#2563eb", linewidth=2)
        for x, y in zip(positions, series.values, strict=True):
            ax.annotate(
                f"{y:g}",
                (x, y),
                textcoords="offset points",
                xytext=(0, 6),
                ha="center",
                fontsize=8,
                fontproperties=font,
            )
        ax.set_xticks(positions)
        ax.set_xticklabels(series.labels, fontproperties=font, fontsize=8)
        ax.set_title(series.title, fontproperties=font, fontsize=11)
        if series.unit:
            ax.set_ylabel(series.unit, fontproperties=font, fontsize=9)
        ax.grid(axis="y", alpha=0.3)
        ax.spines[["top", "right"]].set_visible(False)
        sources = "".join(f"[{n}]" for n in series.sources)
        fig.text(
            0.99,
            0.01,
            f"数据来源：{sources}",
            ha="right",
            fontsize=7,
            color="#666",
            fontproperties=font,
        )
        fig.tight_layout()
        buffer = io.BytesIO()
        fig.savefig(buffer, format="png")
        return buffer.getvalue()
    finally:
        plt.close(fig)
