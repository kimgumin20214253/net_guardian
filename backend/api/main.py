import glob
import os

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# 코파일럿(RAG 챗봇)은 실시간 진단 경로와 완전히 독립된 보조 기능이다.
# 여기서 import 에러가 나더라도(패키지 누락, 지식베이스 JSON 문제 등) 기존 /predict,
# /telemetry/latest, /scenario 등 핵심 엔드포인트는 절대 영향받지 않도록 격리한다.
try:
    import copilot as copilot_module
    COPILOT_AVAILABLE = True
    COPILOT_IMPORT_ERROR = None
except Exception as e:  # noqa: BLE001 - 코파일럿 로드 실패를 절대 서버 기동 실패로 전파하지 않음
    copilot_module = None
    COPILOT_AVAILABLE = False
    COPILOT_IMPORT_ERROR = str(e)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "rf_best_accuracy.pkl")
LIVE_DATA_PATH = os.path.join(BASE_DIR, "data", "net_guardian_scenario_dataset.csv")
DEMO_DATA_DIR = os.path.join(BASE_DIR, "raw_dataset_20260904")
FEATURES = ["rtt", "loss_flag", "jitter"]

# train_and_benchmark.py / evaluate.py와 동일한 4대 시나리오 라벨 체계
# action_guide 문구는 database/rule_thresholds.db에 있던 논문 기반 대응 가이드를 그대로 가져옴
SCENARIO_INFO = {
    0: {
        "code": "normal",
        "name_ko": "정상",
        "severity": "ok",
        "action_guide": "PLC 로봇 제어 명령 안정 상태. 추가 조치 불필요.",
    },
    1: {
        "code": "delay",
        "name_ko": "지연 장애",
        "severity": "warning",
        "action_guide": "⚠️ 경고: 네트워크 대역폭 포화. 비가동성 트래픽 대역폭 제한(Action) 트리거.",
    },
    2: {
        "code": "loss",
        "name_ko": "유실 장애",
        "severity": "danger",
        "action_guide": "🚨 위험: EMI 오염 수렴. 공정 데이터 유실 방지를 위해 노이즈 감쇄 필터 모드 전환 명령어 송신.",
    },
    3: {
        "code": "combined",
        "name_ko": "복합 장애",
        "severity": "critical",
        "action_guide": "💥 치명적 재난: 네트워크 마비. 공격 IP 차단 및 방화벽 룰셋 강제 적용.",
    },
}
DEMO_SCENARIO_FILES = {
    0: "scenario_A_raw.csv",
    1: "scenario_B_raw.csv",
    2: "scenario_C_raw.csv",
    3: "scenario_D_raw.csv",
}
# network/server.py, packet_analyzer.py와 동일한 매핑 - 여기 쓰는 값을 그대로
# .current_label에 적으면 두 스크립트가 즉시 읽어서 지연/유실을 실제로 재현한다.
SCENARIO_LABEL_MAP = {"A": 0, "B": 1, "C": 2, "D": 3}
CURRENT_LABEL_PATH = os.path.join(BASE_DIR, ".current_label")

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


class ScenarioRequest(BaseModel):
    scenario: str = Field(..., description="A(정상)/B(지연)/C(유실)/D(복합) 중 하나")


def _read_current_scenario() -> str:
    try:
        with open(CURRENT_LABEL_PATH) as f:
            raw = f.read().strip().upper()
    except FileNotFoundError:
        raw = "A"
    return raw if raw in SCENARIO_LABEL_MAP else "A"


@app.get("/scenario")
def get_scenario():
    scenario = _read_current_scenario()
    return {"scenario": scenario, **SCENARIO_INFO[SCENARIO_LABEL_MAP[scenario]]}


@app.post("/scenario")
def set_scenario(req: ScenarioRequest):
    scenario = req.scenario.strip().upper()
    if scenario not in SCENARIO_LABEL_MAP:
        raise HTTPException(status_code=400, detail="scenario는 A, B, C, D 중 하나여야 합니다.")
    with open(CURRENT_LABEL_PATH, "w") as f:
        f.write(scenario)
    return {"scenario": scenario, **SCENARIO_INFO[SCENARIO_LABEL_MAP[scenario]]}


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


class CopilotChatRequest(BaseModel):
    query: str = Field(..., description="운영자 질문")
    current_fault: str | None = Field(None, description="현재 진단 상태 코드 (A/B/C/D), 있으면 검색 정확도 향상")
    rtt: float | None = Field(None, description="질문 시점의 실측 RTT(ms) - 있으면 답변에 반영")
    loss_flag: int | None = Field(None, description="질문 시점의 실측 손실 플래그(0/1)")
    jitter: float | None = Field(None, description="질문 시점의 실측 Jitter(ms)")
    confidence: float | None = Field(None, description="질문 시점의 AI 진단 신뢰도(0~1)")


@app.post("/api/copilot/chat")
async def copilot_chat(req: CopilotChatRequest):
    if not COPILOT_AVAILABLE:
        # 실시간 진단 경로와 무관한 보조 기능이므로, 로드 실패는 503으로만 알리고
        # 나머지 엔드포인트(/predict, /telemetry/latest, /scenario)는 정상 동작한다.
        raise HTTPException(
            status_code=503,
            detail=f"코파일럿을 사용할 수 없습니다: {COPILOT_IMPORT_ERROR}",
        )
    readings = {
        "rtt": req.rtt,
        "loss_flag": req.loss_flag,
        "jitter": req.jitter,
        "confidence": req.confidence,
    }
    return await copilot_module.answer_query(req.query, req.current_fault, readings)


@app.get("/api/copilot/guides")
def copilot_guides():
    """지식베이스 문서 4개를 한 번에 반환 (매뉴얼 브라우저 화면용, 검색/LLM 없이 결정론적 조회)."""
    if not COPILOT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=f"코파일럿을 사용할 수 없습니다: {COPILOT_IMPORT_ERROR}",
        )
    return {"documents": copilot_module.DOCUMENTS, "meta": copilot_module.KB_META}


@app.get("/api/copilot/guide/{scenario}")
def copilot_guide(scenario: str):
    if not COPILOT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=f"코파일럿을 사용할 수 없습니다: {COPILOT_IMPORT_ERROR}",
        )
    doc = copilot_module.get_guide_for_scenario(scenario)
    if not doc:
        raise HTTPException(status_code=404, detail="해당 시나리오의 매뉴얼을 찾을 수 없습니다.")
    return doc


@app.get("/stats/summary")
def stats_summary():
    """실제 수집 CSV 전체를 집계한 누적 통계 (지어낸 수치 없이, 저장된 데이터 그대로 계산)."""
    if not os.path.exists(LIVE_DATA_PATH):
        return {"source": "demo", "total_count": 0, "by_label": {}, "avg_rtt": None,
                "first_timestamp": None, "last_timestamp": None}

    df = pd.read_csv(LIVE_DATA_PATH)
    if df.empty:
        return {"source": "live", "total_count": 0, "by_label": {}, "avg_rtt": None,
                "first_timestamp": None, "last_timestamp": None}

    by_label = {
        SCENARIO_INFO[label]["name_ko"]: int((df["label"] == label).sum())
        for label in SCENARIO_INFO
    }
    return {
        "source": "live",
        "total_count": int(len(df)),
        "by_label": by_label,
        "avg_rtt": round(float(df["rtt"].mean()), 1),
        "first_timestamp": str(df["timestamp"].iloc[0]),
        "last_timestamp": str(df["timestamp"].iloc[-1]),
    }


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
