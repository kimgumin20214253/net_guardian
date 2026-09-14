import type { TelemetryPoint } from "@/lib/api";

export type Transition = "recovered" | "fault_started" | null;
export type PointWithTransition = TelemetryPoint & { transition: Transition };

// 심각도가 바뀌는 지점만 실측 데이터로 감지해서 "장애 발생/복구" 마크를 붙인다.
// (운영자가 실제로 뭘 확인했는지는 추적하지 않음 - 확인 안 한 걸 확인됨으로 표시하지 않기 위함)
export function withTransitions(points: TelemetryPoint[]): PointWithTransition[] {
  return points.map((p, i) => {
    if (i === 0) return { ...p, transition: null };
    const prevOk = points[i - 1].predicted.severity === "ok";
    const currOk = p.predicted.severity === "ok";
    if (!prevOk && currOk) return { ...p, transition: "recovered" };
    if (prevOk && !currOk) return { ...p, transition: "fault_started" };
    return { ...p, transition: null };
  });
}
