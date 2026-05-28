import time
import asyncio
import sys
import os

# 상위 폴더 경로 설정
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from save_data import (
    save_normal_data,
    save_delay_data,
    save_loss_data,
    save_delay_loss_data
)
from pymodbus.client import AsyncModbusTcpClient

def select_scenario():
    print("=" * 50)
    print(" [산업 네트워크 장애 데이터 수집기] ")
    print("=" * 50)
    print(" 1. 정상 시나리오")
    print(" 2. 지연 장애 시나리오")
    print(" 3. 패킷 손실 시나리오")
    print(" 4. 복합 장애(지연+손실) 시나리오")
    print("=" * 50)
    
    while True:
        choice = input("시나리오 번호를 입력하세요 (1~4): ").strip()
        if choice in ['1', '2', '3', '4']:
            return int(choice)
        print("잘못된 입력입니다. 1에서 4 사이의 숫자를 입력해 주세요.")

async def run_client():
    scenario_mode = select_scenario()
    
    # 비동기 클라이언트 설정
    client = AsyncModbusTcpClient('127.0.0.1', port=5020, timeout=1)
    
    if not await client.connect():
        print("❌ 서버에 접속할 수 없습니다.")
        return

    print("\n[알림] 통신 시작 및 수집 중... (종료: Ctrl + C)")

    try:
        while True:
            start_time = time.time()
            
            # 비동기 쓰기 및 읽기
            write_result = await client.write_register(0, 77)
            read_result = await client.read_holding_registers(0, 1)
            
            end_time = time.time()
            rtt = (end_time - start_time) * 1000
            
            # 수집 로직: 성공/실패 여부에 따라 라벨링
            if not read_result.isError():
                # 통신 성공 시
                status_label = "normal"
                loss_val = 0
                print(f"성공: RTT: {rtt:.2f}ms | 상태: normal")
            else:
                # 통신 실패 시 (장애 발생)
                # 시나리오에 따라 장애 상태를 명확히 기록
                if scenario_mode == 1: status_label = "normal"
                elif scenario_mode == 2: status_label = "delay"
                elif scenario_mode == 3: status_label = "loss"
                elif scenario_mode == 4: status_label = "delay_loss"
                loss_val = 1
                print(f"실패: RTT: {rtt:.2f}ms | 상태: {status_label}")

            # 파일 저장
            if scenario_mode == 1: save_normal_data(rtt, loss_val, status_label)
            elif scenario_mode == 2: save_delay_data(rtt, loss_val, status_label)
            elif scenario_mode == 3: save_loss_data(rtt, loss_val, status_label)
            elif scenario_mode == 4: save_delay_loss_data(rtt, loss_val, status_label)

            await asyncio.sleep(0.1) # 수집 속도 조절 (초당 약 10회)

    except asyncio.CancelledError:
        print("\n프로그램이 중단되었습니다.")
    finally:
        client.close()
        print("서버 연결이 종료되었습니다.")

if __name__ == "__main__":
    try:
        asyncio.run(run_client())
    except KeyboardInterrupt:
        pass
