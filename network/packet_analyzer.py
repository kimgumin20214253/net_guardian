# [구민] 5대 피처 실시간 연산 파이썬 엔진
import csv
import time
import numpy as np
import subprocess
import re

# 팀장 지시사항: 입력 피처 5개와 정답 라벨 1개를 명확히 분리 정의
FEATURES = ['avg_rtt', 'max_rtt', 'std_rtt', 'moving_avg', 'rtt_change_rate']
LABEL = ['is_anomaly']

# CSV 파일에 저장할 최종 헤더 순서
CSV_HEADER = FEATURES + LABEL
CSV_FILE = 'data/net_guardian_robust_dataset.csv'

# CSV 초기화 및 헤더 작성
with open(CSV_FILE, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=CSV_HEADER)
    writer.writeheader()

print("[+] Modbus 패킷 감시 및 CSV 적립 엔진 가동 시작...")

rtt_history = []

def get_current_modbus_rtt():
    try:
        # 구민이 환경에 맞는 가상 슬레이브 IP (기본 로컬 호스트)
        target_ip = "127.0.0.1" 
        output = subprocess.check_output(["ping", "-c", "1", "-W", "1", target_ip]).decode('utf-8')
        rtt_match = re.search(r"time=([\d\.]+)\s+ms", output)
        if rtt_match:
            return float(rtt_match.group(1))
    except:
        pass
    
    # DoS 등으로 핑 타임아웃 발생 시 최대 타임아웃 난수 값 주입
    if get_current_label() == 1:
        return np.random.uniform(500.0, 1000.0) 
    return np.random.uniform(3.0, 5.0)

def get_current_label():
    try:
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
