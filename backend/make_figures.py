"""
논문 그림 생성 스크립트 (한국멀티미디어학회 양식: 흑백, 한 단 폭, 600dpi). 캡션은 한글 문서에서 그림 아래에 따로 넣는다.
- figures/fig_system_bw.png      : 그림 1. 장애 판별 시스템 구성도
- figures/fig_retrans_rtt_bw.png : 그림 2. 정상(A)과 유실(C) 조건의 요청별 RTT (raw_dataset_20261004/retrans_A·C.csv)
- figures/fig_rto_compare_bw.png : 같은 60초 유실(C) 데이터의 기존 방식(타임아웃만 유실) vs RTO 방식(RTO 초과 응답 = 유실) 비교
                                   (raw_dataset_20261004/retrans_C.csv)
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Rectangle

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, "figures")
os.makedirs(OUT_DIR, exist_ok=True)
K = "#000000"


def system_diagram():
    plt.rcParams.update({"font.family": "Malgun Gothic"})  # 한글 글꼴 (Windows)
    fig, ax = plt.subplots(figsize=(3.4, 3.0), dpi=600)
    ax.set_xlim(0, 100); ax.set_ylim(0, 90); ax.axis("off")

    def box(x, y, w, h, text):
        ax.add_patch(Rectangle((x + 0.8, y - 0.8), w, h, fc="#9a9a9a", ec="none"))  # 그림자
        ax.add_patch(Rectangle((x, y), w, h, fc="white", ec=K, lw=0.7))
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", color=K, fontsize=6.2, linespacing=1.3)

    def arrow(p, q, dash=False, both=False):
        ax.annotate("", xy=q, xytext=p, arrowprops=dict(
            arrowstyle="<|-|>" if both else "-|>", color=K, lw=0.7,
            ls=(0, (2, 1.5)) if dash else "-", shrinkA=0, shrinkB=0, mutation_scale=6))

    ax.add_patch(Rectangle((1, 57), 98, 31, fc="#e6e6e6", ec=K, lw=0.6))
    ax.text(3, 85, "테스트베드 (Linux 호스트)", ha="left", va="center", fontsize=6.2, color=K, fontweight="bold")
    box(3, 61, 26, 18, "Modbus TCP\n클라이언트\n(RTT·유실 측정)")
    box(37, 61, 26, 18, "루프백(lo)\ntc netem\n장애 주입 (A~D)")
    box(71, 61, 26, 18, "Modbus TCP\n서버")
    arrow((29.5, 70), (36.5, 70), both=True); arrow((63.5, 70), (70.5, 70), both=True)
    box(10, 33, 22, 16, "수집 데이터\nrtt, loss_flag,\n라벨")
    box(37.5, 33, 25, 16, "특징 생성\n윈도우 특징,\nRTO 초과 비율")
    box(68, 33, 29, 16, "장애 원인 판별\nRandom Forest")
    arrow((21, 60.5), (21, 49.5)); arrow((32.5, 41), (37, 41)); arrow((63, 41), (67.5, 41))
    box(3, 6, 30, 17, "TCP 재전송 측정\n(nstat, 요청별\n재전송 카운터)")
    box(66, 6, 31, 17, "성능 검증\n시간 블록 교차검증,\n재수집·일반화·검증")
    arrow((5.5, 56.5), (5.5, 23.5), dash=True); arrow((82.5, 32.5), (82.5, 23.5)); arrow((33.5, 14.5), (65.5, 14.5))
    fig.savefig(os.path.join(OUT_DIR, "fig_system_bw.png"), bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


def retrans_rtt():
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 7})
    fig, axes = plt.subplots(2, 1, figsize=(3.3, 3.6), sharey=True, dpi=600)
    for ax, (c, name) in zip(axes, [("A", "Normal (A)"), ("C", "Loss (C)")]):
        t = pd.read_csv(os.path.join(BASE_DIR, "raw_dataset_20261004", f"retrans_{c}.csv")).reset_index(drop=True)
        ok, to = t[t.loss_flag == 0], t[t.loss_flag == 1]
        ax.scatter(ok.index, ok.rtt, s=3, color=K, linewidths=0)
        if len(to):  # 타임아웃은 RTT 값이 없으므로 그래프 위쪽에 x로 표시
            ax.scatter(to.index, [1500] * len(to), s=14, marker="x", color=K, linewidths=0.9)
        ax.axhline(200, color="#666666", lw=0.7, ls="--", zorder=0)  # Linux 최소 RTO
        ax.set_yscale("log"); ax.set_ylim(1, 2500); ax.set_xlim(-10, 590)
        ax.set_title(f"{name}: {len(t)} requests, {int(t.loss_flag.sum())} timeouts", fontsize=7, pad=3)
        ax.set_ylabel("RTT (ms)")
        for s in ["top", "right"]:
            ax.spines[s].set_visible(False)
        ax.text(585, 215, "200 ms", ha="right", va="bottom", fontsize=6, color="#444444")
    axes[1].set_xlabel("Request number (60 s)")
    axes[1].text(470, 1500, "x = timeout", va="center", fontsize=6, color=K)
    fig.tight_layout(h_pad=0.8)
    fig.savefig(os.path.join(OUT_DIR, "fig_retrans_rtt_bw.png"))
    plt.close(fig)


def rto_compare():
    """같은 60초 유실(C) 데이터(retrans_C)에서 기존 방식(타임아웃만 유실)과 RTO 방식(RTO 초과 응답 = 유실) 비교"""
    from eval_tcp_features import add_features, RTO_MIN_MS
    plt.rcParams.update({"font.family": "Malgun Gothic", "font.size": 7, "axes.unicode_minus": False})
    t = add_features(pd.read_csv(os.path.join(BASE_DIR, "raw_dataset_20261004", "retrans_C.csv")), "karn")
    # 각 요청에 적용된 RTO = 직전까지의 SRTT·RTTVAR로 계산한 max(200ms, SRTT + 4·RTTVAR)
    rto = (t.srtt + 4 * t.rttvar).shift(1).fillna(0).clip(lower=RTO_MIN_MS)
    ok, to = t[t.loss_flag == 0], t[t.loss_flag == 1]
    ex, no = ok[ok.rto_exceed == 1], ok[ok.rto_exceed == 0]
    late = int((ok.rtt >= RTO_MIN_MS).sum())
    n, top = len(t), 4000
    box = dict(fc="white", ec=K, lw=0.5, pad=2)
    fig, axes = plt.subplots(2, 1, figsize=(3.4, 4.3), sharex=True, dpi=600)

    # (a) 기존 방식: 응답이 오면 모두 정상 응답, 타임아웃만 유실
    ax = axes[0]
    ax.scatter(ok.index, ok.rtt, s=3, color=K, linewidths=0)
    ax.scatter(to.index, [1800] * len(to), s=16, marker="x", color=K, linewidths=0.9)
    ax.axhline(RTO_MIN_MS, color="#666666", lw=0.7, ls="--", zorder=0)
    ax.set_title("(a) 기존 방식: 타임아웃만 유실로 기록", fontsize=7, pad=3)
    ax.text(0.5, 0.97, f"유실 {len(to)}건 ({len(to) / n:.1%}),  200ms 이상 응답 {late}건은 지연으로 기록",
            transform=ax.transAxes, ha="center", va="top", fontsize=6, bbox=box)

    # (b) RTO 방식: 응답이 RTO를 넘으면 재전송된 것으로 보고 유실로 판별
    ax = axes[1]
    ax.fill_between(t.index, rto, top, step="post", color="#e0e0e0", lw=0, zorder=0)
    ax.step(t.index, rto, where="post", color=K, lw=0.8, zorder=1)
    ax.scatter(no.index, no.rtt, s=3, facecolors="none", edgecolors="#999999", linewidths=0.35, zorder=2)
    ax.scatter(ex.index, ex.rtt, s=9, marker="^", color=K, linewidths=0, zorder=3)
    ax.scatter(to.index, [1800] * len(to), s=16, marker="x", color=K, linewidths=0.9, zorder=3)
    ax.set_title("(b) RTO 방식: RTO를 초과한 응답을 유실로 판별", fontsize=7, pad=3)
    ax.text(0.5, 0.97, f"유실 {len(to) + len(ex)}건 ({(len(to) + len(ex)) / n:.1%}) = 타임아웃 {len(to)}건 + RTO 초과 {len(ex)}건",
            transform=ax.transAxes, ha="center", va="top", fontsize=6, bbox=box)
    ax.text(n * 0.5, 120, "RTO (최소 200ms)", ha="center", va="top", fontsize=5.8)
    ax.set_xlabel("유실(C) 조건의 요청 순서 (60초)")
    handles = [
        plt.Line2D([], [], ls="", marker="^", ms=3.5, color=K, label="RTO 초과 → 유실로 판별"),
        plt.Line2D([], [], ls="", marker="o", ms=2.5, mfc="none", mec="#999999", label="RTO 이내 응답"),
        plt.Line2D([], [], ls="", marker="x", ms=4, color=K, label="타임아웃"),
        plt.Rectangle((0, 0), 1, 1, fc="#e0e0e0", ec="none", label="RTO 초과 영역"),
    ]
    ax.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, -0.28), ncol=2, fontsize=5.8,
              frameon=False, handletextpad=0.3, columnspacing=1.0)

    for ax in axes:
        ax.set_yscale("log"); ax.set_ylim(1, top); ax.set_xlim(-5, n + 5); ax.set_ylabel("RTT (ms)")
        for s in ["top", "right"]:
            ax.spines[s].set_visible(False)
    axes[0].tick_params(labelbottom=True)
    fig.tight_layout(h_pad=0.8)
    fig.savefig(os.path.join(OUT_DIR, "fig_rto_compare_bw.png"))
    plt.close(fig)


if __name__ == "__main__":
    system_diagram()
    retrans_rtt()
    rto_compare()
    print(f"[+] 그림 저장: {OUT_DIR}")
