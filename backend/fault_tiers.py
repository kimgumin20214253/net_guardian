"""
지연(B)/유실(C)/복합(D) 장애를 7가지 세부 사례로 나눠 대응가이드를 추천하는 모듈.

각 사례의 근거(왜 이렇게 나누는지, 어떤 출처가 검증됐는지)는
backend/docs/장애대응_안전기준_조사.md 에 정리되어 있다. 요약하면:
- 지연(B): 세부 단계 없음 - 학습 데이터(raw_dataset_20260904)가 단일 강도(~290ms)로만
  수집되어 있어, 실제 데이터로 뒷받침되는 "여러 단계"가 없다 (inspect_fault_tiers.py로 확인).
- 유실(C): 최근 15건 중 RTO를 초과한 응답의 비율(rto_exceed_w)로 4단계가 실제로 구분된다
  (eval_tcp_features.py와 동일한 RFC 6298 + Karn 알고리즘 계산, inspect_fault_tiers.py로 분포 확인).
- 복합(D): "단계"가 아니라 장애 전환 후 첫 5초(정상 설정이 남아있는 과도구간, 전체의 69.6%)와
  그 이후(실제 장애 구간)로 나뉜다 (analyze_followup.py의 세그먼트 기준과 동일).
"""
from __future__ import annotations

import pandas as pd

WINDOW = 15
RTO_MIN_MS = 200.0
D_WARMUP_SEC = 5.0

