"""
2026-10-04 재현성·일반화·TCP 재전송 검증 결과를 다시 만드는 스크립트 (논문 2.3/2.4절 수치의 근거).
- 입력: raw_dataset_20260904/ (학습), raw_dataset_20261004/ (새 세션)
- 출력: results_20261004/ 아래 CSV
  1) live_sessions.csv       : 새 세션 2개 x 모델 2개(RF, DT+윈도우15) x (전체 / D 첫 5초 제외) 성능
  2) generalization_B_segments.csv : 일반화 세션 지연(B) 구간별 RTT 중앙값과 RF 재현율
  3) d_first5s.csv           : 원 데이터 D 첫 5초 구간 통계 + 이 구간 제외 시 시간 블록 5-fold 성능
  4) sentinel_sensitivity.csv: 유실 표식값(5000ms)을 바꿔도 결과가 같은지 (시간 블록 5-fold, RF)
  5) retrans_summary.csv     : retrans_A/C의 유실 건수와 150ms 초과 지연 응답 분포
- RF는 train_and_benchmark.py가 저장한 models/rf_best_accuracy.pkl을 그대로 쓰고,
  DT+윈도우는 원 데이터 전체로 학습한다 (eval_timesplit.py와 같은 피처).
"""
import os
import glob
import joblib
import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, recall_score

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_DIR = os.path.join(BASE_DIR, "raw_dataset_20260904")
NEW_DIR = os.path.join(BASE_DIR, "raw_dataset_20261004")
OUT_DIR = os.path.join(BASE_DIR, "results_20261004")
os.makedirs(OUT_DIR, exist_ok=True)

WINDOW = 15
N_FOLDS = 5
F = ["rtt", "loss_flag", "jitter"]
FW = F + ["loss_rate_w", "rtt_std_w"]
LABELS = [0, 1, 2, 3]


def add_window(t):
    t["loss_rate_w"] = t["loss_flag"].rolling(WINDOW, min_periods=1).mean()
    t["rtt_std_w"] = t["rtt"].rolling(WINDOW, min_periods=1).std().fillna(0.0)
    return t


def add_segments(t, gap_sec=None):
    """시나리오 구간 번호와 구간 시작 후 경과초. gap_sec가 있으면 시간 공백으로, 없으면 라벨 변화로 구간을 나눈다."""
    if gap_sec is None:
        t["seg"] = (t["label"] != t["label"].shift()).cumsum()
    else:
        t["seg"] = (t["ts"].diff().dt.total_seconds() > gap_sec).cumsum()
    t["sec_in_seg"] = (t["ts"] - t.groupby("seg")["ts"].transform("min")).dt.total_seconds()
    return t


def load_train(sentinel=None):
    frames = []
    for f in glob.glob(os.path.join(TRAIN_DIR, "*.csv")):
        key = os.path.basename(f).split("_")[1]
        t = pd.read_csv(f, header=None, names=["timestamp", "rtt", "loss_flag", "status"])
        t["ts"] = pd.to_datetime(t["timestamp"])
        t = t.sort_values("ts", kind="stable").reset_index(drop=True)
        if sentinel is not None:
            t.loc[t["loss_flag"] == 1, "rtt"] = sentinel
        t["jitter"] = t["rtt"].diff().abs().fillna(0.0)
        t["label"] = "ABCD".index(key)
        t["block"] = (np.arange(len(t)) * N_FOLDS) // len(t)
        frames.append(add_segments(add_window(t), gap_sec=20))
    return pd.concat(frames, ignore_index=True)


def scores(y, p):
    rec = recall_score(y, p, labels=LABELS, average=None, zero_division=0)
    return {"accuracy": round(accuracy_score(y, p), 4),
            "macro_f1": round(f1_score(y, p, labels=LABELS, average="macro", zero_division=0), 4),
            **{f"recall_{c}": round(r, 4) for c, r in zip("ABCD", rec)}}


def rf_model():
    return RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, class_weight="balanced", n_jobs=-1)


def block_cv_rf(df):
    folds = []
    for k in range(N_FOLDS):
        tr, te = df[df["block"] != k], df[df["block"] == k]
        folds.append(scores(te["label"], rf_model().fit(tr[F], tr["label"]).predict(te[F])))
    f1s = [s["macro_f1"] for s in folds]
    return {"macro_f1_mean": round(np.mean(f1s), 4), "macro_f1_std": round(np.std(f1s, ddof=1), 4),
            "recall_D_mean": round(np.mean([s["recall_D"] for s in folds]), 4)}


