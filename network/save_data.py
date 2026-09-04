import os
import csv
from datetime import datetime

# 기본 경로
BASE_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'raw_dataset_20260904'
)

os.makedirs(BASE_DATA_DIR, exist_ok=True)

# 각 시나리오별 파일 경로
SCENARIO_FILES = {
    'A': os.path.join(BASE_DATA_DIR, 'scenario_A_raw.csv'),
    'B': os.path.join(BASE_DATA_DIR, 'scenario_B_raw.csv'),
    'C': os.path.join(BASE_DATA_DIR, 'scenario_C_raw.csv'),
    'D': os.path.join(BASE_DATA_DIR, 'scenario_D_raw.csv')
}

HEADERS = ['time', 'rtt', 'loss', 'status']


def _initialize_csv_file(filepath):
    """CSV 파일 생성 (헤더 포함)"""
    if not os.path.exists(filepath):
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow(HEADERS)


def _save_to_csv(scenario, rtt, loss, status):
    """공통 저장 함수"""
    if scenario not in SCENARIO_FILES:
        return
    
    filepath = SCENARIO_FILES[scenario]
    _initialize_csv_file(filepath)
    
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # RTT 값 처리
    if isinstance(rtt, str) and rtt.strip() == '':
        rtt_value = 5000
    else:
        try:
            rtt_value = float(rtt)
        except:
            rtt_value = 5000
    
    # CSV 저장
    try:
        with open(filepath, 'a', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow([timestamp, rtt_value, loss, status])
    except Exception as e:
        print(f"❌ 오류: {e}")


# 시나리오별 함수
def save_normal_data(rtt, loss, status):
    """시나리오 A 저장"""
    _save_to_csv('A', rtt, loss, status)


def save_delay_data(rtt, loss, status):
    """시나리오 B 저장"""
    _save_to_csv('B', rtt, loss, status)


def save_loss_data(rtt, loss, status):
    """시나리오 C 저장"""
    _save_to_csv('C', rtt, loss, status)


def save_delay_loss_data(rtt, loss, status):
    """시나리오 D 저장"""
    _save_to_csv('D', rtt, loss, status)
