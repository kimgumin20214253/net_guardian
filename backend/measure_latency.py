"""
논문용 단건 추론 지연 정밀 측정 스크립트.
- train_and_benchmark.py와 동일한 데이터/분할/하이퍼파라미터로 4개 모델을 학습한 뒤 지연만 다시 잰다.
- 기존 측정과 다른 점:
  1) 측정 전 n_jobs=1 고정 (n_jobs=-1이면 predict 호출마다 스레드 풀 기동 비용이 붙어 RF가 약 10배 부풀려짐)
  2) 워밍업 후 측정, 반복 횟수 확대
  3) 평균 대신 중앙값/p95/p99 보고 + 반복 실행 간 편차
  4) 측정 환경(CPU/OS/라이브러리 버전) 자동 기록
- 입력은 api/main.py와 동일하게 1행짜리 DataFrame -> model.predict (실제 서빙 경로와 같은 조건)
"""
import os
import glob
import time
import platform
import numpy as np
import pandas as pd
import sklearn
import lightgbm

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import RobustScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from lightgbm import LGBMClassifier

WARMUP = 100
N_CALLS = 2000
N_RUNS = 3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(BASE_DIR, "raw_dataset_20260904")
scenario_map = {"scenario_A": 0, "scenario_B": 1, "scenario_C": 2, "scenario_D": 3}
raw_columns = ["timestamp", "rtt", "loss_flag", "is_abnormal_flag"]
FEATURES = ["rtt", "loss_flag", "jitter"]

# ----------------------------------------------------
# 1. 데이터 로드 (train_and_benchmark.py와 동일)
# ----------------------------------------------------
df_list = []
for file in glob.glob(os.path.join(data_dir, "*.csv")):
    fname = os.path.basename(file)
    for sc_key, label_val in scenario_map.items():
        if sc_key.lower() in fname.lower():
            t = pd.read_csv(file, header=None, names=raw_columns)
            t["timestamp"] = pd.to_datetime(t["timestamp"])
            t = t.sort_values("timestamp", kind="stable").reset_index(drop=True)
            t["rtt"] = pd.to_numeric(t["rtt"], errors="coerce")
            t["jitter"] = t["rtt"].diff().abs().fillna(0.0)
            t["label"] = label_val
            df_list.append(t)
            break
df = pd.concat(df_list, ignore_index=True)
df["loss_flag"] = pd.to_numeric(df["loss_flag"], errors="coerce")

X = df[FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0)
y = df["label"]
combo = pd.concat([X, y], axis=1).drop_duplicates().reset_index(drop=True)
X, y = combo[FEATURES], combo["label"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

models = {
    "Logistic Regression": make_pipeline(RobustScaler(), LogisticRegression(max_iter=2000, class_weight='balanced')),
    "Decision Tree": DecisionTreeClassifier(max_depth=10, random_state=42, class_weight='balanced'),
    "Random Forest": RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, class_weight='balanced', n_jobs=-1),
    "LightGBM": LGBMClassifier(n_estimators=100, max_depth=6, random_state=42, class_weight='balanced', verbose=-1, n_jobs=-1),
}

# 측정 입력: 테스트셋 행을 1행 DataFrame으로 미리 만들어 두고 순환 (DataFrame 생성 비용은 측정에서 제외)
rows = [X_test.iloc[[i]] for i in range(min(500, len(X_test)))]


def measure(model):
    for i in range(WARMUP):
        model.predict(rows[i % len(rows)])
    lat = np.empty(N_CALLS)
    for i in range(N_CALLS):
        row = rows[i % len(rows)]
        t0 = time.perf_counter()
        model.predict(row)
        lat[i] = (time.perf_counter() - t0) * 1_000_000
    return lat


# ----------------------------------------------------
# 2. 측정
# ----------------------------------------------------
print(f"[*] 워밍업 {WARMUP}회 + 측정 {N_CALLS}회 x {N_RUNS}회 반복, 단위 us\n")
results = []
for name, model in models.items():
    model.fit(X_train, y_train)
    if name in ("Random Forest", "LightGBM"):
        model.set_params(n_jobs=1)

    runs = [measure(model) for _ in range(N_RUNS)]
    medians = [np.median(r) for r in runs]
    all_lat = np.concatenate(runs)
    r = {
        "Model": name,
        "Median (us)": round(np.median(all_lat), 1),
        "Median Std across runs (us)": round(np.std(medians), 1),
        "Mean (us)": round(all_lat.mean(), 1),
        "p95 (us)": round(np.percentile(all_lat, 95), 1),
        "p99 (us)": round(np.percentile(all_lat, 99), 1),
        "Max (us)": round(all_lat.max(), 1),
    }
    results.append(r)
    print(f"  {name:<20} median={r['Median (us)']:>8} p95={r['p95 (us)']:>8} p99={r['p99 (us)']:>8}")

res_df = pd.DataFrame(results)

# ----------------------------------------------------
# 3. 결과 + 측정 환경 저장
# ----------------------------------------------------
env = {
    "CPU": platform.processor(),
    "Logical cores": os.cpu_count(),
    "OS": platform.platform(),
    "Python": platform.python_version(),
    "scikit-learn": sklearn.__version__,
    "lightgbm": lightgbm.__version__,
    "Measured at": time.strftime("%Y-%m-%d %H:%M:%S"),
}
print("\n" + "=" * 78)
print(res_df.to_string(index=False))
print("=" * 78)
for k, v in env.items():
    print(f"  {k}: {v}")

out_csv = os.path.join(BASE_DIR, "latency_results.csv")
res_df.to_csv(out_csv, index=False)
with open(os.path.join(BASE_DIR, "latency_env.txt"), "w", encoding="utf-8") as f:
    for k, v in env.items():
        f.write(f"{k}: {v}\n")
print(f"\n[*] '{out_csv}', 'latency_env.txt' 저장 완료.")
