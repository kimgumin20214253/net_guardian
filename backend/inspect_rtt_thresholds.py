import joblib
import numpy as np
from sklearn.tree import export_text, _tree

FEATURES = ["rtt", "loss_flag", "jitter"]

print("=" * 70)
print("1) Decision Tree (dt_low_latency.pkl) - 전체 규칙")
print("=" * 70)
dt = joblib.load("models/dt_low_latency.pkl")
print(export_text(dt, feature_names=FEATURES, max_depth=10))

print()
print("=" * 70)
print("2) Decision Tree에서 'rtt' 기준으로 분기하는 노드만 추출")
print("=" * 70)
tree_ = dt.tree_
rtt_idx = FEATURES.index("rtt")
rtt_thresholds = []
for i in range(tree_.node_count):
    if tree_.feature[i] == rtt_idx:
        rtt_thresholds.append(tree_.threshold[i])
rtt_thresholds = sorted(rtt_thresholds)
print(f"rtt 분기 노드 수: {len(rtt_thresholds)}")
print("rtt 분기 임계값들(ms), 오름차순:")
for t in rtt_thresholds:
    print(f"  {t:.2f}")

print()
print("=" * 70)
print("3) Random Forest (rf_best_accuracy.pkl) - 모든 트리의 rtt 분기 임계값 분포")
print("=" * 70)
rf = joblib.load("models/rf_best_accuracy.pkl")
all_rtt_thresholds = []
for est in rf.estimators_:
    t_ = est.tree_
    for i in range(t_.node_count):
        if t_.feature[i] == rtt_idx:
            all_rtt_thresholds.append(t_.threshold[i])
all_rtt_thresholds = np.array(all_rtt_thresholds)
print(f"전체 트리 수: {len(rf.estimators_)}")
print(f"rtt 기준 분기 노드 총 개수: {len(all_rtt_thresholds)}")
print(f"최소값: {all_rtt_thresholds.min():.2f} ms")
print(f"25% 분위수: {np.percentile(all_rtt_thresholds, 25):.2f} ms")
print(f"중앙값: {np.median(all_rtt_thresholds):.2f} ms")
print(f"75% 분위수: {np.percentile(all_rtt_thresholds, 75):.2f} ms")
print(f"최대값: {all_rtt_thresholds.max():.2f} ms")

print()
print("히스토그램 (50ms 구간별 rtt 분기 임계값 개수):")
bins = np.arange(0, 1100, 50)
hist, edges = np.histogram(all_rtt_thresholds, bins=bins)
for i, h in enumerate(hist):
    if h > 0:
        bar = "#" * min(h, 80)
        print(f"  {edges[i]:>5.0f} ~ {edges[i+1]:<5.0f} ms : {h:>4d}  {bar}")

print()
print("=" * 70)
print("4) RF predict_proba로 직접 그려보는 RTT vs P(B=지연) 곡선")
print("=" * 70)
import pandas as pd

rtt_sweep = np.arange(0, 1050, 10)
rows = []
for rtt in rtt_sweep:
    rows.append({"rtt": float(rtt), "loss_flag": 0, "jitter": 1.0})
X_sweep = pd.DataFrame(rows)
proba = rf.predict_proba(X_sweep)
classes = list(rf.classes_)
b_idx = classes.index(1)  # label 1 = Delay(B)
p_b = proba[:, b_idx]

print(f"모델 클래스 순서: {classes} (0=정상,1=지연,2=유실,3=복합)")
print()
print("RTT(ms) -> P(지연으로 판정)")
prev_bucket = None
# 50% 넘는 구간 경계 찾기
crossed_up = None
crossed_down = None
for rtt, p in zip(rtt_sweep, p_b):
    if p >= 0.5 and crossed_up is None:
        crossed_up = rtt
    if crossed_up is not None and p < 0.5 and crossed_down is None and rtt > crossed_up:
        crossed_down = rtt

for rtt, p in zip(rtt_sweep, p_b):
    if rtt % 50 == 0:
        bar = "#" * int(p * 50)
        print(f"  {rtt:>4d}ms  P(B)={p:.3f}  {bar}")

print()
if crossed_up is not None:
    print(f"P(지연)>=0.5 로 처음 올라가는 지점: 약 {crossed_up}ms")
if crossed_down is not None:
    print(f"P(지연)>=0.5 가 다시 깨지는 지점: 약 {crossed_down}ms")
else:
    print("상한선에서는 0.5 아래로 안 떨어짐 (測定 범위 내)")
