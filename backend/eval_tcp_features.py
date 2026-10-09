"""
TCP 재전송 기준 시간(RTO) 방식 특징으로 유실 장애를 판별하는 평가 스크립트 (교수님 피드백 대응).

아이디어: TCP는 RTT 평균(SRTT)과 변동폭(RTTVAR)으로 재전송 기준 시간 RTO = SRTT + 4*RTTVAR(최소 200ms,
Linux 기준)를 정하고, 이 시간 안에 응답이 없으면 재전송한다(RFC 6298). 따라서 응답이 RTO를 넘겨 도착했다면
그 사이 재전송이 일어났다고 볼 수 있다. 유실은 "가끔 RTO를 넘는 응답"으로, 지연은 "평균 자체의 상승"으로 나타난다.

- 특징 세트 4개를 모두 같은 Random Forest로 비교한다: 기본 / +윈도우 / +TCP / 전체
- 검증 3개: 시간 블록 5-fold(원 데이터), 재수집 세션, 일반화 세션(원 데이터 전체로 학습한 모델을 그대로 적용)
- SRTT 갱신 방식 2개를 비교한다:
    timeout_only : 타임아웃(loss_flag=1) 샘플만 SRTT/RTTVAR 계산에서 제외
    karn         : 타임아웃 + "갑자기 RTO를 넘은" 응답(재전송 추정)도 제외. 단 연속으로 넘으면
                   실제로 경로가 느려진 것(지연)으로 보고 반영한다.
- 재전송 추정 검증: nstat을 잰 같은 60초 데이터(retrans_A/C.csv)에서 RTO 초과 비율을 계산해 nstat 재전송 비율과 비교
출력: results_tcp_features/ 아래 CSV
"""
import os
import glob
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, recall_score

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_DIR = os.path.join(BASE_DIR, "raw_dataset_20260904")
NEW_DIR = os.path.join(BASE_DIR, "raw_dataset_20261004")
OUT_DIR = os.path.join(BASE_DIR, "results_tcp_features")
os.makedirs(OUT_DIR, exist_ok=True)

WINDOW = 15
N_FOLDS = 5
RTO_MIN_MS = 200.0  # Linux TCP_RTO_MIN
LABELS = [0, 1, 2, 3]
# nstat 측정값 (raw_dataset_20261004/README.md)
NSTAT = {"A": (5, 4058), "C": (154, 2716)}

BASE = ["rtt", "loss_flag", "jitter"]
WIN = ["loss_rate_w", "rtt_std_w"]
TCP = ["srtt", "rttvar", "rto_exceed_w"]
FEATURE_SETS = {"base": BASE, "base+window": BASE + WIN, "base+tcp": BASE + TCP, "all": BASE + WIN + TCP}


def tcp_features(t, mode):
    """RFC 6298 방식 SRTT/RTTVAR/RTO를 요청 순서대로 계산하고, 응답이 직전 RTO를 넘었는지 표시한다."""
    srtt = rttvar = None
    prev_exceed = False
    S, V, E = [], [], []
    for rtt, loss in zip(t["rtt"].to_numpy(), t["loss_flag"].to_numpy()):
        rto = RTO_MIN_MS if srtt is None else max(RTO_MIN_MS, srtt + 4 * rttvar)
        exceed = bool(loss == 0 and srtt is not None and rtt > rto)
        update = loss == 0
        if mode == "karn" and exceed and not prev_exceed:
            update = False  # 갑자기 튄 응답 = 재전송 추정 -> 평균에서 제외 (Karn)
        if update:
            if srtt is None:
                srtt, rttvar = rtt, rtt / 2
            else:
                rttvar = 0.75 * rttvar + 0.25 * abs(srtt - rtt)
                srtt = 0.875 * srtt + 0.125 * rtt
        prev_exceed = exceed
        S.append(srtt if srtt is not None else 0.0)
        V.append(rttvar if rttvar is not None else 0.0)
        E.append(int(exceed))
    t["srtt"], t["rttvar"], t["rto_exceed"] = S, V, E
    t["rto_exceed_w"] = t["rto_exceed"].rolling(WINDOW, min_periods=1).mean()
    return t


