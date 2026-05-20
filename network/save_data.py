import csv

import os

import time



def _save_to_csv(filename, rtt, loss, status):

    """

    [내부 함수] 지정된 파일명으로 데이터를 안전하게 저장하는 공통 함수

    """

    # 1. 상위 폴더(Net_Guardian/)로 나가서 data/ 폴더를 가리키게 함
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
    os.makedirs(data_dir, exist_ok=True)
    
    file_path = os.path.join(data_dir, filename)

    

    # 2. 파일이 이미 존재하는지 체크 (헤더 생성을 위함)

    file_exists = os.path.isfile(file_path)

    

    # 3. 현재 기록 시간 타임스탬프 생성

    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')

    

    # 4. CSV 파일 이어쓰기(Append mode) 열기

    with open(file_path, mode='a', newline='', encoding='utf-8') as f:

        writer = csv.writer(f)

        

        # 파일이 처음 생성되는 상황이라면 상단 헤더 row 추가

        if not file_exists:

            writer.writerow(['time', 'rtt', 'loss', 'status'])

            

        # 데이터 한 줄 누적 저장

        writer.writerow([timestamp, rtt, loss, status])





# =========================================================================

# 외부(client.py)에서 상황별로 호출할 공통 인터페이스 함수들

# =========================================================================



def save_normal_data(rtt, loss, status):

    """정상 시나리오 데이터 저장 함수"""

    _save_to_csv("raw_normal.csv", rtt, loss, status)

    print(f"[데이터 기록] 정상 시나리오 기록 완료 -> data/raw_normal.csv")



def save_delay_data(rtt, loss, status):

    """지연 장애 시나리오 데이터 저장 함수"""

    _save_to_csv("raw_delay.csv", rtt, loss, status)

    print(f"[데이터 기록] 지연 장애 시나리오 기록 완료 -> data/raw_delay.csv")



def save_loss_data(rtt, loss, status):

    """패킷 손실 시나리오 데이터 저장 함수"""

    _save_to_csv("raw_loss.csv", rtt, loss, status)

    print(f"[데이터 기록] 패킷 손실 시나리오 기록 완료 -> data/raw_loss.csv")



def save_delay_loss_data(rtt, loss, status):

    """지연 및 손실 복합 장애 시나리오 데이터 저장 함수"""

    _save_to_csv("raw_delay_loss.csv", rtt, loss, status)

    print(f"[데이터 기록] 복합 장애 시나리오 기록 완료 -> data/raw_delay_loss.csv")
