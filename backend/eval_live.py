"""
새로 수집한 실시간 세션 데이터로 저장된 모델을 평가하는 스크립트 (모델이 한 번도 본 적 없는 데이터 = 진짜 held-out).
- 입력: packet_analyzer.py가 만든 CSV (헤더: timestamp, rtt, loss_flag, jitter, label)
- 사용법:  python eval_live.py data/eval_session_20261003.csv [models/rf_best_accuracy.pkl]
- 출력: Accuracy / Macro F1 / 클래스별 리포트 / Confusion Matrix /
        탐지 지연(장애 시나리오로 바뀐 시점 -> 모델이 처음 그 시나리오로 맞힌 시점까지 걸린 시간)
"""
import os
import sys
import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FEATURES = ["rtt", "loss_flag", "jitter"]
NAMES = ["Normal(A)", "Delay(B)", "Loss(C)", "Combined(D)"]

if len(sys.argv) < 2:
    print("사용법: python eval_live.py <수집 CSV 경로> [모델 pkl 경로]")
    sys.exit(1)

csv_path = sys.argv[1]
model_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE_DIR, "models", "rf_best_accuracy.pkl")

df = pd.read_csv(csv_path)
df["timestamp"] = pd.to_datetime(df["timestamp"])
model = joblib.load(model_path)
if hasattr(model, "n_jobs"):
    model.set_params(n_jobs=1)

df["pred"] = model.predict(df[FEATURES])
y, p = df["label"], df["pred"]

print(f"[*] 데이터: {csv_path} ({len(df)}행, {df['timestamp'].min()} ~ {df['timestamp'].max()})")
print(f"[*] 모델  : {model_path}")
print(f"[*] 클래스 분포: {y.value_counts().sort_index().to_dict()}")
print("\n" + "=" * 60)
print(f" Accuracy : {accuracy_score(y, p) * 100:.2f}%")
print(f" Macro F1 : {f1_score(y, p, average='macro', labels=[0, 1, 2, 3], zero_division=0):.4f}")
print("=" * 60)
print(classification_report(y, p, labels=[0, 1, 2, 3], target_names=NAMES, zero_division=0, digits=4))
cm = pd.DataFrame(confusion_matrix(y, p, labels=[0, 1, 2, 3]),
                  index=[f"실제 {n}" for n in NAMES], columns=[f"예측 {n}" for n in NAMES])
print(cm.to_string())

# ----------------------------------------------------
# 탐지 지연: 라벨이 바뀐 지점마다 구간(segment)을 나누고,
# 장애 구간(B/C/D)에서 시작 시점부터 처음 정답을 예측한 샘플까지의 경과 시간/샘플 수를 잰다.
# (timestamp가 초 단위라 시간은 초 해상도, 샘플 수는 약 0.1초+RTT 간격)
# ----------------------------------------------------
df["segment"] = (df["label"] != df["label"].shift()).cumsum()
rows = []
for _, seg in df.groupby("segment"):
    label = int(seg["label"].iloc[0])
    if label == 0:
        continue
    hit = seg.index[seg["pred"] == label]
    start = seg["timestamp"].iloc[0]
    rows.append({
        "Scenario": NAMES[label],
        "Start": start,
        "Samples in segment": len(seg),
        "Detected": len(hit) > 0,
        "Samples to detect": (hit[0] - seg.index[0]) if len(hit) else None,
        "Seconds to detect": (df.loc[hit[0], "timestamp"] - start).total_seconds() if len(hit) else None,
    })

if rows:
    det = pd.DataFrame(rows)
    print("\n[탐지 지연] 장애 구간별")
    print(det.to_string(index=False))
    print("\n[탐지 지연] 시나리오별 요약 (탐지된 구간 기준 중앙값)")
    print(det.groupby("Scenario").agg(
        segments=("Detected", "size"),
        detected=("Detected", "sum"),
        median_samples=("Samples to detect", "median"),
        median_seconds=("Seconds to detect", "median"),
    ).to_string())
    out = os.path.splitext(csv_path)[0] + "_detection.csv"
    det.to_csv(out, index=False)
    print(f"\n[*] '{out}' 저장 완료.")
