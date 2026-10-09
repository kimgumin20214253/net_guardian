"""
논문 그림 생성 스크립트 (한국멀티미디어학회 양식: 흑백, 한 단 폭, 600dpi). 캡션은 한글 문서에서 그림 아래에 따로 넣는다.
- figures/fig_system_bw.png      : 그림 1. 장애 판별 시스템 구성도
- figures/fig_retrans_rtt_bw.png : 그림 2. 정상(A)과 유실(C) 조건의 요청별 RTT (raw_dataset_20261004/retrans_A·C.csv)
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
    box(39, 33, 22, 16, "특징 생성\njitter,\n윈도우 특징")
    box(68, 33, 29, 16, "장애 원인 판별\nRandom Forest")
    arrow((21, 60.5), (21, 49.5)); arrow((32.5, 41), (38.5, 41)); arrow((61.5, 41), (67.5, 41))
    box(3, 6, 30, 17, "TCP 재전송 측정\n(nstat)")
    box(66, 6, 31, 17, "성능 검증\n시간 블록 교차검증,\n재수집·일반화 세션")
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


if __name__ == "__main__":
    system_diagram()
    retrans_rtt()
    print(f"[+] 그림 저장: {OUT_DIR}")
