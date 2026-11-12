#!/bin/bash
# run_all_sites.sh로 띄운 3개 사이트(server.py + packet_analyzer.py x3)를 전부 종료한다.
# 반드시 backend/ 안에서 실행할 것: bash network/stop_all_sites.sh

if [ ! -f logs/site_pids.txt ]; then
  echo "logs/site_pids.txt가 없습니다 - run_all_sites.sh로 먼저 띄웠는지 확인하세요."
  exit 1
fi

while read -r pid; do
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "종료: PID $pid"
  fi
done < logs/site_pids.txt

rm -f logs/site_pids.txt
echo "전체 사이트 종료 완료."
