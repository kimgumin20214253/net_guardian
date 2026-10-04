#!/bin/bash
# 일반화 검증용 tc netem 장애 주입 스크립트 (논문 심사 대응: "학습 때 쓴 netem 설정값을 외운 것 아닌가?")
# master_collector.sh와 시나리오 순서/라벨은 같고, 장애 파라미터만 학습 데이터 수집 때와 다르게 바꿔서 주입한다.
# 이렇게 모은 데이터로 기존 모델을 평가(eval_live.py)하면, 처음 보는 장애 강도에서도 유형을 맞히는지 확인 가능.
#
# 사용법 (backend/ 안에서, 터미널 3개):
#   NG_SERVER_FAULTS=0 python network/server.py
#   PA_OUTPUT_FILE=eval_generalization.csv python packet_analyzer.py
#   bash network/generalization_collector.sh        # 최소 5바퀴(약 15분) 이상 돌린 뒤 Ctrl+C
INTERFACE="lo" # 본인 리눅스 네트워크 카드 이름으로 수정 필수!

sudo tc qdisc del dev $INTERFACE root 2>/dev/null
echo "[+] 일반화 검증용 tc 장애 자동 주입 루프 시작 (종료: Ctrl + C)"

set_scenario() {
    echo "$1" > .current_label
}

normal() {
    echo "[*] 시나리오 A: 정상 (라벨 0)"
    set_scenario "A"
    sudo tc qdisc add dev $INTERFACE root netem delay 1ms 0.3ms distribution normal
    sleep 30
    sudo tc qdisc del dev $INTERFACE root 2>/dev/null
}

CYCLE=0
while true
do
    # 짝수/홀수 바퀴마다 학습 때(120ms±40ms, gemodel 5%)와 다른 강도를 번갈아 주입
    if [ $((CYCLE % 2)) -eq 0 ]; then
        B_DELAY="60ms 20ms"; C_LOSS="loss gemodel 2% 50% 90% 0%"
    else
        B_DELAY="200ms 60ms"; C_LOSS="loss gemodel 10% 50% 90% 0%"
    fi

    normal

    echo "[*] 시나리오 B: 지연 장애 (라벨 1) - delay $B_DELAY"
    set_scenario "B"
    sudo tc qdisc add dev $INTERFACE root netem delay $B_DELAY distribution normal
    sleep 30
    sudo tc qdisc del dev $INTERFACE root 2>/dev/null

    normal

    echo "[*] 시나리오 C: 유실 장애 (라벨 2) - $C_LOSS"
    set_scenario "C"
    sudo tc qdisc add dev $INTERFACE root netem delay 2ms $C_LOSS
    sleep 30
    sudo tc qdisc del dev $INTERFACE root 2>/dev/null

    normal

    echo "[*] 시나리오 D: 복합 장애 (라벨 3) - 학습 때와 다른 강도의 4단계"
    set_scenario "D"
    sudo tc qdisc replace dev $INTERFACE root netem delay 1ms 0.3ms distribution normal
    sleep 5
    sudo tc qdisc del dev $INTERFACE root 2>/dev/null

    sudo tc qdisc replace dev $INTERFACE root netem delay 600ms 150ms loss 30%
    sleep 3
    sudo tc qdisc del dev $INTERFACE root 2>/dev/null

    sudo tc qdisc replace dev $INTERFACE root netem loss 100%
    sleep 5
    sudo tc qdisc del dev $INTERFACE root 2>/dev/null

    sudo tc qdisc replace dev $INTERFACE root netem delay 400ms 100ms loss 10%
    sleep 5
    sudo tc qdisc del dev $INTERFACE root 2>/dev/null

    CYCLE=$((CYCLE + 1))
    echo "-------------------------------------------------------- (${CYCLE}바퀴 완료)"
done
