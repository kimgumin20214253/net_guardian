"""README·포스터용 그림 (backend/ 기준 실행: python make_poster_figures.py)
포스터용 그림 (컬러, 300dpi PNG + 벡터 PDF). 수치는 모두 저장소 결과 파일에서 읽는다.
색: 청록 = 제안(RTO) 방식, 회색 = 기존 방식/일반 응답, 진한 회색 = 타임아웃.
"""
import os, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, Rectangle
import pandas as pd

REPO = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(REPO, "..", "docs", "images")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, REPO)
os.chdir(REPO)
from eval_tcp_features import add_features, RTO_MIN_MS  # noqa: E402

for f in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
          "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"]:
    if os.path.exists(f):
        font_manager.fontManager.addfont(f)
plt.rcParams.update({
    "font.family": ["Noto Sans CJK JP", "Malgun Gothic", "AppleGothic", "NanumGothic"], "font.size": 13, "axes.unicode_minus": False,
    "axes.edgecolor": "#888888", "axes.linewidth": 0.8, "xtick.color": "#555555", "ytick.color": "#555555",
    "axes.labelcolor": "#333333", "text.color": "#222222",
})
TEAL, GRAY, LIGHT, INK, MUTED = "#0F8288", "#A3A8AD", "#DDE7E8", "#2B2B2B", "#6B6F73"


def clean(ax, left=True):
    for s in ["top", "right"] + ([] if left else ["left"]):
        ax.spines[s].set_visible(False)


def save(fig, name):
    for ext in ["png", "pdf"]:
        fig.savefig(os.path.join(OUT, f"{name}.{ext}"), dpi=300, bbox_inches="tight", pad_inches=0.08)
    plt.close(fig)


def rbar(ax, x, h, w, color):
    """아래는 기준선에 붙고 위쪽 끝만 둥근 막대"""
    r = min(0.012, h / 2)
    ax.add_patch(FancyBboxPatch((x - w / 2, 0), w, h, boxstyle=f"round,pad=0,rounding_size={r}",
                                fc=color, ec="none", mutation_aspect=1 / 0.35 * 0.35))
    ax.add_patch(Rectangle((x - w / 2, 0), w, h / 2, fc=color, ec="none"))


# ── 1. 핵심 결과: 버스트 손실 재현율 ─────────────────────────────
def fig_recall():
    t = pd.read_csv("results_tcp_features/feature_comparison.csv")
    q = t[(t.srtt_mode == "karn") & (t["eval"] == "time_block_5fold")].set_index("features")
    base, prop = q.loc["base", "recall_C"], q.loc["base+tcp", "recall_C"]
    fig, ax = plt.subplots(figsize=(5.2, 4.6))
    xs, vals = [0, 1], [base, prop]
    for x, v, c in zip(xs, vals, [GRAY, TEAL]):
        ax.bar(x, v, 0.55, color=c)
        ax.text(x, v + 0.025, f"{v:.2f}", ha="center", va="bottom", fontsize=26, fontweight="bold",
                color=INK if c == GRAY else TEAL)
    ax.annotate("", xy=(1, prop + 0.17), xytext=(0, base + 0.17),
                arrowprops=dict(arrowstyle="-|>", color=TEAL, lw=1.8, mutation_scale=16,
                                connectionstyle="arc3,rad=-0.25"))
    ax.text(0.5, max(base, prop) + 0.2, f"+{(prop - base) * 100:.0f}%p", ha="center", va="bottom",
            fontsize=18, fontweight="bold", color="white",
            bbox=dict(boxstyle="round,pad=0.35", fc=TEAL, ec="none"))
    ax.set_xticks(xs, ["기존 특징\n(RTT·손실·지터)", "+ RTO 방식 특징"], fontsize=14)
    ax.set_ylim(0, 1.3); ax.set_xlim(-0.6, 1.6)
    ax.set_yticks([0, 0.5, 1.0]); ax.set_ylabel("버스트 손실(C) 재현율")
    ax.yaxis.grid(True, color="#E6E6E6", lw=0.8); ax.set_axisbelow(True)
    ax.tick_params(axis="x", length=0)
    clean(ax)
    ax.set_title("버스트 손실 재현율", fontsize=17, fontweight="bold", loc="left", pad=12)
    fig.text(0.02, -0.03, "Random Forest, 시간 블록 5-fold 교차검증", fontsize=10.5, color=MUTED)
    save(fig, "1_recall_burst_loss")


