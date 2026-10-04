# packet_analyzer.py  (네 레포 루트에 저장)
import csv, time, asyncio, os
from pymodbus.client import AsyncModbusTcpClient

# 팀장 규격: 4대 시나리오(Normal/Delay/Loss/Combined) 분류용 입력 피처 3개 + 정답 라벨 1개
FEATURES = ['rtt', 'loss_flag', 'jitter']
LABEL = ['label']
CSV_HEADER = ['timestamp'] + FEATURES + LABEL

# data/ 버전의 구(5피처) net_guardian_robust_dataset.csv와 스키마가 다르므로 별도 파일로 분리
# PA_OUTPUT_FILE 환경변수로 출력 파일명을 바꿀 수 있음 (기본값 유지 시 팀원/기존 실행 방식과 100% 동일)
CSV_FILE = os.path.join('data', os.environ.get('PA_OUTPUT_FILE', 'net_guardian_scenario_dataset.csv'))
os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)

# CSV 헤더 작성 (파일이 없을 때만 - 기존 수집 데이터 보존)
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='') as f:
        csv.DictWriter(f, fieldnames=CSV_HEADER).writeheader()

# 학습 데이터(raw_dataset_20260904) 수집 조건과 동일하게 맞춘 값 (당시 network/client.py + save_data.py):
# - 응답 타임아웃 1초 -> 1초 안에 응답이 없으면 유실(loss_flag=1)
# - 유실 시 RTT 칸에는 측정값이 없으므로 5000ms 표식값을 기록 (모델이 이 값으로 학습됨)
MODBUS_TIMEOUT_SEC = 1.0
LOSS_RTT_SENTINEL_MS = 5000.0

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
    # PA_MODBUS_HOST 환경변수로 접속 대상을 바꿀 수 있음 (기본값 127.0.0.1 유지 시 기존 동작과 100% 동일)
    modbus_host = os.environ.get('PA_MODBUS_HOST', '127.0.0.1')
    client = AsyncModbusTcpClient(modbus_host, port=5020, timeout=MODBUS_TIMEOUT_SEC)
    await client.connect()
    print(f"[+] Modbus 감시 + CSV 적립 엔진 시작 (대상: {modbus_host}:5020, 출력: {CSV_FILE}, 종료: Ctrl+C)")

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

            # 통신 실패(유실/단절) 시: RTT 측정값이 없으므로 학습 데이터와 같은 표식값(5000ms)을 기록
            failed = isinstance(r, Exception) or (hasattr(r, "isError") and r.isError())
            if failed:
                rtt = LOSS_RTT_SENTINEL_MS
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
