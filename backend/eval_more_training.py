"""
학습 데이터를 늘렸을 때의 성능 향상 평가 (교수님 피드백: 모델을 더 많이 학습시켜 성능 향상).
모든 평가에서 시험하는 데이터는 학습에서 제외한다.

A) 세션 추가 학습: 원 데이터만으로 학습한 모델 vs 원 데이터 + (시험 세션을 뺀) 나머지 세션으로 학습한 모델을
   재수집·일반화·검증 세션 각각에 적용 (leave-one-session-out)
B) 다양한 장애 강도 학습: 일반화 세션(B 60·200ms, C p 2·10%, D 강도 변경)을 시간 순서로 반으로 나누어,
   한쪽 절반을 학습에 추가하고 다른 절반으로 시험한다. 두 방향을 모두 수행하고 예측을 합쳐 평가한다.
   비교 기준은 같은 절반을 원 데이터 + 재수집·검증 세션(고정 강도)만으로 학습한 모델로 시험한 결과이다.
출력: results_tcp_features/more_training.csv
"""
import os
import numpy as np
import pandas as pd
from eval_tcp_features import (BASE_DIR, NEW_DIR, OUT_DIR, FEATURE_SETS, add_features, load_train, rf, scores)

MODE = "karn"
PATHS = {
    "eval_same_params": os.path.join(NEW_DIR, "eval_same_params.csv"),
    "eval_generalization": os.path.join(NEW_DIR, "eval_generalization.csv"),
    "verify_retrans": os.path.join(BASE_DIR, "raw_dataset_20261009", "verify_retrans.csv"),
}

orig = load_train(MODE)
sessions = {k: add_features(pd.read_csv(p), MODE) for k, p in PATHS.items()}
gen = sessions["eval_generalization"]
ts = pd.to_datetime(gen["timestamp"])
half = (ts >= ts.min() + (ts.max() - ts.min()) / 2).astype(int)  # 0: 앞쪽 절반, 1: 뒤쪽 절반


def fit(frames, F):
    d = pd.concat([f[F + ["label"]] for f in frames], ignore_index=True)
    return rf().fit(d[F], d["label"])


rows = []
for fs, F in FEATURE_SETS.items():
    # A) 세션 추가 학습
    m_orig = fit([orig], F)
    for test, d in sessions.items():
        others = [sessions[k] for k in sessions if k != test]
        m_more = fit([orig] + others, F)
        rows.append({"experiment": "add_sessions", "features": fs, "test": test, "train": "original",
                     **scores(d["label"], m_orig.predict(d[F]))})
        rows.append({"experiment": "add_sessions", "features": fs, "test": test, "train": "original+other_sessions",
                     **scores(d["label"], m_more.predict(d[F]))})
    # B) 다양한 장애 강도 학습 (일반화 세션 절반 교차)
    fixed = [orig, sessions["eval_same_params"], sessions["verify_retrans"]]
    y_all, p_fixed, p_diverse = [], [], []
    for h in (0, 1):
        test, train_half = gen[half == h], gen[half != h]
        y_all.append(test["label"].to_numpy())
        p_fixed.append(fit(fixed, F).predict(test[F]))
        p_diverse.append(fit(fixed + [train_half], F).predict(test[F]))
    y_all = np.concatenate(y_all)
    rows.append({"experiment": "diverse_intensity", "features": fs, "test": "eval_generalization (half-split)",
                 "train": "fixed_intensity", **scores(y_all, np.concatenate(p_fixed))})
    rows.append({"experiment": "diverse_intensity", "features": fs, "test": "eval_generalization (half-split)",
                 "train": "fixed+diverse_intensity", **scores(y_all, np.concatenate(p_diverse))})

res = pd.DataFrame(rows)
res.to_csv(os.path.join(OUT_DIR, "more_training.csv"), index=False)
pd.set_option("display.width", 220)
print(res.to_string(index=False))