# ── 2. nstat 검증: RTO 초과 판정 중 실제 재전송 비율 ─────────────
def fig_verify():
    v = pd.read_csv("results_tcp_features/verify_rto_vs_retrans.csv").set_index("subset")
    rows = [("전체 검증 세션", v.loc["all"]), ("버스트 손실(C) 조건", v.loc["C"])]
    fig, ax = plt.subplots(figsize=(8.2, 3.0))
    for i, (name, r) in enumerate(rows):
        y = len(rows) - 1 - i
        hit, miss = int(r["rto_exceed&retrans"]), int(r["rto_exceed_only"])
        tot = hit + miss
        ax.barh(y, hit / tot, height=0.5, color=TEAL)
        if miss:
            ax.barh(y, miss / tot, left=hit / tot + 0.004, height=0.5, color=GRAY)
        ax.text(0.02, y, f"실제 재전송 {hit}건", va="center", ha="left", color="white", fontsize=13, fontweight="bold")
        ax.text(1.03, y, f"{hit / tot:.0%}", va="center", ha="left", fontsize=24, fontweight="bold", color=TEAL)
        ax.text(-0.02, y, f"{name}\nRTO 초과 판정 {tot}건", va="center", ha="right", fontsize=12.5, color=INK)
    ax.set_xlim(0, 1); ax.set_ylim(-0.6, 1.6); ax.axis("off")
    ax.text(0, 1.55, "RTO 초과로 판별한 응답 중 커널(nstat)이 실제 재전송을 기록한 비율",
            fontsize=14, fontweight="bold", va="bottom")
    ax.text(1.0, 1.3, "재전송 없음 12건 ↓", ha="right", va="bottom", fontsize=10.5, color=MUTED)
    save(fig, "2_nstat_verification")


# ── 3. 문제 제기: 정상 vs 버스트 손실 RTT ────────────────────────
def scatter_panel(ax, t, title):
    ok, to = t[t.loss_flag == 0], t[t.loss_flag == 1]
    late = ok[ok.rtt >= RTO_MIN_MS]
    ax.scatter(ok.index, ok.rtt, s=7, color=GRAY, linewidths=0)
    ax.scatter(late.index, late.rtt, s=14, color=INK, linewidths=0)
    ax.scatter(to.index, [2500] * len(to), s=60, marker="x", color=INK, linewidths=1.6)
    ax.axhline(RTO_MIN_MS, color=TEAL, lw=1.2, ls="--", zorder=0)
    ax.text(len(t) * 1.0, RTO_MIN_MS * 1.12, "최소 RTO 200ms", ha="right", va="bottom", fontsize=10.5, color=TEAL)
    ax.set_yscale("log"); ax.set_ylim(1, 4500); ax.set_xlim(-8, len(t) + 8)
    ax.set_title(title, fontsize=13.5, loc="left", pad=6)
    ax.set_xlabel("요청 순서 (60초)"); clean(ax)
    return len(to), len(late)


def fig_problem():
    A = pd.read_csv("raw_dataset_20261004/retrans_A.csv").reset_index(drop=True)
    C = pd.read_csv("raw_dataset_20261004/retrans_C.csv").reset_index(drop=True)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharey=True)
    scatter_panel(axes[0], A, f"정상(A)  ·  {len(A)}건, 타임아웃 0건")
    nto, nlate = scatter_panel(axes[1], C, f"버스트 손실(C)  ·  {len(C)}건, 타임아웃 {int(C.loss_flag.sum())}건")
    axes[0].set_ylabel("RTT (ms)")
    axes[1].annotate(f"200ms 이상 늦게 도착한 응답 {nlate}건\n→ 손실이 재전송으로 복구되어 '지연'으로 보임",
                     xy=(0.5, 0.08), xycoords="axes fraction", va="center", fontsize=11.5, ha="center",
                     bbox=dict(boxstyle="round,pad=0.4", fc="white", ec="#CCCCCC"))
    handles = [plt.Line2D([], [], ls="", marker="o", ms=5, color=GRAY, label="응답"),
               plt.Line2D([], [], ls="", marker="o", ms=6, color=INK, label="200ms 이상 응답"),
               plt.Line2D([], [], ls="", marker="x", ms=8, mew=1.6, color=INK, label="타임아웃(기존 방식의 손실)")]
    fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, fontsize=11.5, bbox_to_anchor=(0.5, -0.07))
    fig.tight_layout()
    save(fig, "3_problem_A_vs_C")


