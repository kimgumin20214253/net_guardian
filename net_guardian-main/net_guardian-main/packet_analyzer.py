# packet_analyzer.py  (네 레포 루트에 저장)
import csv, time, asyncio
import numpy as np
from pymodbus.client import AsyncModbusTcpClient

# 팀장 규격: 입력 피처 5개 + 정답 라벨 1개 (순서 고정)
FEATURES = ['avg_rtt', 'max_rtt', 'std_rtt', 'moving_avg', 'rtt_change_rate']
LABEL = ['is_anomaly']
CSV_HEADER = FEATURES + LABEL
CSV_FILE = 'net_guardian_robust_dataset.csv'

with open(CSV_FILE, 'w', newline='') as f:
    csv.DictWriter(f, fieldnames=CSV_HEADER).writeheader()

def get_current_label():
    try:
        with open('.current_label') as f:
            return int(f.read().strip())
    except Exception:
        return 0

async def main():
    client = AsyncModbusTcpClient('127.0.0.1', port=5020, timeout=1)
    await client.connect()
    print("[+] Modbus 감시 + CSV 적립 엔진 시작 (종료: Ctrl+C)")

    rtt_history = []
    try:
        while True:
            start = time.time()
            w, r = await asyncio.gather(
                client.write_register(0, 77),
                client.read_holding_registers(0, 1),
                return_exceptions=True
            )
            rtt = (time.time() - start) * 1000  # ms

            # 통신 실패(유실/단절) 시: 값을 지어내지 말고 timeout 상한(1000ms)을 실측 한계로 기록
            failed = isinstance(r, Exception) or (hasattr(r, "isError") and r.isError())
            if failed:
                rtt = 1000.0

            rtt_history.append(rtt)
            if len(rtt_history) > 10:
                rtt_history.pop(0)

            avg_rtt = np.mean(rtt_history)
            max_rtt = np.max(rtt_history)
            std_rtt = np.std(rtt_history) if len(rtt_history) > 1 else 0.0
            moving_avg = np.mean(rtt_history[-10:])

            if len(rtt_history) > 1 and rtt_history[-2] > 0:
                rtt_change_rate = abs(rtt_history[-1] - rtt_history[-2]) / rtt_history[-2] * 100
            else:
                rtt_change_rate = 0.0

            row = {
                'avg_rtt': round(avg_rtt, 2),
                'max_rtt': round(max_rtt, 2),
                'std_rtt': round(std_rtt, 2),
                'moving_avg': round(moving_avg, 2),
                'rtt_change_rate': round(rtt_change_rate, 2),
                'is_anomaly': get_current_label(),
            }
            with open(CSV_FILE, 'a', newline='') as f:
                csv.DictWriter(f, fieldnames=CSV_HEADER).writerow(row)

            await asyncio.sleep(0.1)  # 0.1초 폴링
    except KeyboardInterrupt:
        print("\n[-] 엔진 종료.")
    finally:
        client.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