def add_features(t, mode):
    t["jitter"] = t["rtt"].diff().abs().fillna(0.0)
    t["loss_rate_w"] = t["loss_flag"].rolling(WINDOW, min_periods=1).mean()
    t["rtt_std_w"] = t["rtt"].rolling(WINDOW, min_periods=1).std().fillna(0.0)
    return tcp_features(t, mode)


def load_train(mode):
    frames = []
    for f in sorted(glob.glob(os.path.join(TRAIN_DIR, "*.csv"))):
        key = os.path.basename(f).split("_")[1]
        t = pd.read_csv(f, header=None, names=["timestamp", "rtt", "loss_flag", "status"])
        t = t.sort_values("timestamp", kind="stable").reset_index(drop=True)
        t = add_features(t, mode)
        t["label"] = "ABCD".index(key)
        t["block"] = (np.arange(len(t)) * N_FOLDS) // len(t)
        frames.append(t)
    return pd.concat(frames, ignore_index=True)


def load_session(name, mode):
    return add_features(pd.read_csv(os.path.join(NEW_DIR, f"{name}.csv")), mode)


def rf():
    return RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42,
                                  class_weight="balanced", n_jobs=-1)


def scores(y, p):
    rec = recall_score(y, p, labels=LABELS, average=None, zero_division=0)
    return {"accuracy": round(accuracy_score(y, p), 4),
            "macro_f1": round(f1_score(y, p, labels=LABELS, average="macro", zero_division=0), 4),
            **{f"recall_{c}": round(r, 4) for c, r in zip("ABCD", rec)}}


rows, rate_rows = [], []
for mode in ["timeout_only", "karn"]:
    train = load_train(mode)
    sessions = {s: load_session(s, mode) for s in ["eval_same_params", "eval_generalization"]}
    for fs_name, F in FEATURE_SETS.items():
        ys, ps, f1s = [], [], []
        for k in range(N_FOLDS):
            tr, te = train[train["block"] != k], train[train["block"] == k]
            p = rf().fit(tr[F], tr["label"]).predict(te[F])
            ys.append(te["label"].to_numpy()); ps.append(p)
            f1s.append(f1_score(te["label"], p, labels=LABELS, average="macro", zero_division=0))
        rows.append({"srtt_mode": mode, "features": fs_name, "eval": "time_block_5fold",
                     **scores(np.concatenate(ys), np.concatenate(ps)),
                     "macro_f1_fold_mean": round(np.mean(f1s), 4), "macro_f1_fold_std": round(np.std(f1s, ddof=1), 4)})
        model = rf().fit(train[F], train["label"])
        for s_name, s in sessions.items():
            rows.append({"srtt_mode": mode, "features": fs_name, "eval": s_name,
                         **scores(s["label"], model.predict(s[F]))})
    # 클래스별 RTO 초과 비율 (원 데이터)
    for lab, g in train.groupby("label"):
        rate_rows.append({"srtt_mode": mode, "data": "raw_dataset_20260904", "class": "ABCD"[lab],
                          "rto_exceed_rate": round(g["rto_exceed"].mean(), 4)})
    # nstat과 같은 60초 구간에서 RTO 초과 비율 vs 실제 재전송 비율
    for c in "AC":
        t = add_features(pd.read_csv(os.path.join(NEW_DIR, f"retrans_{c}.csv")), mode)
        r, o = NSTAT[c]
        rate_rows.append({"srtt_mode": mode, "data": f"retrans_{c} (60s)", "class": c,
                          "rto_exceed_rate": round(t["rto_exceed"].mean(), 4),
                          "rto_exceed_count": int(t["rto_exceed"].sum()), "requests": len(t),
                          "nstat_retrans_rate": round(r / o, 4)})

res = pd.DataFrame(rows)
res.to_csv(os.path.join(OUT_DIR, "feature_comparison.csv"), index=False)
pd.DataFrame(rate_rows).to_csv(os.path.join(OUT_DIR, "rto_exceed_vs_retrans.csv"), index=False)
pd.set_option("display.width", 200)
print(res.to_string(index=False))
print()
print(pd.DataFrame(rate_rows).to_string(index=False))
