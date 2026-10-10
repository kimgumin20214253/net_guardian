"""
표 2와 같은 기준(원 데이터 전체로 학습한 RF, 특징 세트만 변경)으로 본문 숫자 두 가지를 다시 계산한다.
1) 탐지 지연: 재수집·검증 세션의 장애 구간(B/C/D)마다 구간 시작부터 처음 정답을 예측한 시점까지의 시간
2) 일반화 세션 지연(B) 구간별 실측 RTT 중앙값과 지연 재현율 (기본 특징 RF)
출력: results_tcp_features/detection_delay.csv, detection_delay_summary.csv, generalization_B_segments.csv
"""
import os
import pandas as pd
from eval_tcp_features import BASE_DIR, NEW_DIR, OUT_DIR, FEATURE_SETS, add_features, load_train, rf

MODE = "karn"
NAMES = {1: "B", 2: "C", 3: "D"}
SESSIONS = {
    "eval_same_params": os.path.join(NEW_DIR, "eval_same_params.csv"),
    "verify_retrans": os.path.join(BASE_DIR, "raw_dataset_20261009", "verify_retrans.csv"),
}

train = load_train(MODE)
models = {fs: rf().fit(train[FEATURE_SETS[fs]], train["label"]) for fs in ["base", "base+tcp"]}

rows = []
for s_name, path in SESSIONS.items():
    d = add_features(pd.read_csv(path), MODE)
    d["ts"] = pd.to_datetime(d["timestamp"])
    d["segment"] = (d["label"] != d["label"].shift()).cumsum()
    for fs, m in models.items():
        d["pred"] = m.predict(d[FEATURE_SETS[fs]])
        for _, seg in d.groupby("segment"):
            lab = int(seg["label"].iloc[0])
            if lab == 0:
                continue
            hit = seg.index[seg["pred"] == lab]
            rows.append({"session": s_name, "features": fs, "class": NAMES[lab], "start": seg["timestamp"].iloc[0],
                         "detected": len(hit) > 0,
                         "seconds_to_detect": (d.loc[hit[0], "ts"] - seg["ts"].iloc[0]).total_seconds() if len(hit) else None})
det = pd.DataFrame(rows)
summary = det.groupby(["session", "features", "class"]).agg(
    segments=("detected", "size"), detected=("detected", "sum"),
    median_seconds=("seconds_to_detect", "median"), max_seconds=("seconds_to_detect", "max")).reset_index()

# 일반화 세션: 지연(B) 구간별 (기본 특징 RF)
g = add_features(pd.read_csv(os.path.join(NEW_DIR, "eval_generalization.csv")), MODE)
g["segment"] = (g["label"] != g["label"].shift()).cumsum()
g["pred"] = models["base"].predict(g[FEATURE_SETS["base"]])
b_rows = [{"start": seg["timestamp"].iloc[0], "n": len(seg), "rtt_median_ms": round(seg["rtt"].median(), 2),
           "rf_recall_B": round((seg["pred"] == 1).mean(), 4)}
          for _, seg in g[g["label"] == 1].groupby("segment")]
gen_b = pd.DataFrame(b_rows)

det.to_csv(os.path.join(OUT_DIR, "detection_delay.csv"), index=False)
summary.to_csv(os.path.join(OUT_DIR, "detection_delay_summary.csv"), index=False)
gen_b.to_csv(os.path.join(OUT_DIR, "generalization_B_segments.csv"), index=False)
pd.set_option("display.width", 200)
print(summary.to_string(index=False)); print()
print(gen_b.to_string(index=False))
