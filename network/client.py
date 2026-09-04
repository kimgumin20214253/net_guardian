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

def get_current_scenario():
    """
    셸 스크립트가 기록한 .current_label 파일을 경로 문제 없이 안전하게 탐색하여 읽어옵니다.
    """
    # 실행 위치에 따라 .current_label을 찾지 못해 'A'로 고정되던 문제를 해결하기 위해 여러 경로를 동시에 탐색합니다.
    paths_to_check = [
        '.current_label',
        os.path.join(os.path.dirname(__file__), '.current_label'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.current_label')
    ]
    
    for path in paths_to_check:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    scenario = f.read().strip().upper()
                    if scenario in ['A', 'B', 'C', 'D']:
                        return scenario
            except Exception:
                continue
    return 'A'

async def run_client():
    client = AsyncModbusTcpClient('127.0.0.1', port=5020, timeout=1)
    
    if not await client.connect():
        print("❌ 서버에 접속할 수 없습니다.")
        return

    print("\n[알림] master_collector.sh 실시간 동기화 완료. 자동 수집 중... (종료: Ctrl + C)")

    try:
        while True:
            start_time = time.time()
            
            write_result, read_result = await asyncio.gather(
                client.write_register(0, 77),
                client.read_holding_registers(0, 1),
                return_exceptions=True
            )
            
            end_time = time.time()
            
            is_success = not isinstance(read_result, Exception) and not read_result.isError()
            loss_val = 0 if is_success else 1
            
            if is_success:
                rtt = (end_time - start_time) * 1000
                rtt_str = f"{rtt:.2f}"
            else:
                rtt_str = "" 
            
            # 현재 시나리오 기호('A', 'B', 'C', 'D') 가져오기
            scenario = get_current_scenario()
            
            status_label = 0 if scenario == 'A' else 1
            
            print(f"시나리오: [{scenario}] | RTT: {rtt_str if rtt_str else 'TIMEOUT'}ms | Loss: {loss_val} | 라벨: {status_label}")

            # 시나리오별 1:1 파일 매칭 저장
            if scenario == 'A':
                save_normal_data(rtt_str, loss_val, status_label)      # scenario_A_raw.csv
            elif scenario == 'B':
                save_delay_data(rtt_str, loss_val, status_label)       # scenario_B_raw.csv
            elif scenario == 'C':
                save_loss_data(rtt_str, loss_val, status_label)        # scenario_C_raw.csv
            elif scenario == 'D':
                save_delay_loss_data(rtt_str, loss_val, status_label)  # scenario_D_raw.csv
            else:
                save_normal_data(rtt_str, loss_val, status_label)

            await asyncio.sleep(0.1) 

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
