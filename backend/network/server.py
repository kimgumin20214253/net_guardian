import sys
import os
import random
import time

# 1. 경로 설정 (필요 시)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 2. pymodbus 3.1.0 버전 전용 import 구조
from pymodbus.server import StartAsyncTcpServer
import asyncio
from pymodbus.device import ModbusDeviceIdentification
from pymodbus.datastore import ModbusSequentialDataBlock
from pymodbus.datastore import ModbusSlaveContext, ModbusServerContext

# 클라이언트(packet_analyzer.py)의 Modbus 타임아웃(1초)보다 길게 묶어두면
# 클라이언트 쪽에서 진짜로 타임아웃이 발생해 "유실"로 정직하게 기록됨
CLIENT_TIMEOUT_SEC = 1.0


def get_current_scenario():
    """tc netem이 없는 Windows에서도 같은 원리(실제로 조건을 나쁘게 만들고 실측)로
    시나리오를 재현하기 위해 .current_label(A/B/C/D)을 읽어 응답 지연/지연 유실을 결정한다."""
    try:
        with open('.current_label') as f:
            return f.read().strip().upper()
    except Exception:
        return 'A'


class ScenarioAwareDataBlock(ModbusSequentialDataBlock):
    """읽기/쓰기 응답 직전에 현재 시나리오에 맞는 실제 지연을 발생시키는 데이터 블록.
    가짜 수치를 지어내는 게 아니라 서버 응답 자체를 실제로 늦추므로, 클라이언트가
    측정하는 RTT/타임아웃은 전부 진짜로 걸린 시간이다."""

    def _apply_scenario_delay(self):
        scenario = get_current_scenario()
        if scenario == 'B':          # 지연 장애: 클라이언트 타임아웃 이내로 실제 지연
            time.sleep(random.uniform(0.15, 0.35))
        elif scenario == 'C':        # 유실 장애: 타임아웃보다 길게 묶어 실제 유실 유발
            time.sleep(CLIENT_TIMEOUT_SEC + 0.5)
        elif scenario == 'D':        # 복합 장애: 지연/유실을 섞어서 재현
            if random.random() < 0.5:
                time.sleep(CLIENT_TIMEOUT_SEC + 0.5)
            else:
                time.sleep(random.uniform(0.2, 0.5))
        # 'A'(정상) 또는 그 외 값: 지연 없음

    def getValues(self, address, count=1):
        self._apply_scenario_delay()
        return super().getValues(address, count)

    def setValues(self, address, values):
        self._apply_scenario_delay()
        return super().setValues(address, values)


def run_modbus_server():
    print("==========================================")
    print("[산업 인프라] Modbus TCP 서버 가동 시작")
    print("==========================================")

    # Holding Register(hr) 100개 생성 - 시나리오 인식형 데이터 블록 사용
    store = ModbusSlaveContext(
        di=ModbusSequentialDataBlock(0, [0]*100),
        co=ModbusSequentialDataBlock(0, [0]*100),
        hr=ScenarioAwareDataBlock(0, [0]*100),
        ir=ModbusSequentialDataBlock(0, [0]*100)
    )
    context = ModbusServerContext(slaves=store, single=True)
    
    identity = ModbusDeviceIdentification()
    identity.VendorName = 'Net_Guardian_Team'
    identity.ProductCode = 'NG-Server-v1.0'
    identity.ProductName = 'Industrial Security Modbus Server'
    
    print("서버가 포트 [5020]번에서 대기 중입니다...")
    print("종료: Ctrl + C")

    try:
        # 비동기 방식으로 서버 실행
        asyncio.run(StartAsyncTcpServer(context=context, identity=identity, address=("127.0.0.1", 5020)))
    except Exception as e:
        print(f"[오류] 서버 기동 오류: {e}")

if __name__ == "__main__":
    run_modbus_server()