train = load_train()
rf = joblib.load(os.path.join(BASE_DIR, "models", "rf_best_accuracy.pkl"))
rf.set_params(n_jobs=1)
dtw = DecisionTreeClassifier(max_depth=10, random_state=42, class_weight="balanced").fit(train[FW], train["label"])

# 1) 새 세션 평가 + 2) 일반화 세션 B 구간별
rows, b_rows = [], []
for name in ["eval_same_params", "eval_generalization"]:
    d = pd.read_csv(os.path.join(NEW_DIR, f"{name}.csv"))
    d["ts"] = pd.to_datetime(d["timestamp"])
    d = add_segments(add_window(d))
    d["pred_rf"], d["pred_dtw"] = rf.predict(d[F]), dtw.predict(d[FW])
    subsets = {"all": d, "exclude_D_first5s": d[~((d["label"] == 3) & (d["sec_in_seg"] < 5))]}
    for subset, s in subsets.items():
        for model, col in [("RF", "pred_rf"), ("DT+window15", "pred_dtw")]:
            rows.append({"session": name, "subset": subset, "model": model, "n": len(s), **scores(s["label"], s[col])})
    if name == "eval_generalization":
        for seg, g in d[d["label"] == 1].groupby("seg"):
            b_rows.append({"segment": int(seg), "start": g["timestamp"].iloc[0], "n": len(g),
                           "rtt_median_ms": round(g["rtt"].median(), 2), "rf_recall_B": round((g["pred_rf"] == 1).mean(), 4)})
pd.DataFrame(rows).to_csv(os.path.join(OUT_DIR, "live_sessions.csv"), index=False)
pd.DataFrame(b_rows).to_csv(os.path.join(OUT_DIR, "generalization_B_segments.csv"), index=False)

# 3) 원 데이터 D 첫 5초
D = train[train["label"] == 3]
early, late = D[D["sec_in_seg"] < 5], D[D["sec_in_seg"] >= 5]
d5 = [{"part": "D_first5s", "n": len(early), "share": round(len(early) / len(D), 4),
       "rtt_median_ms": early["rtt"].median(), "loss_rate": round(early["loss_flag"].mean(), 4)},
      {"part": "D_rest", "n": len(late), "share": round(len(late) / len(D), 4),
       "rtt_median_ms": late["rtt"].median(), "loss_rate": round(late["loss_flag"].mean(), 4)},
      {"part": "A_reference", "n": int((train["label"] == 0).sum()), "share": None,
       "rtt_median_ms": train.loc[train["label"] == 0, "rtt"].median(), "loss_rate": None}]
cv_all = block_cv_rf(train)
cv_ex = block_cv_rf(train[~((train["label"] == 3) & (train["sec_in_seg"] < 5))])
d5.append({"part": "blockCV_RF_all", **cv_all})
d5.append({"part": "blockCV_RF_exclude_D_first5s", **cv_ex})
pd.DataFrame(d5).to_csv(os.path.join(OUT_DIR, "d_first5s.csv"), index=False)

# 4) 표식값 민감도
sens = [{"loss_rtt_sentinel_ms": v, **block_cv_rf(train if v == 5000 else load_train(sentinel=v))}
        for v in [1000, 3000, 5000, 10000]]
pd.DataFrame(sens).to_csv(os.path.join(OUT_DIR, "sentinel_sensitivity.csv"), index=False)

# 5) 재전송 확인 세션 요약 (nstat 계수는 raw_dataset_20261004/README.md)
ret = []
for c in "AC":
    t = pd.read_csv(os.path.join(NEW_DIR, f"retrans_{c}.csv"))
    ok = t.loc[t["loss_flag"] == 0, "rtt"]
    ret.append({"condition": c, "rows": len(t), "timeouts": int(t["loss_flag"].sum()),
                "delayed_over_150ms": int((ok > 150).sum()), "rtt_median_ms": round(ok.median(), 2),
                "near_200ms": int(ok.between(180, 260).sum()), "near_430ms": int(ok.between(400, 480).sum()),
                "near_640ms": int(ok.between(600, 700).sum()), "near_900ms": int(ok.between(850, 950).sum())})
pd.DataFrame(ret).to_csv(os.path.join(OUT_DIR, "retrans_summary.csv"), index=False)

for f in ["live_sessions", "generalization_B_segments", "d_first5s", "sentinel_sensitivity", "retrans_summary"]:
    print(f"\n=== {f}.csv")
    print(pd.read_csv(os.path.join(OUT_DIR, f"{f}.csv")).to_string(index=False))
