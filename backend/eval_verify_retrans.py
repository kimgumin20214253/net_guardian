"""
RTO 초과(재전송 추정)가 실제 재전송과 맞는지 요청 단위로 대조하는 스크립트 (2026-10-09 실측 검증).
- 입력: raw_dataset_20261009/verify_retrans.csv
  (packet_analyzer.py를 PA_LOG_RETRANS=1로 실행해 요청마다 호스트 전체 TCP 재전송 증가량 retrans_segs를 함께 기록한 데이터)
- 1) 장애 유형별 실제 재전송 발생 비율과 RTO 초과 비율
- 2) 요청 단위 대조: RTO 초과(추정) vs retrans_segs>0(실제), 타임아웃 요청은 제외
- 3) 원 데이터(raw_dataset_20260904)로 학습한 RF(기본 / +TCP 방식)를 그대로 적용한 성능 (네 번째 독립 세션)
출력: results_tcp_features/verify_*.csv
"""
import os
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score
from eval_tcp_features import (BASE_DIR, OUT_DIR, FEATURE_SETS, add_features, load_train, rf, scores)

DATA = os.path.join(BASE_DIR, "raw_dataset_20261009", "verify_retrans.csv")
MODE = "karn"
NAMES = {0: "A", 1: "B", 2: "C", 3: "D"}

d = add_features(pd.read_csv(DATA), MODE)
d["retrans"] = (d["retrans_segs"] > 0).astype(int)

# 1) 유형별 요약
summary = []
for lab, g in d.groupby("label"):
    ok = g[g["loss_flag"] == 0]
    summary.append({"class": NAMES[lab], "requests": len(g), "timeouts": int(g["loss_flag"].sum()),
                    "rtt_median_ms": round(ok["rtt"].median(), 2),
                    "req_with_retrans": round(g["retrans"].mean(), 4),
                    "retrans_per_out_segs": round(g["retrans_segs"].sum() / g["out_segs"].sum(), 4),
                    "rto_exceed_rate": round(ok["rto_exceed"].mean(), 4)})
summary = pd.DataFrame(summary)

# 2) 요청 단위 대조 (응답을 받은 요청만)
rows = []
for name, g in [("all", d), *[(NAMES[k], v) for k, v in d.groupby("label")]]:
    g = g[g["loss_flag"] == 0]
    tp = int(((g["rto_exceed"] == 1) & (g["retrans"] == 1)).sum())
    fp = int(((g["rto_exceed"] == 1) & (g["retrans"] == 0)).sum())
    fn = int(((g["rto_exceed"] == 0) & (g["retrans"] == 1)).sum())
    tn = int(((g["rto_exceed"] == 0) & (g["retrans"] == 0)).sum())
    rows.append({"subset": name, "rto_exceed&retrans": tp, "rto_exceed_only": fp, "retrans_only": fn, "neither": tn,
                 "precision": round(tp / (tp + fp), 4) if tp + fp else None,
                 "recall": round(tp / (tp + fn), 4) if tp + fn else None})
match = pd.DataFrame(rows)

# 3) 원 데이터로 학습한 모델 적용
train = load_train(MODE)
perf = []
for fs in ["base", "base+window", "base+tcp", "all"]:
    F = FEATURE_SETS[fs]
    p = rf().fit(train[F], train["label"]).predict(d[F])
    perf.append({"features": fs, **scores(d["label"], p)})
perf = pd.DataFrame(perf)

summary.to_csv(os.path.join(OUT_DIR, "verify_summary.csv"), index=False)
match.to_csv(os.path.join(OUT_DIR, "verify_rto_vs_retrans.csv"), index=False)
perf.to_csv(os.path.join(OUT_DIR, "verify_model_performance.csv"), index=False)
pd.set_option("display.width", 200)
for t in [summary, match, perf]:
    print(t.to_string(index=False)); print()
