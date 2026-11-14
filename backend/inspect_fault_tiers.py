"""
지연(B)/유실(C)/복합(D) 각 유형 안에서 심각도 단계를 몇 개로 나눌 수 있는지,
실제 데이터(raw_dataset_20260904)의 분포로 확인하는 스크립트.

eval_tcp_features.py의 tcp_features(karn 모드)를 그대로 재사용해서
RTT(지연 판단용)와 rto_exceed_w(유실 판단용, 최근 15개 응답 중 RTO 초과 비율)를 계산하고,
클래스별로 사분위수(25/50/75/95%)를 뽑아본다.

복합(D)은 논문에서 이미 확인된 문제(샘플의 69.6%가 "첫 5초 정상 구간"에서 수집됨)를 반영해,
각 세션 시작 후 5초를 제외한 뒤에도 분포를 따로 뽑아 비교한다.
"""
import os
import glob
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_DIR = os.path.join(BASE_DIR, "raw_dataset_20260904")
RTO_MIN_MS = 200.0


def tcp_features_karn(t):
    srtt = rttvar = None
    prev_exceed = False
    S, V, E = [], [], []
    for rtt, loss in zip(t["rtt"].to_numpy(), t["loss_flag"].to_numpy()):
        rto = RTO_MIN_MS if srtt is None else max(RTO_MIN_MS, srtt + 4 * rttvar)
        exceed = bool(loss == 0 and srtt is not None and rtt > rto)
        update = loss == 0
        if exceed and not prev_exceed:
            update = False  # Karn: 갑자기 튄 응답은 재전송 추정 -> SRTT 갱신에서 제외
        if update:
            if srtt is None:
                srtt, rttvar = rtt, rtt / 2
            else:
                rttvar = 0.75 * rttvar + 0.25 * abs(srtt - rtt)
                srtt = 0.875 * srtt + 0.125 * rtt
        prev_exceed = exceed
        S.append(srtt if srtt is not None else 0.0)
        V.append(rttvar if rttvar is not None else 0.0)
        E.append(int(exceed))
    t["srtt"], t["rttvar"], t["rto_exceed"] = S, V, E
    t["rto_exceed_w"] = t["rto_exceed"].rolling(15, min_periods=1).mean()
    return t


def load(key):
    f = os.path.join(TRAIN_DIR, f"scenario_{key}_raw.csv")
    t = pd.read_csv(f, header=None, names=["timestamp", "rtt", "loss_flag", "status"])
    t["timestamp"] = pd.to_datetime(t["timestamp"])
    t = t.sort_values("timestamp", kind="stable").reset_index(drop=True)
    return tcp_features_karn(t)


def pct(series, qs=(0.25, 0.5, 0.75, 0.95)):
    return {f"p{int(q*100)}": round(series.quantile(q), 4) for q in qs}


print("=" * 70)
print("1) 지연(B) - RTT 분포 (ms)")
print("=" * 70)
b = load("B")
print(pct(b["rtt"]))
print(f"샘플 수: {len(b)}")

print()
print("=" * 70)
print("2) 유실(C) - rto_exceed_w 분포 (최근 15개 중 RTO 초과 비율)")
print("=" * 70)
c = load("C")
print(pct(c["rto_exceed_w"]))
print(f"샘플 수: {len(c)}, 0보다 큰 샘플 비율: {round((c['rto_exceed_w'] > 0).mean(), 4)}")

print()
print("=" * 70)
print("3) 복합(D) - 첫 5초 포함 vs 제외 (analyze_followup.py와 동일한 세그먼트 기준: 20초 이상 공백=새 구간)")
print("=" * 70)
d = load("D")
d["seg"] = (d["timestamp"].diff().dt.total_seconds() > 20).cumsum()
d["sec_in_seg"] = (d["timestamp"] - d.groupby("seg")["timestamp"].transform("min")).dt.total_seconds()
print(f"세그먼트(실험 구간) 개수: {d['seg'].nunique()}")
d_all = d
d_after5 = d[d["sec_in_seg"] >= 5]
print(f"전체 샘플 수: {len(d_all)}, 첫 5초 제외 후: {len(d_after5)} "
      f"(첫 5초 비율 {round(1 - len(d_after5)/len(d_all), 4)})")
print("RTT 분포 - 전체:", pct(d_all["rtt"]))
print("RTT 분포 - 첫 5초 제외:", pct(d_after5["rtt"]))
print("rto_exceed_w 분포 - 전체:", pct(d_all["rto_exceed_w"]))
print("rto_exceed_w 분포 - 첫 5초 제외:", pct(d_after5["rto_exceed_w"]))
