"""
지연(B)/유실(C)/복합(D) 장애를 세부 사례로 나눠 대응가이드를 추천하는 모듈.

각 사례의 근거는 backend/docs/장애대응_안전기준_조사.md 와
backend/inspect_fault_tiers.py 의 실행 결과에 정리되어 있다. 요약하면:

- 지연(B) - 2가지: 논문이 유실(C) 판별에만 쓴 TCP 재전송 타이머(RTO) 방식을 지연에도
  적용해보니, 지연 샘플의 83.5%는 재전송 신호가 전혀 없는 "순수 지연"이지만 16.5%는
  최근 15건 중 1~2건꼴로 RTO를 초과한 "재전송 신호 혼재" 샘플이었다 (논문 표3의
  "지연 조건에서도 재전송 25% 발생"과 같은 현상). 후자는 유실로 번질 조짐일 수 있어
  별도 사례로 분리한다.
- 유실(C) - 5가지: 최근 15건 중 RTO를 초과한 건수(0~4건 이상)를 그대로 단계로 쓴다
  (3분위 대신 실제 건수 분포 - inspect_fault_tiers.py 5번 출력으로 확인).
- 복합(D) - 4가지: 장애 전환 후 첫 5초(전체의 69.6%, 사실상 아직 정상 설정이 남아있는
  과도구간)와 그 이후(실제 장애 구간)로 먼저 나누고, 실제 장애 구간은 rto_exceed_w가
  항상 0이라(응답 자체가 없는 샘플이 대부분이라 RTO 피처가 적용 안 됨) 대신
  loss_rate_w(최근 15건 중 실제 손실 비율)로 낮음/중간/높음 3단계를 더 나눈다.

각 사례의 reference에 인용된 KOSHA GUIDE(E-96-2011, G-135-2021)와 NIST SP 800-82 Rev.3는
backend/docs/references/ 에 있는 원문 PDF를 직접 읽고 조항/문항 번호와 원문 문구를 대조해
확인한 것이다 (검색엔진 스니펫이 아님). 다만 "팀이 취지를 재정리한 절차"와 "원문을 그대로
인용한 부분"은 구분해서 표기한다 - manual_knowledge_base.json과 같은 원칙이다.

[체크리스트 메커니즘 자체의 근거 - 특정 사례가 아니라 11가지 전체에 공통으로 적용됨]
이 모듈이 반환하는 가이드는 프론트엔드 ActionChecklist.tsx가 "항목을 하나씩 개별로 눌러야
완료되고, 전부 완료되기 전까지는 장애 상태가 유지되는" 체크리스트로 보여준다. 이 메커니즘은
지연(B)·유실(C)·복합(D) 11가지 사례 모두에 동일하게 적용되는 공통 설계이며, 특정 사례의
조치 근거가 아니다. KOSHA GUIDE E-96-2011 §4.1(12)(다)(PDF 8페이지=문서자체쪽수 -6-)
원문 확인: "작동된 모든 제어장치가 수동, 개별적 및 의도적으로 복귀될 때까지 재기동되지
않아야 한다" - 이 체크리스트 메커니즘 전체의 설계 근거이므로, 특정 사례의 reference가
아니라 여기(모듈 docstring)에 한 번만 적어둔다.
"""
from __future__ import annotations

import pandas as pd

WINDOW = 15
RTO_MIN_MS = 200.0
D_WARMUP_SEC = 5.0

