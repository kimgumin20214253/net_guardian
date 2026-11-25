import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.path import Path

plt.rc('font', family='Malgun Gothic')
plt.rcParams['axes.unicode_minus'] = False

NAVY = "#2c3e50"
SLATE = "#3b5170"
TEAL = "#1f9c8f"
GRAY = "#7f8c9a"
LIGHT = "#eef2f6"
ACCENT = "#d97706"

fig, ax = plt.subplots(figsize=(11.5, 12), dpi=200)
ax.set_xlim(0, 10.6)
ax.set_ylim(0, 15)
ax.axis("off")

def box(x, y, w, h, text, facecolor=SLATE, edgecolor=None, textcolor="white",
        fontsize=12, dashed=False, zorder=3):
    style = "round,pad=0.02,rounding_size=0.12"
    b = FancyBboxPatch(
        (x, y), w, h, boxstyle=style,
        linewidth=1.6,
        edgecolor=edgecolor or facecolor,
        facecolor=facecolor,
        linestyle="dashed" if dashed else "solid",
        zorder=zorder,
    )
    ax.add_patch(b)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
             fontsize=fontsize, color=textcolor, zorder=zorder + 1, linespacing=1.5)
    return (x, y, w, h)

def arrow(p1, p2, color="black", lw=2.0, style="-|>", connstyle="arc3,rad=0.0",
          label=None, label_dx=0.15, label_dy=0.0, fontsize=10, ls="solid"):
    a = FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=16,
                         linewidth=lw, color=color, connectionstyle=connstyle,
                         linestyle=ls, zorder=2)
    ax.add_patch(a)
    if label:
        mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
        ax.text(mx + label_dx, my + label_dy, label, ha="center", va="center",
                 fontsize=fontsize, color=color)

# ---- Layer 0: 장애 주입 계층 ----
netem = box(3.55, 13.15, 2.9, 0.9, "tc netem 장애 주입\n(A 정상 / B 지연 / C 유실 / D 복합)",
            facecolor=ACCENT, fontsize=11)

# ---- Layer 1: 네트워크 통신 계층 ----
client = box(0.4, 11.3, 3.2, 1.3, "Modbus Client\n(network/client.py)\nRTT 측정 · 시나리오 판별", facecolor=NAVY, fontsize=11)
server = box(6.4, 11.3, 3.2, 1.3, "Modbus Server\n(network/server.py)\n.current_label 기반 지연/유실 재현", facecolor=NAVY, fontsize=11)

arrow((3.6, 11.95), (6.4, 11.95), color=NAVY, lw=2.2,
      label="Modbus TCP 요청/응답", fontsize=10, label_dy=0.28)
arrow((5.0, 13.15), (5.0, 12.6), color=ACCENT, lw=2.0)

# ---- Layer 2: 데이터 수집 ----
collector = box(0.4, 9.3, 3.2, 1.1, "실시간 수집\n(packet_analyzer.py)", facecolor=SLATE, fontsize=11)
csvbox = box(4.4, 9.3, 5.2, 1.1, "수집 데이터셋 (CSV)\nraw_dataset_20260904/ , net_guardian_scenario_dataset.csv\nrtt · loss_flag · jitter · label", facecolor="#4a6280", fontsize=10.5)

arrow((2.0, 11.3), (2.0, 10.4), color=NAVY, lw=2.0)
arrow((3.6, 9.85), (4.4, 9.85), color=SLATE, lw=2.0)

# ---- Layer 3: 모델 학습 (오프라인, 1회성) ----
train = box(0.9, 7.25, 3.8, 1.1, "모델 학습 · 벤치마크\n(train_and_benchmark.py)", facecolor=GRAY, fontsize=11, dashed=True)
modelbox = box(5.3, 7.25, 3.8, 1.1, "저장된 모델\nrf_best_accuracy.pkl · dt_low_latency.pkl", facecolor=GRAY, fontsize=10.5, dashed=True)

arrow((5.0, 9.3), (2.8, 8.35), color=SLATE, lw=1.8, connstyle="arc3,rad=-0.15",
      label="학습 데이터", fontsize=9.5, label_dx=-0.35, label_dy=0.05)
arrow((4.7, 7.8), (5.3, 7.8), color=GRAY, lw=2.0)

# ---- Layer 4: 모델 서빙 API ----
api = box(1.6, 5.1, 6.8, 1.35,
          "모델 서빙 API — FastAPI (api/main.py)\nGET /predict · GET/POST /scenario · GET /telemetry/latest",
          facecolor=NAVY, fontsize=12)

arrow((7.2, 7.25), (6.2, 6.45), color=GRAY, lw=1.8, connstyle="arc3,rad=0.15",
      label="모델 로드", fontsize=9.5, label_dx=0.9, label_dy=0.2)

# ---- Layer 5: 대시보드 ----
dash = box(1.6, 2.9, 6.8, 1.35,
           "실시간 대시보드 — Next.js (frontend/)\n상태 카드 · RTT 차트 · 대응 가이드 · 시나리오 주입 버튼(A/B/C/D)",
           facecolor=TEAL, fontsize=12)

arrow((3.2, 5.1), (3.2, 4.25), color=NAVY, lw=2.0,
      label="예측 결과 +\n대응 가이드\n(3초 폴링)", fontsize=9, label_dx=-1.05, label_dy=0.0)
arrow((6.8, 4.25), (6.8, 5.1), color=TEAL, lw=2.0,
      label="POST /scenario\n(버튼 클릭)", fontsize=9, label_dx=1.05, label_dy=0.0)

# ---- 피드백 루프: 대시보드 -> .current_label -> Modbus Server ----
loop = FancyArrowPatch((8.4, 3.55), (9.6, 11.95),
                        connectionstyle="arc3,rad=0.12",
                        arrowstyle="-|>", mutation_scale=16,
                        linewidth=2.2, color=ACCENT, linestyle="dashed", zorder=2)
ax.add_patch(loop)
ax.text(9.75, 7.75, ".current_label 갱신\n→ 실제 지연/유실 재현\n(실시간 피드백 루프)",
        ha="left", va="center", fontsize=9.5, color=ACCENT, linespacing=1.4)

ax.text(5.0, 14.55, "Net Guardian 시스템 아키텍처", ha="center", va="center",
        fontsize=17, fontweight="bold", color=NAVY)

plt.tight_layout()
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "architecture_diagram.png")
plt.savefig(out_path, dpi=200, facecolor="white", bbox_inches="tight")
print("saved:", out_path)
