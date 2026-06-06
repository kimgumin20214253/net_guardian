# [구민] tc netem 장애 시간차 자동 주입 셸 스크립트 
#!/bin/bash
INTERFACE="eth0" # 본인 리눅스 네트워크 카드 이름으로 수정 필수!

sudo tc qdisc del dev $INTERFACE root 2>/dev/null
echo "[+] tc 장애 자동 주입 루프 시작 (종료: Ctrl + C)"

set_label() {
    echo "$1" > .current_label
}

while true
do
    echo "[*] 시나리오 A: 정상 공정 (라벨 0)"
    set_label 0
    sudo tc qdisc add dev $INTERFACE root netem delay 1ms 0.3ms distribution normal
    sleep 30
    sudo tc qdisc del dev $INTERFACE root

    echo "[*] 시나리오 B: 지연 장애 / CCTV 혼잡 (라벨 1)"
    set_label 1
    sudo tc qdisc add dev $INTERFACE root netem delay 120ms 40ms distribution normal
    sleep 30
    sudo tc qdisc del dev $INTERFACE root

    echo "[*] 시나리오 A 복귀 (라벨 0)"
    set_label 0
    sudo tc qdisc add dev $INTERFACE root netem delay 1ms 0.3ms distribution normal
    sleep 30
    sudo tc qdisc del dev $INTERFACE root

    echo "[*] 시나리오 C: 유실 장애 / EMI 오염 (라벨 1)"
    set_label 1
    sudo tc qdisc add dev $INTERFACE root netem delay 2ms loss gemodel 5% 50% 90% 0%
    sleep 30
    sudo tc qdisc del dev $INTERFACE root

    echo "[*] 시나리오 A 복귀 (라벨 0)"
    set_label 0
    sudo tc qdisc add dev $INTERFACE root netem delay 1ms 0.3ms distribution normal
    sleep 30
    sudo tc qdisc del dev $INTERFACE root

    echo "[*] 시나리오 D: 복합 장애 / DoS 공격 (라벨 1)"
    set_label 1
    sudo tc qdisc add dev $INTERFACE root netem delay 1ms 0.3ms distribution normal
    sleep 5
    sudo tc qdisc del dev $INTERFACE root

    sudo tc qdisc add dev $INTERFACE root netem delay 800ms 200ms loss 40%
    sleep 3
    sudo tc qdisc del dev $INTERFACE root

    sudo tc qdisc add dev $INTERFACE root netem loss 100%
    sleep 7
    sudo tc qdisc del dev $INTERFACE root

    sudo tc qdisc add dev $INTERFACE root netem delay 300ms 100ms loss 5%
    sleep 5
    sudo tc qdisc del dev $INTERFACE root

    echo "--------------------------------------------------------"
done
