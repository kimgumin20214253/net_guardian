# raw_dataset_20261009 — 요청 단위 TCP 재전송 검증 데이터

2026-10-09 Ubuntu VM(김구민)에서 수집. 18:43:28~19:13:41(약 30분), 10,988건.

수집 조건은 `raw_dataset_20261004/`와 같다: 응답 타임아웃 1초, 유실 시 RTT = 5000ms, 응답 후 0.1초 대기,
서버 쪽 장애 재현 OFF(`NG_SERVER_FAULTS=0`), 루프백(lo)에 `network/master_collector.sh`(학습과 같은 설정)로 장애 주입.

```bash
NG_SERVER_FAULTS=0 python network/server.py
PA_LOG_RETRANS=1 PA_OUTPUT_FILE=verify_retrans.csv python packet_analyzer.py
bash network/master_collector.sh
```

컬럼: `timestamp, rtt, loss_flag, jitter, label, retrans_segs, out_segs` (label: A=0, B=1, C=2, D=3)

- `retrans_segs`: 요청 직전~응답 직후 사이에 호스트 전체 TCP 재전송 세그먼트 수(`/proc/net/snmp`의 RetransSegs)가 늘어난 양
- `out_segs`: 같은 구간에 늘어난 송신 세그먼트 수(OutSegs)
- 호스트 전체를 세므로 다른 통신이 섞이면 잡음이 된다. 수집 중에는 다른 네트워크 작업을 하지 않았다.

분석: `python eval_verify_retrans.py` → `results_tcp_features/verify_*.csv`