CASES: dict[str, dict] = {
    "b1": {
        "name_ko": "지연 장애",
        "action_guide": (
            "1. 스위치 포트별 출력 드롭(Output Drops) 카운터 점검\n"
            "2. Modbus TCP 502 포트 트래픽에 우선순위 CoS/QoS 정책 적용\n"
            "3. 비인가 비업무 트래픽 대역폭 제한 조치"
        ),
        "reference": (
            "NIST SP 800-82 Rev.2 §5.8.11 (참고, 세부 절차는 팀 정의) / "
            "NIST SP 800-82 Rev.3 §2.4(p.28) 원문 확인: \"OT systems are generally "
            "time-critical, with the criterion for acceptable levels of delay and jitter "
            "dictated by the individual installation.\" — 이 가이드의 수치 기준은 이 "
            "프로젝트의 학습 데이터(단일 강도 약 290ms)에만 해당하며, 다른 강도의 지연에는 "
            "그대로 적용되지 않을 수 있음"
        ),
        "cli_command": "tc qdisc change dev eth0 root tbf rate 1mbit burst 32kbit latency 400ms",
    },
    "c0": {
        "name_ko": "유실 장애 · 초기(산발적)",
        "action_guide": (
            "1. 스위치 인터페이스의 CRC/FCS 에러 누적 카운트 확인\n"
            "2. 아직 재전송 패턴이 뚜렷하지 않음 - 모니터링을 유지하며 재발 여부 관찰"
        ),
        "reference": (
            "NIST SP 800-82 Rev.2 §6.2.11.3 (참고) — 재전송(RTO 초과) 신호 없음, "
            "이 프로젝트 실측 분포 기준 유실 샘플의 약 21%가 이 단계"
        ),
        "cli_command": "ip -s link show eth0",
    },
    "c1": {
        "name_ko": "유실 장애 · 경미",
        "action_guide": (
            "1. 스위치 인터페이스의 CRC/FCS 에러 누적 카운트 확인\n"
            "2. 차폐 케이블(STP) 및 접지 체결 상태 점검\n"
            "3. 이 설비가 통신 끊김 시 멈추는지 계속 돌아가는지 확인"
        ),
        "reference": (
            "NIST SP 800-82 Rev.2 §6.2.11.3 (참고) / NIST SP 800-82 Rev.3 §5.3.1(p.79) "
            "원문 확인: \"Cyber-related events, such as the loss of network "
            "communications, could trigger these fail-safe events... organizations "
            "should define the thresholds at which OT components can operate with "
            "reduced or disrupted capabilities\""
        ),
        "cli_command": "ip -s link show eth0",
    },
    "c2": {
        "name_ko": "유실 장애 · 중간(버스트 진행 중)",
        "action_guide": (
            "1. 버스트성 손실로 번지는 중 - EMI/케이블 점검을 바로 시작\n"
            "2. 가능하면 광케이블(Fiber) 또는 동축 케이블로 대체 검토\n"
            "3. 이 설비가 통신 끊김 시 멈추는지 계속 돌아가는지 확인"
        ),
        "reference": "NIST SP 800-82 Rev.2 §6.2.11.3 (참고) / NIST SP 800-82 Rev.3 §5.3.1(p.79) (원문 확인, c1과 동일 조항)",
        "cli_command": "ip -s link show eth0",
    },
    "c3": {
        "name_ko": "유실 장애 · 심함(뚜렷한 버스트)",
        "action_guide": (
            "1. 뚜렷한 버스트 손실 - 즉시 조치 시작\n"
            "2. 이 설비가 통신 끊김 시 멈추는지 계속 돌아가는지 반드시 확인 (모르면 위험할 수 있음)\n"
            "3. 차폐 케이블/접지 점검 후에도 재발하면 광케이블 교체 검토"
        ),
        "reference": "NIST SP 800-82 Rev.2 §6.2.11.3 (참고) / NIST SP 800-82 Rev.3 §5.3.1(p.79) (원문 확인, c1과 동일 조항)",
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
    "d2": {
        "name_ko": "복합 장애",
        "action_guide": (
            "1. 사람(작업자)이 설비 근처에 있는지 안전 확인을 최우선으로 진행\n"
            "2. 이중화 경로/링 토폴로지 자동 절체 동작 여부 확인\n"
            "3. 스위치 로그에서 링크 단절(flapping) 이력 점검\n"
            "4. 자동 절체가 안 되면 수동 운전 모드 전환 절차 준비"
        ),
        "reference": (
            "NIST SP 800-82 Rev.2 §5.6, §5.13 (참고) / NIST SP 800-82 Rev.3 원문 확인: "
            "§2.4(p.28) \"Any security measure that impairs safety is unacceptable\" / "
            "\"Some OT employ redundant components... to provide continuity\", "
            "§5.1.2(p.67) \"Ensuring that critical components are redundant and are on "
            "redundant networks\""
        ),
        "cli_command": "cat /var/log/syslog | grep -E 'link down|flapping'",
    },
}


def _rto_exceed_rate(points: list[tuple[float, int]]) -> float:
    """최근 포인트들(시간순, (rtt, loss_flag) 튜플)에 RFC 6298 + Karn 알고리즘을 적용해,
    가장 최근 시점의 rto_exceed_w(최근 WINDOW개 응답 중 RTO를 초과한 비율)를 계산한다.
    eval_tcp_features.py의 tcp_features(mode="karn")와 동일한 계산이다."""
    srtt = rttvar = None
    prev_exceed = False
    exceed_flags: list[int] = []
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
    if not exceed_flags:
        return 0.0
    recent = exceed_flags[-WINDOW:]
    return sum(recent) / len(recent)


def classify_case(scenario: str, recent_df: pd.DataFrame, fault_elapsed_sec: float | None) -> str | None:
    """scenario(A/B/C/D), 최근 telemetry(rtt/loss_flag 컬럼, 시간순 DataFrame),
    fault_elapsed_sec(현재 장애가 시작된 지 몇 초 지났는지, 모르면 None)로 7가지 중 하나를 고른다."""
    scenario = (scenario or "A").upper()
    if scenario == "A":
        return None
    if scenario == "B":
        return "b1"
    if scenario == "C":
        points = list(zip(recent_df["rtt"].tolist(), recent_df["loss_flag"].tolist()))
        rate = _rto_exceed_rate(points)
        if rate <= 0:
            return "c0"
        if rate < 2 / WINDOW:
            return "c1"
        if rate < 3 / WINDOW:
            return "c2"
        return "c3"
    if scenario == "D":
        # fault_elapsed_sec를 모르면(서버 재시작 등) 더 신중한 쪽(d2)으로 간주한다.
        if fault_elapsed_sec is not None and fault_elapsed_sec < D_WARMUP_SEC:
            return "d1"
        return "d2"
    return None


def get_case(case_id: str | None) -> dict | None:
    if not case_id:
        return None
    return CASES.get(case_id)