# ── 4. 기존 방식 vs RTO 방식 (같은 C 데이터) ──────────────────────
def fig_rto():
    t = add_features(pd.read_csv("raw_dataset_20261004/retrans_C.csv"), "karn")
    rto = (t.srtt + 4 * t.rttvar).shift(1).fillna(0).clip(lower=RTO_MIN_MS)
    ok, to = t[t.loss_flag == 0], t[t.loss_flag == 1]
    ex, no = ok[ok.rto_exceed == 1], ok[ok.rto_exceed == 0]
    n, top = len(t), 4500
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.4), sharey=True)
    # (a) 기존
    ax = axes[0]
    ax.scatter(ok.index, ok.rtt, s=7, color=GRAY, linewidths=0)
    ax.scatter(to.index, [2500] * len(to), s=60, marker="x", color=INK, linewidths=1.6)
    ax.set_title("기존 방식: 타임아웃만 손실", fontsize=13.5, loc="left", pad=6)
    big(ax, f"손실 {len(to)}건 ({len(to) / n:.1%})", INK)
    # (b) RTO
    ax = axes[1]
    ax.fill_between(t.index, rto, top, step="post", color=LIGHT, lw=0, zorder=0)
    ax.step(t.index, rto, where="post", color=TEAL, lw=1.2, zorder=1)
    ax.scatter(no.index, no.rtt, s=7, color=GRAY, linewidths=0, zorder=2)
    ax.scatter(ex.index, ex.rtt, s=34, marker="^", color=TEAL, edgecolors="white", linewidths=0.6, zorder=3)
    ax.scatter(to.index, [2500] * len(to), s=60, marker="x", color=INK, linewidths=1.6, zorder=3)
    ax.text(n * 0.5, 2300, "RTO 초과 영역 (경계 최소 200ms)", ha="center", va="center", fontsize=10.5, color=TEAL)
    ax.set_title("RTO 방식: RTO를 넘긴 응답도 손실", fontsize=13.5, loc="left", pad=6)
    big(ax, f"손실 {len(to) + len(ex)}건 ({(len(to) + len(ex)) / n:.1%})", TEAL,
        sub=f"타임아웃 {len(to)} + RTO 초과 {len(ex)}")
    for ax in axes:
        ax.set_yscale("log"); ax.set_ylim(1, top); ax.set_xlim(-8, n + 8)
        ax.set_xlabel("버스트 손실(C) 요청 순서 (60초)"); clean(ax)
    axes[0].set_ylabel("RTT (ms)")
    handles = [plt.Line2D([], [], ls="", marker="o", ms=5, color=GRAY, label="정상 응답으로 판별"),
               plt.Line2D([], [], ls="", marker="^", ms=8, color=TEAL, label="RTO 초과 → 손실로 판별"),
               plt.Line2D([], [], ls="", marker="x", ms=8, mew=1.6, color=INK, label="타임아웃")]
    fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, fontsize=11.5, bbox_to_anchor=(0.5, -0.07))
    fig.tight_layout()
    save(fig, "4_rto_compare")


def big(ax, text, color, sub=None):
    ax.text(0.97, 0.52, text, transform=ax.transAxes, ha="right", va="bottom", fontsize=19,
            fontweight="bold", color=color, bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="none", alpha=0.9))
    if sub:
        ax.text(0.97, 0.49, sub, transform=ax.transAxes, ha="right", va="top", fontsize=11, color=MUTED)