_NIST_B = (
    "NIST SP 800-82 Rev.2 §5.8.11 (참고, 세부 절차는 팀 정의) / "
    "NIST SP 800-82 Rev.3 원문 확인(backend/docs/references/NIST.SP.800-82r3.pdf, "
    "PDF 46페이지=인쇄쪽수 29, 2장의 소제목 \"Comparing OT and IT System Security\"): "
    "\"OT systems are generally time-critical, with the criterion for acceptable levels of "
    "delay and jitter dictated by the individual installation.\" — 이 가이드의 수치 기준은 "
    "이 프로젝트의 학습 데이터(단일 강도 약 290ms)에만 해당함"
)
_NIST_C_FAILSAFE = (
    "NIST SP 800-82 Rev.2 §6.2.11.3 (참고) / NIST SP 800-82 Rev.3 원문 확인"
    "(backend/docs/references/NIST.SP.800-82r3.pdf, PDF 96페이지=인쇄쪽수 79, §5.3.1 "
    "\"Cyber-Related Safety Considerations\"): \"Cyber-related events, such as "
    "the loss of network communications, could trigger these fail-safe events... organizations "
    "should define the thresholds at which OT components can operate with reduced or "
    "disrupted capabilities\""
)
_NIST_D_REDUNDANCY = (
    "NIST SP 800-82 Rev.2 §5.6, §5.13 (참고) / NIST SP 800-82 Rev.3 원문 확인"
    "(backend/docs/references/NIST.SP.800-82r3.pdf): "
    "PDF 46페이지=인쇄쪽수 29, 2장 소제목 \"Comparing OT and IT System Security\" — "
    "\"Any security measure that impairs safety is unacceptable\" / \"Some OT employ "
    "redundant components... to provide continuity\"; "
    "PDF 21페이지=인쇄쪽수 4, Executive Summary의 defense-in-depth 목록 — "
    "\"Ensuring that critical components are redundant and are on redundant networks\""
)
_KOSHA_E96_PRIORITY = (
    "KOSHA GUIDE E-96-2011(산업용 기계설비의 비상정지장치 설계에 관한 기술지침) "
    "원문 확인(backend/docs/references/E-96-2011 산업용 기계설비의 비상정지장치 설계에 관한 기술지침.pdf, "
    "PDF 7페이지=문서자체쪽수 -5-, §4.1(7)(8)(11)): "
    "§4.1(7) \"비상정지신호(Command)는 다른 어떠한 작동신호보다 우선으로 한다\", "
    "§4.1(8) \"비상정지신호에 따른 기계의 응답은 어떠한 추가적인 다른 위험을 유발시켜서는 안된다\", "
    "§4.1(11) \"제어장치가 복귀(Reset)될 때까지 이 비상정지신호를 계속 유지\""
)
_KOSHA_G135_COMM_ALARM = (
    "KOSHA GUIDE G-135-2021(스마트팩토리 안전시스템 평가에 관한 기술지침) "
    "원문 확인(backend/docs/references/G-135-2021 스마트팩토리 안전시스템 평가에 관한 기술지침.pdf): "
    "PDF 23페이지=문서자체쪽수 -20-, 분야 \"공정설비 안전설계 및 구성 > 안전제어시스템\", "
    "문항90 \"안전PLC와 제어기기의 통신이 올바르지 않을 경우 상태경보등 또는 경보음을 발생시키는가?\"; "
    "PDF 16페이지=문서자체쪽수 -13-, 분야 \"정보(통신)운영기술 및 통신네트워크\", "
    "문항26 \"제어용 네트워크와는 별도로 안전시스템 기기와 IT 인프라 연결에 필요한 별도의 안전전용 "
    "네트워크가 구성되어 있는가?\""
)

