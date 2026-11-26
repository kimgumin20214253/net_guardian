import type { TelemetryPoint } from "@/lib/api";

// backend/fault_tiers.py의 _tcp_rto_features()와 동일한 RFC 6298 + Karn 알고리즘을 그대로
// TypeScript로 옮긴 것이다. 이 프로젝트는 실제 TCP 재전송 세그먼트 수(retrans_segs)를 라이브
// 수집 경로에서 모으지 않으므로, "TCP 재전송 횟수" KPI를 진짜 캡처값처럼 보여줄 수 없다 -
// 대신 이미 받은 rtt/loss_flag로 "RTO를 넘겨 재전송이 있었을 가능성이 높은 샘플" 건수를
// 똑같은 공식으로 추정한다(백엔드가 세부 진단 사례를 고를 때 쓰는 바로 그 계산).
export const RTO_MIN_MS = 200;

export function countRtoExceed(points: { rtt: number; loss_flag: number }[]): number {
  let srtt: number | null = null;
  let rttvar: number | null = null;
  let prevExceed = false;
  let count = 0;

  for (const p of points) {
    const rto = srtt === null ? RTO_MIN_MS : Math.max(RTO_MIN_MS, srtt + 4 * (rttvar as number));
    const exceed = p.loss_flag === 0 && srtt !== null && p.rtt > rto;
    let update = p.loss_flag === 0;
    if (exceed && !prevExceed) update = false; // Karn: 갑자기 튄 응답은 재전송 추정 -> SRTT 갱신 제외

    if (update) {
      if (srtt === null) {
        srtt = p.rtt;
        rttvar = p.rtt / 2;
      } else {
        rttvar = 0.75 * (rttvar as number) + 0.25 * Math.abs(srtt - p.rtt);
        srtt = 0.875 * srtt + 0.125 * p.rtt;
      }
    }
    prevExceed = exceed;
    if (exceed) count++;
  }
  return count;
}

/** 공유 폴링 창의 "앞쪽 절반 평균"과 "뒤쪽 절반 평균"을 비교한 실제 변화율(%). 저장된 과거
 *  기준값이 없으므로, 지금 이미 받아온 배열 안에서만 계산되는 정직한 추세 지표다 - 지어낸
 *  "전일 대비"류 수치가 아니다. 포인트가 너무 적으면(노이즈만 보일 수준) null을 반환한다. */
export function windowDeltaPct(points: TelemetryPoint[], key: "rtt" | "jitter" | "loss_flag"): number | null {
  if (points.length < 8) return null;
  const mid = Math.floor(points.length / 2);
  const avg = (arr: TelemetryPoint[]) => arr.reduce((a, p) => a + p[key], 0) / arr.length;
  const before = avg(points.slice(0, mid));
  const after = avg(points.slice(mid));
  if (before === 0) return after === 0 ? 0 : null;
  return ((after - before) / before) * 100;
}
