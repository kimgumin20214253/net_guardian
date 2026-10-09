# packet_analyzer.py  (네 레포 루트에 저장)
import csv, time, asyncio, os
from pymodbus.client import AsyncModbusTcpClient

# 팀장 규격: 4대 시나리오(Normal/Delay/Loss/Combined) 분류용 입력 피처 3개 + 정답 라벨 1개
FEATURES = ['rtt', 'loss_flag', 'jitter']
LABEL = ['label']
CSV_HEADER = ['timestamp'] + FEATURES + LABEL

# PA_LOG_RETRANS=1 이면 요청마다 운영체제가 센 TCP 재전송/송신 세그먼트 증가량을 함께 기록한다 (Linux 전용).
# RTO 초과로 추정한 재전송(eval_tcp_features.py)이 실제 재전송과 맞는지 요청 단위로 대조하기 위한 정답 값.
# 끄면(기본값) 기존 컬럼 그대로라 대시보드/API가 읽는 파일 형식은 바뀌지 않는다.
LOG_RETRANS = os.environ.get('PA_LOG_RETRANS', '0') == '1'
if LOG_RETRANS:
    CSV_HEADER = CSV_HEADER + ['retrans_segs', 'out_segs']

# data/ 버전의 구(5피처) net_guardian_robust_dataset.csv와 스키마가 다르므로 별도 파일로 분리
# PA_OUTPUT_FILE 환경변수로 출력 파일명을 바꿀 수 있음 (기본값 유지 시 팀원/기존 실행 방식과 100% 동일)
CSV_FILE = os.path.join('data', os.environ.get('PA_OUTPUT_FILE', 'net_guardian_scenario_dataset.csv'))
os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)

# CSV 헤더 작성 (파일이 없을 때만 - 기존 수집 데이터 보존)
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='') as f:
        csv.DictWriter(f, fieldnames=CSV_HEADER).writeheader()
else:
    with open(CSV_FILE, newline='') as f:
        existing = next(csv.reader(f), [])
    if existing != CSV_HEADER:
        raise SystemExit(f"[!] {CSV_FILE}의 컬럼({existing})이 지금 설정({CSV_HEADER})과 다릅니다. "
                         f"PA_OUTPUT_FILE로 새 파일 이름을 지정하세요.")


def read_tcp_counters():
    """호스트 전체 TCP 카운터(RetransSegs, OutSegs). /proc/net/snmp가 없는 OS(Windows 등)에서는 None."""
    try:
        with open('/proc/net/snmp') as f:
            tcp = [line.split() for line in f if line.startswith('Tcp:')]
        stats = dict(zip(tcp[0][1:], tcp[1][1:]))
        return int(stats['RetransSegs']), int(stats['OutSegs'])
    except (OSError, IndexError, KeyError, ValueError):
        return None

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
    if LOG_RETRANS:
        state = "기록함" if read_tcp_counters() is not None else "이 OS에서는 읽을 수 없어 빈칸으로 기록"
        print(f"[+] TCP 재전송 카운터: {state}")

    prev_rtt = None
    try:
        while True:
            before = read_tcp_counters() if LOG_RETRANS else None
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
            if LOG_RETRANS:
                # 이 요청을 보내고 응답(또는 타임아웃)까지 사이에 호스트 전체에서 늘어난 재전송/송신 세그먼트 수
                after = read_tcp_counters()
                ok = before is not None and after is not None
                row['retrans_segs'] = after[0] - before[0] if ok else ''
                row['out_segs'] = after[1] - before[1] if ok else ''
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
