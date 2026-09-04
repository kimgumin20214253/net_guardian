# packet_analyzer.py  (네 레포 루트에 저장)
import csv, time, asyncio, os
from pymodbus.client import AsyncModbusTcpClient

# 팀장 규격: 4대 시나리오(Normal/Delay/Loss/Combined) 분류용 입력 피처 3개 + 정답 라벨 1개
FEATURES = ['rtt', 'loss_flag', 'jitter']
LABEL = ['label']
CSV_HEADER = ['timestamp'] + FEATURES + LABEL

# data/ 버전의 구(5피처) net_guardian_robust_dataset.csv와 스키마가 다르므로 별도 파일로 분리
CSV_FILE = os.path.join('data', 'net_guardian_scenario_dataset.csv')
os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)

# CSV 헤더 작성 (파일이 없을 때만 - 기존 수집 데이터 보존)
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='') as f:
        csv.DictWriter(f, fieldnames=CSV_HEADER).writeheader()

# train_and_benchmark.py의 scenario_map(A=0, B=1, C=2, D=3)과 동일 매핑
SCENARIO_LABEL_MAP = {'A': 0, 'B': 1, 'C': 2, 'D': 3}

def get_current_label():
    try:
        with open('.current_label') as f:
            raw = f.read().strip().upper()
        if raw in SCENARIO_LABEL_MAP:
            return SCENARIO_LABEL_MAP[raw]
        return int(raw)
    except Exception:
        return 0

async def main():
    client = AsyncModbusTcpClient('127.0.0.1', port=5020, timeout=1)
    await client.connect()
    print("[+] Modbus 감시 + CSV 적립 엔진 시작 (종료: Ctrl+C)")

    prev_rtt = None
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
            loss_flag = 1 if failed else 0

            # 직전 샘플 대비 RTT 변동폭 = 순시 지터 (지어내지 않고 실측값끼리 차이만 계산)
            jitter = 0.0 if prev_rtt is None else abs(rtt - prev_rtt)
            prev_rtt = rtt

            row = {
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                'rtt': round(rtt, 2),
                'loss_flag': loss_flag,
                'jitter': round(jitter, 2),
                'label': get_current_label(),
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
