"""
현장 매뉴얼 기반 경량 보조 RAG 코파일럿.

아키텍처 원칙:
- 기존 Modbus 통신 루프/실시간 진단 모델(api/main.py의 /predict 등)과는 완전히 무관한 독립 모듈.
  이 파일을 import하는 것만으로 부작용이 없어야 하며, 여기서 예외가 나도 실시간 진단 경로에는
  영향을 주지 않는다 (api/main.py 쪽에서 라우터 등록을 try/except로 감싸는 것으로 보강).
- Ollama 로컬 LLM은 선택 사항이다. 미설치/타임아웃/에러 시 예외를 올리지 않고,
  검색된 매뉴얼 원문을 그대로 조합해 반환하는 Fallback으로 항상 응답한다.
"""
import os
import json

import httpx
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_PATH = os.path.join(BASE_DIR, "docs", "manual_knowledge_base.json")

OLLAMA_URL = os.environ.get("COPILOT_OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.environ.get("COPILOT_OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT_SEC = 3.0

with open(KB_PATH, encoding="utf-8") as f:
    _kb = json.load(f)

DOCUMENTS = _kb["documents"]
KB_META = _kb.get("meta", {})

_corpus = [
    f"{d['scenario']} {d['symptom']} {d['root_cause']} {d['action_guide']}"
    for d in DOCUMENTS
]
_vectorizer = TfidfVectorizer()
_doc_matrix = _vectorizer.fit_transform(_corpus)

# 대시보드의 시나리오 코드(A/B/C/D)를 지식베이스 문서와 매핑 (현재 진단 상태를 검색어에 반영하기 위함)
SCENARIO_TO_DOC_ID = {
    "A": "ICS-NET-04",
    "B": "ICS-NET-01",
    "C": "ICS-NET-02",
    "D": "ICS-NET-03",
}


def retrieve_top1(query: str, current_fault: str | None = None):
    """질문(+현재 장애 상태)과 가장 유사한 매뉴얼 문서 1건을 코사인 유사도로 검색."""
    combined_query = f"{current_fault or ''} {query}".strip()
    q_vec = _vectorizer.transform([combined_query])
    sims = cosine_similarity(q_vec, _doc_matrix)[0]
    idx = int(sims.argmax())
    return DOCUMENTS[idx], float(sims[idx])


def _format_readings(readings: dict | None) -> str | None:
    """대시보드에서 넘어온 실측값(rtt/loss_flag/jitter/confidence)을 사람이 읽을 문장으로 포맷.
    값이 하나도 없으면 None (질문에 실측값을 안 보낸 경우, 예: 빠른 질문 칩)."""
    if not readings:
        return None
    parts = []
    if readings.get("rtt") is not None:
        parts.append(f"RTT {readings['rtt']:.1f}ms")
    if readings.get("jitter") is not None:
        parts.append(f"Jitter {readings['jitter']:.1f}ms")
    if readings.get("loss_flag") is not None:
        parts.append(f"손실 플래그 {readings['loss_flag']}")
    if readings.get("confidence") is not None:
        parts.append(f"AI 신뢰도 {readings['confidence']*100:.1f}%")
    return " · ".join(parts) if parts else None


def build_fallback_answer(doc: dict, readings: dict | None = None) -> str:
    """Ollama를 못 쓸 때, 검색된 매뉴얼 원문 + (있으면) 실측값을 그대로 조합해 반환."""
    readings_line = _format_readings(readings)
    header = f"[{doc['scenario']}] 관련 매뉴얼을 찾았습니다."
    if readings_line:
        header += f"\n지금 이 순간의 실측값: {readings_line}"
    return (
        f"{header}\n\n"
        f"증상: {doc['symptom']}\n"
        f"추정 원인: {doc['root_cause']}\n\n"
        f"조치 절차:\n{doc['action_guide']}\n\n"
        f"점검 명령어: {doc['cli_command']}"
    )


async def ask_ollama(query: str, doc: dict, readings: dict | None = None) -> str | None:
    """로컬 Ollama 호출. 실패/타임아웃 시 None을 반환할 뿐 예외를 올리지 않는다."""
    readings_line = _format_readings(readings)
    readings_block = f"\n[지금 이 순간의 실측값]\n{readings_line}\n" if readings_line else ""
    prompt = (
        "당신은 산업 제어망(ICS) 트러블슈팅 보조 코파일럿입니다. "
        "아래 매뉴얼 컨텍스트에만 근거해 한국어로 간결하게 답하고, "
        "조치 절차와 점검 명령어를 반드시 인용하세요. 실측값이 주어지면 그 값을 답변에서 직접 언급하세요"
        "(예: 심각한 수준인지, 정상 범위에 가까운지). 컨텍스트에 없는 내용은 추측하지 마세요.\n\n"
        f"[매뉴얼 컨텍스트]\n"
        f"시나리오: {doc['scenario']}\n"
        f"증상: {doc['symptom']}\n"
        f"추정 원인: {doc['root_cause']}\n"
        f"조치 절차: {doc['action_guide']}\n"
        f"점검 명령어: {doc['cli_command']}\n"
        f"{readings_block}\n"
        f"[운영자 질문]\n{query}"
    )
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SEC) as client:
            resp = await client.post(
                OLLAMA_URL,
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            data = resp.json()
            answer = (data.get("response") or "").strip()
            return answer or None
    except Exception:
        return None


def get_guide_for_scenario(scenario: str) -> dict | None:
    """시나리오 코드(A/B/C/D)에 해당하는 매뉴얼 문서를 결정론적으로 조회한다.
    검색/LLM을 거치지 않으므로 지연이 없고 결과가 항상 동일하다 (체크리스트 UI용)."""
    doc_id = SCENARIO_TO_DOC_ID.get(scenario.upper())
    if not doc_id:
        return None
    for doc in DOCUMENTS:
        if doc["doc_id"] == doc_id:
            return doc
    return None


async def answer_query(query: str, current_fault: str | None = None, readings: dict | None = None) -> dict:
    """검색 + (가능하면) LLM 답변 + Fallback을 묶은 최종 응답 조립.
    readings(rtt/loss_flag/jitter/confidence)를 넘기면, LLM 프롬프트와 간이 응답 둘 다에
    "지금 이 순간의 실측값"으로 포함되어 일반 매뉴얼이 아니라 그 순간에 맞는 답이 된다."""
    doc, score = retrieve_top1(query, current_fault)
    llm_answer = await ask_ollama(query, doc, readings)
    if llm_answer:
        return {"answer": llm_answer, "source": doc["reference"], "fallback_used": False}
    return {"answer": build_fallback_answer(doc, readings), "source": doc["reference"], "fallback_used": True}
