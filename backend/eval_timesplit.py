"""
시계열 누수를 막은 분류 성능 재평가 스크립트.
- 기존 방식(train_test_split 무작위 분할)은 0.1초 간격으로 이웃한 샘플이 학습/테스트에 섞여
  성능이 부풀려질 수 있음 (특히 윈도우 피처는 이웃 행끼리 윈도우가 거의 겹침).
- 여기서는 각 시나리오 파일을 시간순으로 5개 연속 블록으로 나누고, k번째 블록을 테스트로 쓰는
  블록 교차검증(5-fold)으로 평균 ± 표준편차를 산출한다.
- 비교용으로 기존 무작위 분할(random_state=42) 결과도 함께 출력한다.
- 블록 분할에서는 중복 제거를 하지 않는다: 시간상 떨어진 구간에서 같은 값이 다시 나오는 건 누수가 아니라
  실제 분포이며, 테스트셋에서 행을 지우면 클래스 분포가 왜곡되기 때문.
"""
import os
import glob
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import RobustScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import accuracy_score, f1_score, recall_score
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from lightgbm import LGBMClassifier

N_FOLDS = 5
WINDOW = 15  # train_edge_dt.py에서 Accuracy 최고였던 윈도우

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(BASE_DIR, "raw_dataset_20260904")
scenario_map = {"scenario_A": 0, "scenario_B": 1, "scenario_C": 2, "scenario_D": 3}
raw_columns = ["timestamp", "rtt", "loss_flag", "is_abnormal_flag"]
BASE_FEATURES = ["rtt", "loss_flag", "jitter"]
WIN_FEATURES = BASE_FEATURES + ["loss_rate_w", "rtt_std_w"]


def load():
    """파일(시나리오)별로 시간순 정렬 + 피처 계산 + 블록 번호(0..N_FOLDS-1) 부여"""
    df_list = []
    for file in glob.glob(os.path.join(data_dir, "*.csv")):
        fname = os.path.basename(file)
        for sc_key, label_val in scenario_map.items():
            if sc_key.lower() in fname.lower():
                t = pd.read_csv(file, header=None, names=raw_columns)
                t["timestamp"] = pd.to_datetime(t["timestamp"])
                t = t.sort_values("timestamp", kind="stable").reset_index(drop=True)
                t["rtt"] = pd.to_numeric(t["rtt"], errors="coerce")
                t["loss_flag"] = pd.to_numeric(t["loss_flag"], errors="coerce")
                t["jitter"] = t["rtt"].diff().abs().fillna(0.0)
                t["loss_rate_w"] = t["loss_flag"].rolling(WINDOW, min_periods=1).mean()
                t["rtt_std_w"] = t["rtt"].rolling(WINDOW, min_periods=1).std().fillna(0.0)
                t["label"] = label_val
                t["block"] = (np.arange(len(t)) * N_FOLDS) // len(t)
                df_list.append(t)
                break
    df = pd.concat(df_list, ignore_index=True)
    df[WIN_FEATURES] = df[WIN_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0)
    return df


def make_models():
    return {
        "Logistic Regression": (BASE_FEATURES, make_pipeline(RobustScaler(), LogisticRegression(max_iter=2000, class_weight='balanced'))),
        "Decision Tree": (BASE_FEATURES, DecisionTreeClassifier(max_depth=10, random_state=42, class_weight='balanced')),
        "Random Forest": (BASE_FEATURES, RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, class_weight='balanced', n_jobs=-1)),
        "LightGBM": (BASE_FEATURES, LGBMClassifier(n_estimators=100, max_depth=6, random_state=42, class_weight='balanced', verbose=-1, n_jobs=-1)),
        f"Decision Tree + window{WINDOW}": (WIN_FEATURES, DecisionTreeClassifier(max_depth=10, random_state=42, class_weight='balanced')),
    }


df = load()
print(f"[*] 총 {len(df)}행 | 클래스 분포: {df['label'].value_counts().sort_index().to_dict()}")

# ----------------------------------------------------
# 1. 기존 방식 재현: 중복 제거 + 무작위 분할 (논문에 현재 들어간 수치의 산출 방식)
# ----------------------------------------------------
random_split = {}
for name, (feats, model) in make_models().items():
    combo = df[feats + ["label"]].drop_duplicates()
    X_tr, X_te, y_tr, y_te = train_test_split(combo[feats], combo["label"], test_size=0.2, random_state=42, stratify=combo["label"])
    model.fit(X_tr, y_tr)
    p = model.predict(X_te)
    random_split[name] = (accuracy_score(y_te, p), f1_score(y_te, p, average="macro"))

# ----------------------------------------------------
# 2. 시간 블록 5-fold 교차검증
# ----------------------------------------------------
fold_rows = []
for k in range(N_FOLDS):
    train, test = df[df["block"] != k], df[df["block"] == k]
    for name, (feats, model) in make_models().items():
        model.fit(train[feats], train["label"])
        p = model.predict(test[feats])
        rec = recall_score(test["label"], p, labels=[0, 1, 2, 3], average=None, zero_division=0)
        fold_rows.append({
            "Model": name, "Fold": k,
            "Accuracy": accuracy_score(test["label"], p),
            "Macro F1": f1_score(test["label"], p, average="macro"),
            "Recall A": rec[0], "Recall B": rec[1], "Recall C": rec[2], "Recall D": rec[3],
        })
    print(f"[*] fold {k + 1}/{N_FOLDS} 완료")

folds = pd.DataFrame(fold_rows)
folds.to_csv(os.path.join(BASE_DIR, "timesplit_folds.csv"), index=False)

summary = []
for name, g in folds.groupby("Model", sort=False):
    summary.append({
        "Model": name,
        "Random split Acc (%)": round(random_split[name][0] * 100, 2),
        "Random split F1": round(random_split[name][1], 4),
        "Time-block Acc (%)": f"{g['Accuracy'].mean() * 100:.2f} ± {g['Accuracy'].std() * 100:.2f}",
        "Time-block F1": f"{g['Macro F1'].mean():.4f} ± {g['Macro F1'].std():.4f}",
        "Recall A/B/C/D": "/".join(f"{g[c].mean():.2f}" for c in ["Recall A", "Recall B", "Recall C", "Recall D"]),
    })
summary_df = pd.DataFrame(summary)

print("\n" + "=" * 110)
print(" [기존 무작위 분할 vs 시간 블록 5-fold 교차검증]")
print("=" * 110)
print(summary_df.to_string(index=False))
out_csv = os.path.join(BASE_DIR, "timesplit_results.csv")
summary_df.to_csv(out_csv, index=False)
print(f"\n[*] '{out_csv}', 'timesplit_folds.csv' 저장 완료.")
