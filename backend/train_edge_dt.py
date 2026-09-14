"""
엣지 배포용 Decision Tree 개선 실험 스크립트.
- 공식 벤치마크(train_and_benchmark.py, 논문에 인용된 수치)는 건드리지 않음.
- 목표: 단일 시점 피처(rtt, loss_flag, jitter)만으로는 유실(C)/복합(D)이 정상(A)과
  자주 혼동되는 문제(각각 80.4%/75.9%가 그 순간만 보면 정상과 구별 안 됨)를,
  최근 N개 샘플의 손실률/RTT 변동성 같은 윈도우 피처로 보완할 수 있는지 검증.
"""
import os
import glob
import time
import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, f1_score

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(BASE_DIR, "raw_dataset_20260904")
scenario_map = {
    "scenario_A": 0,
    "scenario_B": 1,
    "scenario_C": 2,
    "scenario_D": 3
}
raw_columns = ["timestamp", "rtt", "loss_flag", "is_abnormal_flag"]

WINDOW_SIZES = [5, 10, 15, 20]

# ----------------------------------------------------
# 1. 데이터 로드 + 파일(시나리오)별 윈도우 피처 계산
#    - 시나리오 경계를 넘지 않도록 반드시 파일 단위로 rolling 계산 후 concat
#    - 트레일링 윈도우(현재 시점까지의 과거 N개)만 사용 -> 실시간 스트리밍에서도 그대로 재현 가능
#      (링버퍼 + 러닝 합계로 O(1) 갱신 가능, 엣지 자원 부담 거의 없음)
# ----------------------------------------------------
def load_with_window_features(window):
    df_list = []
    for file in glob.glob(os.path.join(data_dir, "*.csv")):
        fname = os.path.basename(file)
        for sc_key, label_val in scenario_map.items():
            if sc_key.lower() in fname.lower():
                t = pd.read_csv(file, header=None, names=raw_columns)
                t["timestamp"] = pd.to_datetime(t["timestamp"])
                t = t.sort_values("timestamp").reset_index(drop=True)
                t["rtt"] = pd.to_numeric(t["rtt"], errors="coerce")
                t["loss_flag"] = pd.to_numeric(t["loss_flag"], errors="coerce")
                t["jitter"] = t["rtt"].diff().abs().fillna(0.0)
                t["loss_rate_w"] = t["loss_flag"].rolling(window, min_periods=1).mean()
                t["rtt_std_w"] = t["rtt"].rolling(window, min_periods=1).std().fillna(0.0)
                t["label"] = label_val
                df_list.append(t)
                break
    return pd.concat(df_list, ignore_index=True)


def dedup(X, y, features):
    combo = pd.concat([X, y], axis=1)
    before = len(combo)
    combo = combo.drop_duplicates().reset_index(drop=True)
    removed = before - len(combo)
    return combo[features], combo["label"], removed, before


def bench_model(model, X_train, y_train, X_test, y_test):
    t0 = time.perf_counter()
    model.fit(X_train, y_train)
    train_ms = (time.perf_counter() - t0) * 1000

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average="macro")

    sample = X_test.iloc[:100]
    lat = []
    for i in range(len(sample)):
        row = sample.iloc[[i]]
        t0 = time.perf_counter()
        _ = model.predict(row)
        lat.append((time.perf_counter() - t0) * 1_000_000)

    return {
        "Accuracy (%)": round(acc * 100, 2),
        "Macro F1": round(f1, 4),
        "Train Time (ms)": round(train_ms, 2),
        "Single Latency (us)": round(np.mean(lat), 2),
        "Tree Nodes": model.tree_.node_count,
        "Tree Depth": model.tree_.max_depth,
    }


# ----------------------------------------------------
# 2. 베이스라인(기존 3피처) vs 윈도우 피처 추가, 윈도우 크기별 비교
# ----------------------------------------------------
print("=" * 78)
print(" [베이스라인] 기존 3피처 (rtt, loss_flag, jitter) - 공식 벤치마크 재현")
print("=" * 78)

