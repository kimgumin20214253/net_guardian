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

def get_auto_label():
    """
    [자동화 핵심] 셸 스크립트가 실시간으로 변경하는 .current_label 파일을 읽어와
    수동 입력 없이 정상(0) 또는 장애(1) 상태를 자동으로 동기화합니다.
    """
    try:
        with open('.current_label', 'r') as f:
            label = int(f.read().strip())
        return label
    except Exception:
        # 파일이 아직 생성되지 않았거나 읽기 오류 발생 시 기본값은 정상(0) 처리
        return 0

async def run_client():
    # ❌ 기존의 수동 번호 선택 창(select_scenario)을 완전히 제거하여 무한 대기 오류를 차단합니다.
    
    # 비동기 클라이언트 설정 (구민이의 5020 포트 완벽 반영)
    client = AsyncModbusTcpClient('127.0.0.1', port=5020, timeout=1)
    
    if not await client.connect():
        print("❌ 서버에 접속할 수 없습니다.")
        return

    print("\n[알림] master_collector.sh 실시간 동기화 완료. 자동 수집 중... (종료: Ctrl + C)")

    try:
        while True:
            start_time = time.time()
            
            # 비동기 쓰기 및 읽기
            write_result, read_result = await asyncio.gather(
                client.write_register(0, 77),
                client.read_holding_registers(0, 1),
                return_exceptions=True
            )
            
            end_time = time.time()
            rtt = (end_time - start_time) * 1000
            
            # 1. 성공 여부 판단 (패킷 유실 체크)
            is_success = not isinstance(read_result, Exception) and not read_result.isError()
            loss_val = 0 if is_success else 1
            
            # 🔥 [자동화] 4번 창 셸 스크립트가 마킹해 주는 현재 정답 라벨을 실시간으로 가져옴
            status_label = get_auto_label()
            
            print(f"RTT: {rtt:.2f}ms | Loss: {loss_val} | 타겟 라벨(자동): {status_label}")

            # 🔥 [자동화] 셸 스크립트의 실시간 라벨(status_label)과 실제 측정된 Loss/RTT를 결합하여 
            # 수동 입력 없이 파이썬이 알아서 네 가지 창고 함수로 실시간 분기 저장합니다.
# 🔥 [정밀 교정] 실제 물리적 측정값(Loss, RTT)을 기반으로 창고를 완벽하게 분기합니다.
            if loss_val == 1 and rtt > 450:
                # 1. 유실과 지연(450ms 초과)이 동시에 발생한 경우 -> 복합 장애
                save_delay_loss_data(rtt, loss_val, status_label)
                
            elif loss_val == 1:
                # 2. RTT는 정상 범위이거나 타임아웃 안쪽인데 유실만 발생한 경우 -> 패킷 손실
                save_loss_data(rtt, loss_val, status_label)
                
            elif rtt > 150: 
                # 3. 유실은 없으나 RTT가 국제 표준 정상 범주(150ms)를 초과하여 치솟은 경우 -> 지연 장애
                save_delay_data(rtt, loss_val, status_label)
                
            else:
                # 4. 유실도 없고, RTT도 150ms 미만으로 지극히 안정적인 경우 -> 정상 공정 데이터
                save_normal_data(rtt, loss_val, status_label)

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
