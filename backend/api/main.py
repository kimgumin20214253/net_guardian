import glob
import os

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "rf_best_accuracy.pkl")
LIVE_DATA_PATH = os.path.join(BASE_DIR, "data", "net_guardian_scenario_dataset.csv")
DEMO_DATA_DIR = os.path.join(BASE_DIR, "raw_dataset_20260904")
FEATURES = ["rtt", "loss_flag", "jitter"]

# train_and_benchmark.py / evaluate.py와 동일한 4대 시나리오 라벨 체계
SCENARIO_INFO = {
    0: {"code": "normal", "name_ko": "정상", "severity": "ok"},
    1: {"code": "delay", "name_ko": "지연 장애", "severity": "warning"},
    2: {"code": "loss", "name_ko": "유실 장애", "severity": "danger"},
    3: {"code": "combined", "name_ko": "복합 장애", "severity": "critical"},
}
DEMO_SCENARIO_FILES = {
    0: "scenario_A_raw.csv",
    1: "scenario_B_raw.csv",
    2: "scenario_C_raw.csv",
    3: "scenario_D_raw.csv",
}

app = FastAPI(title="Net Guardian Model API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"{MODEL_PATH} 모델 파일이 없습니다. 먼저 train_and_benchmark.py를 실행하세요."
    )
model = joblib.load(MODEL_PATH)


class PredictRequest(BaseModel):
    rtt: float = Field(..., description="왕복 지연시간 (ms)")
    loss_flag: int = Field(..., ge=0, le=1, description="패킷 유실 여부 (0 또는 1)")
    jitter: float = Field(..., description="직전 샘플 대비 RTT 변동폭 (ms)")


def build_prediction(row: dict) -> dict:
    X = pd.DataFrame([{k: row[k] for k in FEATURES}])
    label = int(model.predict(X)[0])
    proba = None
    if hasattr(model, "predict_proba"):
        proba = {
            str(cls): round(float(p), 4)
            for cls, p in zip(model.classes_, model.predict_proba(X)[0])
        }
    info = SCENARIO_INFO[label]
    return {"label": label, "probabilities": proba, **info}


@app.get("/health")
def health():
    return {"status": "ok", "model": os.path.basename(MODEL_PATH), "features": FEATURES}


@app.post("/predict")
def predict(req: PredictRequest):
    return build_prediction(req.model_dump())


def _load_demo_telemetry(n: int) -> pd.DataFrame:
    per_scenario = max(1, n // len(DEMO_SCENARIO_FILES))
    frames = []
    for label, fname in DEMO_SCENARIO_FILES.items():
        path = os.path.join(DEMO_DATA_DIR, fname)
        if not os.path.exists(path):
            continue
        temp_df = pd.read_csv(
            path, header=None, names=["timestamp", "rtt", "loss_flag", "is_abnormal_flag"]
        )
        temp_df["timestamp"] = pd.to_datetime(temp_df["timestamp"])
        temp_df = temp_df.sort_values("timestamp").reset_index(drop=True)
        temp_df["rtt"] = pd.to_numeric(temp_df["rtt"], errors="coerce")
        temp_df["jitter"] = temp_df["rtt"].diff().abs().fillna(0.0)
        temp_df["true_label"] = label
        frames.append(temp_df.tail(per_scenario))
    if not frames:
        return pd.DataFrame(columns=["timestamp", "rtt", "loss_flag", "jitter", "true_label"])
    return pd.concat(frames, ignore_index=True)


@app.get("/telemetry/latest")
def telemetry_latest(n: int = 50):
    if os.path.exists(LIVE_DATA_PATH):
        df = pd.read_csv(LIVE_DATA_PATH).tail(n)
        source = "live"
        df = df.rename(columns={"label": "true_label"})
    else:
        df = _load_demo_telemetry(n)
        source = "demo"

    if df.empty:
        return {"source": source, "points": []}

    points = []
    for _, row in df.iterrows():
        pred = build_prediction(row.to_dict())
        points.append(
            {
                "timestamp": str(row["timestamp"]),
                "rtt": float(row["rtt"]),
                "loss_flag": int(row["loss_flag"]),
                "jitter": float(row["jitter"]),
                "true_label": int(row["true_label"]) if "true_label" in row else None,
                "predicted": pred,
            }
        )
    return {"source": source, "points": points}
