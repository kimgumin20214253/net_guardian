import sys
import os

# 1. 경로 설정 (필요 시)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 2. pymodbus 3.1.0 버전 전용 import 구조
from pymodbus.server import StartAsyncTcpServer
import asyncio
from pymodbus.device import ModbusDeviceIdentification
from pymodbus.datastore import ModbusSequentialDataBlock
from pymodbus.datastore import ModbusSlaveContext, ModbusServerContext

def run_modbus_server():
    print("==========================================")
    print("🤖 🛠️ [산업 인프라] Modbus TCP 서버 가동 시작")
    print("==========================================")
    
    # Holding Register(hr) 100개 생성
    store = ModbusSlaveContext(
        di=ModbusSequentialDataBlock(0, [0]*100),
        co=ModbusSequentialDataBlock(0, [0]*100),
        hr=ModbusSequentialDataBlock(0, [0]*100), 
        ir=ModbusSequentialDataBlock(0, [0]*100)
    )
    context = ModbusServerContext(slaves=store, single=True)
    
    identity = ModbusDeviceIdentification()
    identity.VendorName = 'Net_Guardian_Team'
    identity.ProductCode = 'NG-Server-v1.0'
    identity.ProductName = 'Industrial Security Modbus Server'
    
    print("📡 서버가 포트 [5020]번에서 대기 중입니다...")
    print("⚠️ 종료: Ctrl + C")
    
    try:
        # 비동기 방식으로 서버 실행
        asyncio.run(StartAsyncTcpServer(context=context, identity=identity, address=("127.0.0.1", 5020)))
    except Exception as e:
        print(f"❌ 서버 기동 오류: {e}")

if __name__ == "__main__":
    run_modbus_server()
