#!/bin/bash
# 산업 네트워크(사이트) 3개를 각각 독립된 포트/라벨 파일/CSV로 동시에 띄운다.
# 반드시 backend/ 안에서 실행할 것: bash network/run_all_sites.sh
# site-1은 기존 단일 사이트 때 쓰던 파일 그대로라, 지금까지 하던 실행 방식과 동일하게 동작한다.
# site-2/site-3는 api/main.py의 SITES 설정과 포트·파일명이 맞아야 대시보드에서 보인다.

set -e
mkdir -p data logs

start_site() {
  local label=$1 port=$2 label_file=$3 csv=$4
  echo "[$label] 서버(포트 $port) + 수집기 시작 (라벨: $label_file, CSV: $csv)"
  NG_SERVER_PORT=$port NG_LABEL_FILE=$label_file \
    python network/server.py > "logs/${label}_server.log" 2>&1 &
  echo $! >> logs/site_pids.txt
  sleep 1
  PA_MODBUS_PORT=$port PA_LABEL_FILE=$label_file PA_OUTPUT_FILE=$csv \
    python packet_analyzer.py > "logs/${label}_analyzer.log" 2>&1 &
  echo $! >> logs/site_pids.txt
}

rm -f logs/site_pids.txt

start_site site1 5020 .current_label                net_guardian_scenario_dataset.csv
start_site site2 5021 .current_label_site2           net_guardian_scenario_dataset_site2.csv
start_site site3 5022 .current_label_site3           net_guardian_scenario_dataset_site3.csv

echo ""
echo "3개 사이트 전부 백그라운드로 실행 중입니다 (PID: logs/site_pids.txt, 로그: logs/*.log)."
echo "종료하려면: bash network/stop_all_sites.sh"
