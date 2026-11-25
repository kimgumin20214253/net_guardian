import type { TelemetryPoint } from "@/lib/api";

export type Transition = "recovered" | "fault_started" | null;
export type PointWithTransition = TelemetryPoint & { transition: Transition };

// 실제로 주입된 시나리오(true_label) 기준으로 "장애 발생/복구"를 감지한다. AI의 순간 예측
// (predicted.severity)은 유실/복합 장애에서 개별 요청 대부분이 정상처럼 보여 정상↔이상으로
// 계속 깜빡이므로, 그 깜빡임을 그대로 로그에 찍으면 "장애 발생"/"정상 복구"가 수십 번씩
// 중복으로 찍힌다 (/scenario 페이지에서 이미 겪은 것과 같은 문제).
// (운영자가 실제로 뭘 확인했는지는 추적하지 않음 - 확인 안 한 걸 확인됨으로 표시하지 않기 위함)
export function withTransitions(points: TelemetryPoint[]): PointWithTransition[] {
  return points.map((p, i) => {
    if (i === 0) return { ...p, transition: null };
    const prev = points[i - 1].true_label;
    const curr = p.true_label;
    if (prev === null || curr === null) return { ...p, transition: null };
    const prevOk = prev === 0;
    const currOk = curr === 0;
    if (!prevOk && currOk) return { ...p, transition: "recovered" };
    if (prevOk && !currOk) return { ...p, transition: "fault_started" };
    return { ...p, transition: null };
  });
}