df0 = load_with_window_features(window=1)  # window=1은 사실상 rolling 미적용과 동일
base_features = ["rtt", "loss_flag", "jitter"]
X0, y0, removed0, before0 = dedup(df0[base_features], df0["label"], base_features)
print(f"[*] 중복 {removed0}행 제거 ({removed0/before0*100:.1f}%) -> {len(X0)}행")
X0_tr, X0_te, y0_tr, y0_te = train_test_split(X0, y0, test_size=0.2, random_state=42, stratify=y0)

dt_base = DecisionTreeClassifier(max_depth=10, random_state=42, class_weight="balanced")
base_result = bench_model(dt_base, X0_tr, y0_tr, X0_te, y0_te)
print(pd.Series(base_result))

results = []
for w in WINDOW_SIZES:
    print("\n" + "=" * 78)
    print(f" [윈도우={w}] rtt, loss_flag, jitter, loss_rate_w{w}, rtt_std_w{w}")
    print("=" * 78)
    df = load_with_window_features(window=w)
    feats = ["rtt", "loss_flag", "jitter", "loss_rate_w", "rtt_std_w"]
    X, y, removed, before = dedup(df[feats], df["label"], feats)
    print(f"[*] 중복 {removed}행 제거 ({removed/before*100:.1f}%) -> {len(X)}행")
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    dt = DecisionTreeClassifier(max_depth=10, random_state=42, class_weight="balanced")
    r = bench_model(dt, X_tr, y_tr, X_te, y_te)
    r["Window"] = w
    results.append(r)
    print(pd.Series(r))

res_df = pd.DataFrame(results)
print("\n" + "=" * 78)
print(" [윈도우 크기별 비교 결과]")
print("=" * 78)
print(res_df.to_string(index=False))
res_df.to_csv(os.path.join(BASE_DIR, "edge_window_benchmark.csv"), index=False)
print(f"\n[*] '{os.path.join(BASE_DIR, 'edge_window_benchmark.csv')}' 저장 완료.")
print(f"[*] 베이스라인(윈도우 없음) 대비 Macro F1: {base_result['Macro F1']}")

# ----------------------------------------------------
# 3. 최적 윈도우(Macro F1 최고, window=20)에서 가지치기(min_samples_leaf) 탐색
#    - 목표: F1을 거의 유지하면서 트리 노드 수(=엣지 메모리/코드 크기)를 최소화
# ----------------------------------------------------
best_window = int(res_df.sort_values("Macro F1", ascending=False).iloc[0]["Window"])
print("\n" + "=" * 78)
print(f" [가지치기 탐색] 최적 윈도우={best_window} 기준 min_samples_leaf 스윕")
print("=" * 78)

df_best = load_with_window_features(window=best_window)
feats = ["rtt", "loss_flag", "jitter", "loss_rate_w", "rtt_std_w"]
Xb, yb, _, _ = dedup(df_best[feats], df_best["label"], feats)
Xb_tr, Xb_te, yb_tr, yb_te = train_test_split(Xb, yb, test_size=0.2, random_state=42, stratify=yb)

prune_results = []
for leaf in [1, 5, 10, 20, 30, 50, 80]:
    dt_p = DecisionTreeClassifier(max_depth=10, min_samples_leaf=leaf, random_state=42, class_weight="balanced")
    r = bench_model(dt_p, Xb_tr, yb_tr, Xb_te, yb_te)
    r["min_samples_leaf"] = leaf
    prune_results.append(r)

prune_df = pd.DataFrame(prune_results)
print(prune_df.to_string(index=False))
prune_df.to_csv(os.path.join(BASE_DIR, "edge_pruning_benchmark.csv"), index=False)
print(f"\n[*] '{os.path.join(BASE_DIR, 'edge_pruning_benchmark.csv')}' 저장 완료.")
