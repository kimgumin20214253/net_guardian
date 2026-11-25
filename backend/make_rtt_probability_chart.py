import os
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

plt.rc('font', family='Malgun Gothic')
plt.rcParams['axes.unicode_minus'] = False

NAVY = "#2c5f8a"
GRAY = "#8a95a3"
ACCENT = "#d97706"
TEXT = "#1f2937"

FEATURES = ["rtt", "loss_flag", "jitter"]
rf = joblib.load("models/rf_best_accuracy.pkl")

rtt_sweep = np.arange(0, 1001, 2)
X_sweep = pd.DataFrame({"rtt": rtt_sweep.astype(float), "loss_flag": 0, "jitter": 1.0})
proba = rf.predict_proba(X_sweep)
classes = list(rf.classes_)
b_idx = classes.index(1)  # 1 = Delay(B)
p_b = proba[:, b_idx]

# 50% 교차 지점 계산
above = p_b >= 0.5
up_idx = np.argmax(above)
cross_up = rtt_sweep[up_idx]
down_idx = None
for i in range(up_idx, len(above)):
    if not above[i]:
        down_idx = i
        break
cross_down = rtt_sweep[down_idx] if down_idx is not None else None

fig, ax = plt.subplots(figsize=(9, 5.2), dpi=200)

ax.plot(rtt_sweep, p_b, color=NAVY, linewidth=2.2, zorder=3)
ax.axhline(0.5, color=GRAY, linewidth=1.2, linestyle="--", zorder=1)
ax.text(1000, 0.5, " P=0.5 기준선", va="center", ha="left", fontsize=9.5, color=GRAY)

ax.axvline(cross_up, color=ACCENT, linewidth=1.3, linestyle=":", zorder=1)
ax.axvline(cross_down, color=ACCENT, linewidth=1.3, linestyle=":", zorder=1)
ax.annotate(f"약 {cross_up}ms부터\nP≥0.5", xy=(cross_up, 0.5), xytext=(cross_up - 105, 0.72),
            fontsize=9.5, color=ACCENT, ha="center",
            arrowprops=dict(arrowstyle="-", color=ACCENT, lw=1))
ax.annotate(f"약 {cross_down}ms에서\n다시 P<0.5", xy=(cross_down, 0.5), xytext=(cross_down + 120, 0.72),
            fontsize=9.5, color=ACCENT, ha="center",
            arrowprops=dict(arrowstyle="-", color=ACCENT, lw=1))

# 일반화 검증 표의 실측 지점을 참고로 함께 표시 (세로 화살표로 상단 여백에 배치해 선과 안 겹치게 함)
TOP_LABEL_Y = 1.14
ref_points = [
    (155, "주입 60ms\n(실측 155ms)"),
    (290, "주입 120ms=학습조건\n(실측 290ms)"),
    (470, "주입 200ms\n(실측 약 470ms)"),
]
for rtt_val, label in ref_points:
    idx = np.argmin(np.abs(rtt_sweep - rtt_val))
    px, py = rtt_sweep[idx], p_b[idx]
    ax.scatter([px], [py], color=TEXT, s=38, zorder=4, edgecolor="white", linewidth=1)
    ax.annotate("", xy=(px, py), xytext=(px, TOP_LABEL_Y - 0.03),
                arrowprops=dict(arrowstyle="-", color="#9aa4b0", lw=1), zorder=2)
    ax.text(px, TOP_LABEL_Y, label, fontsize=8.8, color=TEXT, ha="center", va="bottom", linespacing=1.3)

ax.set_xlim(0, 1000)
ax.set_ylim(-0.05, 1.28)
ax.set_xlabel("RTT (ms)  [loss_flag=0, jitter=1 고정]", fontsize=10.5)
ax.set_ylabel("지연(B)로 판정할 확률 P(B)", fontsize=10.5)
ax.set_title("Random Forest의 RTT 값에 따른 '지연(B)' 판정 확률", fontsize=13.5, fontweight="bold", pad=14)

for spine in ["top", "right"]:
    ax.spines[spine].set_visible(False)
ax.spines["left"].set_color("#c7ced6")
ax.spines["bottom"].set_color("#c7ced6")
ax.tick_params(colors="#4b5563", labelsize=9.5)
ax.grid(axis="y", color="#e5e9ee", linewidth=0.8, zorder=0)

plt.tight_layout()
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rtt_vs_delay_probability.png")
plt.savefig(out_path, dpi=200, facecolor="white", bbox_inches="tight")
print("saved:", out_path)
print("cross_up:", cross_up, "cross_down:", cross_down)
