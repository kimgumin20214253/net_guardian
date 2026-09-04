# [구민] 5대 피처 실시간 연산 파이썬 엔진 (경로 수정 완결본)
import csv
import time
import numpy as np
import subprocess
import os

# 팀장 지시사항: 입력 피처 5개와 정답 라벨 1개를 명확히 분리 정의
FEATURES = ['avg_rtt', 'max_rtt', 'std_rtt', 'moving_avg', 'rtt_change_rate']
LABEL = ['is_anomaly']

# CSV 파일에 저장할 최종 헤더 순서
CSV_HEADER = FEATURES + LABEL

# ★ 팀장 정밀 교정: network/ 폴더 안에서 실행되므로 상위 폴더의 data/를 가리키도록 '../' 필수 반영
CSV_FILE = '../data/net_guardian_robust_dataset.csv'

# data/ 폴더가 없을 경우를 대비한 안전장치 추가
os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)

# CSV 헤더 작성 (파일이 없을 때만 - 기존 수집 데이터 보존)
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADER)
        writer.writeheader()

print("[+] Modbus 패킷 감시 및 CSV 적립 엔진 가동 시작...")

rtt_history = []

PING_TIMEOUT_MS = 1000.0

def get_current_modbus_rtt():
    # 구민이 환경에 맞는 가상 슬레이브 IP (기본 로컬 호스트)
    target_ip = "127.0.0.1"
    if os.name == 'nt':
        # Windows: -n(횟수), -w(타임아웃, ms 단위)
        cmd = ["ping", "-n", "1", "-w", str(int(PING_TIMEOUT_MS)), target_ip]
    else:
        # Linux/Mac: -c(횟수), -W(타임아웃, 초 단위)
        cmd = ["ping", "-c", "1", "-W", str(int(PING_TIMEOUT_MS / 1000)), target_ip]

    # ping 응답 문자열은 OS/로캘마다 표기가 달라 파싱이 불안정하므로,
    # 실측 wall-clock 시간과 종료 코드(성공/실패)로 RTT를 직접 측정
    start = time.perf_counter()
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elapsed_ms = (time.perf_counter() - start) * 1000

    if result.returncode == 0:
        return elapsed_ms

    # 통신 실패(유실/단절) 시: 값을 지어내지 말고 timeout 상한을 실측 한계로 기록
    return PING_TIMEOUT_MS

def get_current_label():
    try:
        # 이 라벨 임시 파일도 network/ 안에서 생성되므로 현재 경로 파일 그대로 유지
        with open('.current_label', 'r') as f:
            return int(f.read().strip())
    except:
        return 0

try:
    while True:
        current_rtt = get_current_modbus_rtt()
        is_anomaly_label = get_current_label()
 
        rtt_history.append(current_rtt)
        if len(rtt_history) > 10:
            rtt_history.pop(0)
 
        avg_rtt = np.mean(rtt_history)
        max_rtt = np.max(rtt_history)
        std_rtt = np.std(rtt_history) if len(rtt_history) > 1 else 0.0
        moving_avg = np.mean(rtt_history[-10:])
 
        # ZeroDivisionError 방지를 위한 분모 검증 로직
        if len(rtt_history) > 1 and rtt_history[-2] > 0:
            rtt_change_rate = (abs(rtt_history[-1] - rtt_history[-2]) / rtt_history[-2]) * 100
        else:
            rtt_change_rate = 0.0

        # 데이터 프레임 한 줄 매핑 (5대 피처 수치 연산 결과)
        row_data = {
            'avg_rtt': round(avg_rtt, 2),
            'max_rtt': round(max_rtt, 2),
            'std_rtt': round(std_rtt, 2),
            'moving_avg': round(moving_avg, 2),
            'rtt_change_rate': round(rtt_change_rate, 2),
            'is_anomaly': is_anomaly_label  # 외부 셸 스크립트가 도장 찍어주는 정답 라벨
        }

        with open(CSV_FILE, 'a', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADER)
            writer.writerow(row_data)
 
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\n[-] 엔진 종료.")
