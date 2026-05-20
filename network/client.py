import time
import asyncio
import sys
import os

# 현재 파일이 server 폴더에 있고, collector가 상위 폴더 내에 있으므로
# 상위 폴더를 sys.path에 추가하여 collector 모듈을 찾을 수 있게 합니다.
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
    
    # 비동기 클라이언트 설정 (timeout 1초)
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
            
            if not read_result.isError():
                val = read_result.registers[0]
                print(f"성공: 값 {val} | RTT: {rtt:.2f}ms | 상태: normal")
                
                if scenario_mode == 1: save_normal_data(rtt, 0, "normal")
                elif scenario_mode == 2: save_delay_data(rtt, 0, "normal")
                elif scenario_mode == 3: save_loss_data(rtt, 0, "normal")
                elif scenario_mode == 4: save_delay_loss_data(rtt, 0, "normal")
            else:
                print(f"실패: 타임아웃/에러 | RTT: {rtt:.2f}ms | 상태: error")
                
                if scenario_mode == 1: save_normal_data(rtt, 1, "abnormal")
                elif scenario_mode == 2: save_delay_data(rtt, 1, "delay")
                elif scenario_mode == 3: save_loss_data(rtt, 1, "loss")
                elif scenario_mode == 4: save_delay_loss_data(rtt, 1, "delay_loss")

            await asyncio.sleep(1)

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
