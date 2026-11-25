import type { ScenarioCode } from "@/lib/api";

// 실제로 주입된 시나리오(ground truth) 기준 표시용 공용 상수. 여러 화면(종합 관제/모니터링/
// 시나리오/AI 진단)이 똑같은 색상·이름을 쓰도록 한 곳에 모아둔다.
export const SCENARIO_NAME_KO: Record<ScenarioCode, string> = {
  A: "정상", B: "지연 장애", C: "유실 장애", D: "복합 장애",
};

// 다크 네이비 배경에 맞춘 상태 배지 색상
export const SCENARIO_BADGE: Record<ScenarioCode, string> = {
  A: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30",
  B: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30",
  C: "bg-red-500/10 text-red-400 ring-1 ring-red-500/30",
  D: "bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/30",
};

export const SCENARIO_DOT: Record<ScenarioCode, string> = {
  A: "bg-emerald-400", B: "bg-amber-400", C: "bg-red-400", D: "bg-purple-400",
};

export const SCENARIO_RING: Record<ScenarioCode, string> = {
  A: "ring-1 ring-slate-700", B: "ring-2 ring-amber-500/60",
  C: "ring-2 ring-red-500/60", D: "ring-2 ring-purple-500/60",
};

// SCENARIO_RING과 같은 색 체계이지만 border-* 유틸리티가 필요한 곳(토폴로지 노드 테두리 등)에서 쓴다.
export const SCENARIO_BORDER: Record<ScenarioCode, string> = {
  A: "border-slate-700", B: "border-amber-500/60", C: "border-red-500/60", D: "border-purple-500/60",
};

export const SCENARIO_TEXT: Record<ScenarioCode, string> = {
  A: "text-emerald-400", B: "text-amber-400", C: "text-red-400", D: "text-purple-400",
};

// backend/api/main.py의 SCENARIO_LABEL_MAP(A=0,B=1,C=2,D=3)과 동일하게, TelemetryPoint.true_label
// (정수)을 시나리오 코드로 되돌릴 때 쓴다 - 백엔드가 이미 쓰는 매핑을 그대로 가져온 것이라 새로
// 지어낸 기준이 아니다.
export const LABEL_TO_SCENARIO: Record<number, ScenarioCode> = { 0: "A", 1: "B", 2: "C", 3: "D" };