# ── 5. 일반화: 학습하지 않은 강도 ─────────────────────────────────
def fig_general():
    m = pd.read_csv("results_tcp_features/more_training.csv")
    m = m[(m.features == "base+tcp")]
    f0 = m[(m.experiment == "add_sessions") & (m.test == "eval_generalization") & (m.train == "original")].macro_f1.iloc[0]
    f1 = m[(m.experiment == "diverse_intensity") & (m.train == "fixed+diverse_intensity")].macro_f1.iloc[0]
    fig, ax = plt.subplots(figsize=(5.0, 3.0))
    for y, v, c, lab in [(1, f0, GRAY, "학습하지 않은 강도"), (0, f1, TEAL, "다양한 강도 추가 학습")]:
        ax.barh(y, v, height=0.5, color=c)
        ax.text(v + 0.015, y, f"{v:.3f}", va="center", fontsize=16, fontweight="bold", color=INK if c == GRAY else TEAL)
        ax.text(-0.015, y, lab, va="center", ha="right", fontsize=12)
    ax.set_xlim(0, 1); ax.set_ylim(-0.6, 1.6); ax.axis("off")
    ax.text(0, 1.5, "일반화 세션 Macro F1", fontsize=14, fontweight="bold", va="bottom")
    save(fig, "5_generalization_f1")


# ── 6. RTO 원리 시퀀스 다이어그램 ─────────────────────────────────
def fig_sequence():
    fig, ax = plt.subplots(figsize=(6.2, 5.0))
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    cx, sx = 32, 80
    for x, lab in [(cx, "클라이언트"), (sx, "서버")]:
        ax.add_patch(FancyBboxPatch((x - 11, 88), 22, 9, boxstyle="round,pad=0.4,rounding_size=1.5",
                                    fc="white", ec=INK, lw=1.2))
        ax.text(x, 92.5, lab, ha="center", va="center", fontsize=14, fontweight="bold")
        ax.plot([x, x], [17, 87], color=INK, lw=1.4)

    def msg(y0, y1, x0, x1, text, color=INK, lost=False, dy=1.8):
        if lost:
            xm = x0 + (x1 - x0) * 0.62; ym = y0 + (y1 - y0) * 0.62
            ax.plot([x0, xm], [y0, ym], color=color, lw=1.6)
            ax.text(xm, ym, "×", ha="center", va="center", fontsize=20, color="#C0392B", fontweight="bold")
        else:
            ax.annotate("", xy=(x1, y1), xytext=(x0, y0),
                        arrowprops=dict(arrowstyle="-|>", color=color, lw=1.6, mutation_scale=16))
        ax.text((x0 + x1) / 2, (y0 + y1) / 2 + dy, text, ha="center", va="bottom", fontsize=12.5, color=color)

    msg(80, 72, cx, sx, "요청", lost=True, dy=-6.5)
    ax.text(cx + 32, 74.5, "손실", fontsize=12, color="#C0392B", va="center")
    ax.annotate("", xy=(cx - 3, 46), xytext=(cx - 3, 80),
                arrowprops=dict(arrowstyle="<|-|>", color=TEAL, lw=1.3, mutation_scale=12))
    ax.text(cx - 5, 63, "ACK 없이\nRTO 경과\n(≥200ms)", ha="right", va="center", fontsize=12, color=TEAL, linespacing=1.3)
    msg(46, 36, cx, sx, "재전송", color=INK)
    msg(33, 23, sx, cx, "응답", color=INK)
    ax.annotate("", xy=(sx + 6, 23), xytext=(sx + 6, 80),
                arrowprops=dict(arrowstyle="<|-|>", color=TEAL, lw=1.6, mutation_scale=14))
    ax.text(sx + 8, 51.5, "측정\nRTT\n> RTO", ha="left", va="center", fontsize=13, color=TEAL,
            fontweight="bold", linespacing=1.3)
    ax.plot([cx, sx + 6], [80, 80], color=TEAL, lw=0.8, ls=":")
    ax.plot([cx, sx + 6], [23, 23], color=TEAL, lw=0.8, ls=":")
    ax.text(56, 10, "응답은 왔지만 RTT가 RTO를 넘었다 → 중간에 손실·재전송이 있었다",
            ha="center", va="center", fontsize=11.5, color=INK,
            bbox=dict(boxstyle="round,pad=0.45", fc=LIGHT, ec="none"))
    save(fig, "6_rto_sequence")


if __name__ == "__main__":
    fig_recall(); fig_verify(); fig_problem(); fig_rto(); fig_general(); fig_sequence()
    print(sorted(os.listdir(OUT)))
