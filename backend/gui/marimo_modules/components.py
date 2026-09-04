# [승현]

(알림창, 팝업, 위험 도장 등 세부 부품)
장애가 감지되었을 때 화면에 띄울 경고창이나 수치 입력창 같은 개별 부품들을 모아두는 서랍입니다.

이 방으로 이사해야 할 코드:
장애 발생 시 화면 상단에 뻘갛게 뜰 대형 경고 배너 (mo.stat 또는 경고 박스 부품)
database/rule_thresholds.db와 연동되어 사용자가 임계치를 수정할 수 있는 입력 창 (mo.ui.slider 혹은 mo.ui.number)
DoS 공격 감지 시 "IP 차단 완료"라고 뜰 팝업 모달창 로직
승현이가 할 일: 화면에 들어갈 '개별 UI 정예 부품'들을 함수나 객체 형태로 이 파일에 깔끔하게 정리해두기.


# 코드 예시 
import marimo as mo
import sqlite3

def get_db_rules():
    """DB에서 논문 기반 임계치와 가이드라인을 읽어오는 함수"""
    conn = sqlite3.connect('database/rule_thresholds.db')
    cursor = conn.cursor()
    cursor.execute("SELECT status_name, rtt_limit, action_guide FROM threshold_rules")
    rules = cursor.fetchall()
    conn.close()
    return rules

def render_action_guide(current_rtt):
    """실시간 RTT를 받아 DB 기준치와 비교 후 대응 가이드를 마리모 UI로 뿜어주는 함수"""
    rules = get_db_rules()
    
    # 기본값은 정상 상태 설정
    status = "정상 가동 중"
    color = "green"
    guide_text = "PLC 로봇 제어 명령 안정 상태. 추가 조치 불필요."
    
    # DB에서 가져온 수치와 실시간 비교 연산
    for status_name, rtt_limit, action_guide in rules:
        if current_rtt >= rtt_limit:
            if status_name == 'Delay':
                status, color, guide_text = "⚠️ 경고 (대역폭 포화)", "yellow", action_guide
            elif status_name == 'Loss':
                status, color, guide_text = "🚨 위험 (EMI 오염)", "red", action_guide
            elif status_name == 'DoS':
                status, color, guide_text = "💥 치명적 재난 (네트워크 마비)", "purple", action_guide

    # 마리모 전용 아름다운 UI 상자(Callout)로 리턴
    return mo.md(f"""
    ### 📊 시스템 상태: :{color}[{status}]
    **[논문 고증 실시간 가동 지침]**
    > {guide_text}
    """)
