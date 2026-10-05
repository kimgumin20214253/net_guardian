# raw_dataset_20261004 — 재현성·일반화·TCP 재전송 검증 데이터

2026-10-04 Ubuntu VM(김구민)에서 수집. 학습 데이터(`raw_dataset_20260904/`)와 같은 수집기 조건:
응답 타임아웃 1초, 유실 시 RTT = 표식값 5000ms, 응답 후 0.1초 대기, 서버 쪽 장애 재현 OFF(`NG_SERVER_FAULTS=0`),
루프백(lo)에 tc netem 주입. 컬럼: `timestamp, rtt, loss_flag, jitter, label` (label: A=0, B=1, C=2, D=3).

| 파일 | 수집 시간 | 행 수 | 장애 주입 |
|---|---|---|---|
| eval_same_params.csv | 17:58~18:30 (약 32분) | 12,233 | `network/master_collector.sh` (학습과 같은 설정) |
| eval_generalization.csv | 18:30~19:02 (약 32분) | 11,346 | `network/generalization_collector.sh` (B 60ms/200ms, C GE loss 2%/10% 교대, D 강도 변경) |
| retrans_A.csv | 19:11:22부터 60초 | 574 | 정상(A) 조건만 고정: `delay 1ms 0.3ms` |
| retrans_C.csv | 19:13:44부터 60초 | 415 | 유실(C) 조건만 고정: `delay 2ms loss gemodel 5% 50% 90% 0%` |

## nstat TCP 재전송 계수 (retrans_A/C와 같은 60초 구간)

`nstat -n; ... timeout -s INT 60 python packet_analyzer.py; nstat -z TcpRetransSegs TcpOutSegs` 결과.

| 조건 | TcpOutSegs | TcpRetransSegs | 재전송 비율 | CSV 유실(타임아웃) | CSV 150ms 초과 지연 응답 |
|---|---|---|---|---|---|
| 정상(A) | 4,058 | 5 | 0.12% | 0건 | 0건 |
| 유실(C) | 2,716 | 154 | 5.67% | 2건 | 37건 |

- 캡처 화면 두 장의 A/C 순서는 송신 세그먼트 수(측정 건수 574 vs 415와 같은 비율)로 판단함 — 김구민 확인 필요.
- nstat은 호스트 전체 TCP를 세므로 A의 5건은 배경 통신으로 본다.