CASES: dict[str, dict] = {
    "b1": {
        "name_ko": "지연 장애 · 순수 지연",
        "action_guide": (
            "1. 스위치 포트별 출력 드롭(Output Drops) 카운터 점검\n"
            "2. Modbus TCP 502 포트 트래픽에 우선순위 CoS/QoS 정책 적용\n"
            "3. 비인가 비업무 트래픽 대역폭 제한 조치"
        ),
        "reference": _NIST_B + " · 이 프로젝트 실측 기준 지연 샘플의 약 83.5%가 이 단계(재전송 신호 없음)",
        "cli_command": "tc qdisc change dev eth0 root tbf rate 1mbit burst 32kbit latency 400ms",
    },
    "b2": {
        "name_ko": "지연 장애 · 재전송 신호 혼재",
        "action_guide": (
            "1. 스위치 포트별 출력 드롭 카운터 점검, QoS 정책 적용(지연 조치는 동일)\n"
            "2. 패킷 순서 변경(reordering)이나 숨은 재전송이 섞여 있을 수 있음 - loss_flag 추이를 함께 모니터링\n"
            "3. 유실로 번지는 조짐이 있으면 유실 장애 가이드로 전환"
        ),
        "reference": (
            _NIST_B + " · 지연 샘플의 약 16.5%는 최근 15건 중 1건 이상 RTO를 초과한 샘플이었음 "
            "(이 프로젝트 실측 분석, inspect_fault_tiers.py 4번 출력) — 논문 표3의 "
            "\"지연 조건에서도 패킷 순서 변경으로 요청의 25%에서 재전송 발생\"과 같은 현상"
        ),
        "cli_command": "tc qdisc change dev eth0 root tbf rate 1mbit burst 32kbit latency 400ms",
    },
    "c0": {
        "name_ko": "유실 장애 · 0단계(재전송 신호 없음)",
        "action_guide": (
            "1. 스위치 인터페이스의 CRC/FCS 에러 누적 카운트 확인\n"
            "2. 아직 재전송 패턴이 뚜렷하지 않음 - 모니터링을 유지하며 재발 여부 관찰"
        ),
        "reference": "NIST SP 800-82 Rev.2 §6.2.11.3 (참고) — 유실 샘플의 약 21.0%가 이 단계(최근 15건 중 RTO초과 0건)",
        "cli_command": "ip -s link show eth0",
    },
    "c1": {
        "name_ko": "유실 장애 · 1단계(경미)",
        "action_guide": (
            "1. 스위치 인터페이스의 CRC/FCS 에러 누적 카운트 확인\n"
            "2. 차폐 케이블(STP) 및 접지 체결 상태 점검\n"
            "3. 이 설비가 통신 끊김 시 멈추는지 계속 돌아가는지, 상태경보/경보음이 뜨는지 확인"
        ),
        "reference": _NIST_C_FAILSAFE + " · " + _KOSHA_G135_COMM_ALARM + " · 유실 샘플의 약 31.5%가 이 단계(최근 15건 중 RTO초과 1건)",
        "cli_command": "ip -s link show eth0",
    },
    "c2": {
        "name_ko": "유실 장애 · 2단계(중간)",
        "action_guide": (
            "1. 버스트성 손실로 번지는 중 - EMI/케이블 점검을 바로 시작\n"
            "2. 가능하면 광케이블(Fiber) 또는 동축 케이블로 대체 검토\n"
            "3. 이 설비가 통신 끊김 시 멈추는지 계속 돌아가는지, 상태경보/경보음이 뜨는지 확인"
        ),
        "reference": _NIST_C_FAILSAFE + " · " + _KOSHA_G135_COMM_ALARM + " · 유실 샘플의 약 30.3%가 이 단계(최근 15건 중 RTO초과 2건)",
        "cli_command": "ip -s link show eth0",
    },
    "c3": {
        "name_ko": "유실 장애 · 3단계(심함)",
        "action_guide": (
            "1. 뚜렷한 버스트 손실 - 즉시 조치 시작\n"
            "2. 이 설비가 통신 끊김 시 멈추는지 계속 돌아가는지, 상태경보/경보음이 뜨는지 반드시 확인 (모르면 위험할 수 있음)\n"
            "3. 차폐 케이블/접지 점검 후에도 재발하면 광케이블 교체 검토"
        ),
        "reference": _NIST_C_FAILSAFE + " · " + _KOSHA_G135_COMM_ALARM + " · 유실 샘플의 약 12.4%가 이 단계(최근 15건 중 RTO초과 3건)",
        "cli_command": "ip -s link show eth0",
    },
    "c4": {
        "name_ko": "유실 장애 · 4단계(매우 심함)",
        "action_guide": (
            "1. 매우 뚜렷한 버스트 손실 - 최우선으로 즉시 조치\n"
            "2. 이 설비가 통신 끊김 시 멈추는지 계속 돌아가는지, 상태경보/경보음이 뜨는지 반드시 확인\n"
            "3. 차폐 케이블/접지/광케이블 교체를 함께 검토하고, 유실이 지속되면 복합 장애 가능성도 점검"
        ),
        "reference": _NIST_C_FAILSAFE + " · " + _KOSHA_G135_COMM_ALARM + " · 유실 샘플의 약 5.1%가 이 단계(최근 15건 중 RTO초과 4건 이상)",
        "cli_command": "ip -s link show eth0",
    },
    "d1": {
        "name_ko": "복합 장애 · 전환 초기(분석 중)",
        "action_guide": "1. 복합 장애 신호가 감지되었습니다. 아직 지켜보는 단계이며, 잠시 후 재평가됩니다",
        "reference": (
            "이 구간은 외부 안전기준이 아니라 이 프로젝트 실험 설계상의 전환 구간(과도구간)이다. "
            "analyze_followup.py의 세그먼트 분석 결과, 복합 장애 샘플의 약 69.6%가 이 첫 5초 구간에서 "
            "수집되었으며 이 구간은 실제로는 아직 정상 설정이 남아있는 상태였다"
        ),
        "cli_command": "",
    },
    "d2_low": {
        "name_ko": "복합 장애 · 손실 비중 낮음",
        "action_guide": (
            "1. 사람(작업자)이 설비 근처에 있는지 안전 확인을 최우선으로 진행\n"
            "2. 이중화 경로/링 토폴로지 자동 절체 동작 여부 확인\n"
            "3. 아직 손실 비중은 낮고 지연이 더 두드러지는 구간 - 지연 조치(QoS)도 함께 점검"
        ),
        "reference": _NIST_D_REDUNDANCY + " · " + _KOSHA_E96_PRIORITY + " · 복합 실제 장애 구간의 약 45.5%가 이 단계(최근 15건 중 손실 30% 미만)",
        "cli_command": "cat /var/log/syslog | grep -E 'link down|flapping'",
    },
    "d2_mid": {
        "name_ko": "복합 장애 · 손실 비중 중간",
        "action_guide": (
            "1. 사람(작업자)이 설비 근처에 있는지 안전 확인을 최우선으로 진행\n"
            "2. 이중화 경로/링 토폴로지 자동 절체 동작 여부 즉시 확인\n"
            "3. 스위치 로그에서 링크 단절(flapping) 이력 점검"
        ),
        "reference": _NIST_D_REDUNDANCY + " · " + _KOSHA_E96_PRIORITY + " · 복합 실제 장애 구간의 약 24.2%가 이 단계(최근 15건 중 손실 30~60%)",
        "cli_command": "cat /var/log/syslog | grep -E 'link down|flapping'",
    },
    "d2_high": {
        "name_ko": "복합 장애 · 손실 비중 높음(거의 완전 단절)",
        "action_guide": (
            "1. 사람(작업자)이 설비 근처에 있는지 안전 확인을 최우선으로 진행 (가장 심각한 단계)\n"
            "2. 이중화 경로 자동 절체가 안 되었다면 즉시 수동 운전 모드 전환 준비\n"
            "3. 스위치 로그에서 링크 단절(flapping) 이력 점검, 배선 손상 여부 현장 확인"
        ),
        "reference": _NIST_D_REDUNDANCY + " · " + _KOSHA_E96_PRIORITY + " · 복합 실제 장애 구간의 약 30.3%가 이 단계(최근 15건 중 손실 60% 이상)",
        "cli_command": "cat /var/log/syslog | grep -E 'link down|flapping'",
    },
}


def _tcp_rto_features(points: list[tuple[float, int]]) -> tuple[list[int], list[int]]:
    """RFC 6298 + Karn 알고리즘으로 RTO초과 플래그와 손실 플래그를 순서대로 계산한다.
    eval_tcp_features.py의 tcp_features(mode="karn")와 동일한 계산이다."""
    srtt = rttvar = None
    prev_exceed = False
    exceed_flags: list[int] = []
    loss_flags: list[int] = []
    for rtt, loss in points:
        rto = RTO_MIN_MS if srtt is None else max(RTO_MIN_MS, srtt + 4 * rttvar)
        exceed = bool(loss == 0 and srtt is not None and rtt > rto)
        update = loss == 0
        if exceed and not prev_exceed:
            update = False  # Karn: 갑자기 튄 응답은 재전송 추정 -> SRTT 갱신에서 제외
        if update:
            if srtt is None:
                srtt, rttvar = rtt, rtt / 2
            else:
                rttvar = 0.75 * rttvar + 0.25 * abs(srtt - rtt)
                srtt = 0.875 * srtt + 0.125 * rtt
        prev_exceed = exceed
        exceed_flags.append(int(exceed))
        loss_flags.append(int(loss))
    return exceed_flags, loss_flags


def _recent_rate(flags: list[int]) -> float:
    if not flags:
        return 0.0
    recent = flags[-WINDOW:]
    return sum(recent) / len(recent)


def classify_case(scenario: str, recent_df: pd.DataFrame, fault_elapsed_sec: float | None) -> str | None:
    """scenario(A/B/C/D), 최근 telemetry(rtt/loss_flag 컬럼, 시간순 DataFrame),
    fault_elapsed_sec(현재 장애가 시작된 지 몇 초 지났는지, 모르면 None)로 세부 사례 하나를 고른다."""
    scenario = (scenario or "A").upper()
    if scenario == "A":
        return None

    points = list(zip(recent_df["rtt"].tolist(), recent_df["loss_flag"].tolist()))
    exceed_flags, loss_flags = _tcp_rto_features(points)
    rto_rate = _recent_rate(exceed_flags)

    if scenario == "B":
        return "b2" if rto_rate > 0 else "b1"

    if scenario == "C":
        count = round(rto_rate * WINDOW)
        if count <= 0:
            return "c0"
        if count == 1:
            return "c1"
        if count == 2:
            return "c2"
        if count == 3:
            return "c3"
        return "c4"

    if scenario == "D":
        # fault_elapsed_sec를 모르면(서버 재시작 등) 더 신중한 쪽(d2_high)으로 간주한다.
        if fault_elapsed_sec is not None and fault_elapsed_sec < D_WARMUP_SEC:
            return "d1"
        loss_rate = _recent_rate(loss_flags)
        if fault_elapsed_sec is None:
            return "d2_high"
        if loss_rate < 0.3:
            return "d2_low"
        if loss_rate < 0.6:
            return "d2_mid"
        return "d2_high"

    return None


def get_case(case_id: str | None) -> dict | None:
    if not case_id:
        return None
    return CASES.get(case_id)
