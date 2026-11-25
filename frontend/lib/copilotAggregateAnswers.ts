import type { SiteState } from "@/lib/useMultiSiteTelemetry";
import { SCENARIO_NAME_KO, SCENARIO_CANONICAL_SEVERITY } from "@/lib/scenarioStyles";

export const SUMMARY_QUESTION = "현재 전체 네트워크 상태를 요약해 줘";
export const WORST_SITE_QUESTION = "가장 심각한 장애가 발생한 사이트는?";

// AI 코파일럿 초기 진입화면에 보여줄 추천 질문 5개. 기존 시나리오별 빠른 질문(QUICK_QUESTIONS_BY_SCENARIO)
// 과는 별도 영역으로 추가한다 - 이 중 앞의 2개는 매뉴얼 RAG로 답할 성질이 아니라서(매뉴얼 4~5개 문서는
// 장애 유형 하나에 대한 설명일 뿐 "지금 여러 사이트 중 어디가 제일 심각한지"는 알 수 없음)
// buildAggregateAnswer()가 지금 화면에 이미 올라온 실시간 sites 데이터로 직접 답한다.
export const GLOBAL_QUICK_QUESTIONS = [
  SUMMARY_QUESTION,
  WORST_SITE_QUESTION,
  "현재 발생한 장애의 원인을 분석해 줘",
  "장애 복구를 위한 우선순위를 알려줘",
  "TCP 재전송과 RTO의 관계를 설명해 줘",
];

const SEVERITY_RANK: Record<string, number> = { ok: 0, warning: 1, danger: 2, critical: 3 };

function latestOf(site: SiteState) {
  const points = site.telemetry?.points ?? [];
  return points[points.length - 1] ?? null;
}

/** SUMMARY_QUESTION / WORST_SITE_QUESTION일 때만 실시간 sites로 직접 답을 만들어 반환하고,
 *  그 외 질문은 null을 반환해 기존처럼 백엔드 매뉴얼 RAG로 넘어가게 한다. */
export function buildAggregateAnswer(query: string, sites: SiteState[] | null): string | null {
  const q = query.trim();
  if (!sites || sites.length === 0) return null;

  if (q === SUMMARY_QUESTION) {
    const lines = sites.map((s) => {
      const latest = latestOf(s);
      const status = s.info.scenario === "A" ? "정상" : `${SCENARIO_NAME_KO[s.info.scenario]} 🚨`;
      const reading = latest
        ? ` (RTT ${latest.rtt.toFixed(1)}ms · Loss ${latest.loss_flag} · Jitter ${latest.jitter.toFixed(1)}ms)`
        : "";
      return `- ${s.info.name}: ${status}${reading}`;
    });
    return `[실시간 사이트 상태 요약]\n${lines.join("\n")}`;
  }

  if (q === WORST_SITE_QUESTION) {
    const faulted = sites.filter((s) => s.info.scenario !== "A");
    if (faulted.length === 0) {
      return "현재 3개 사이트 모두 정상(A) 상태입니다. 심각한 장애가 발생한 사이트가 없습니다.";
    }
    const worst = [...faulted].sort(
      (a, b) =>
        SEVERITY_RANK[SCENARIO_CANONICAL_SEVERITY[b.info.scenario]] -
        SEVERITY_RANK[SCENARIO_CANONICAL_SEVERITY[a.info.scenario]]
    )[0];
    const latest = latestOf(worst);
    const reading = latest
      ? ` (RTT ${latest.rtt.toFixed(1)}ms · Loss ${latest.loss_flag} · Jitter ${latest.jitter.toFixed(1)}ms)`
      : "";
    return `가장 심각한 곳은 ${worst.info.name}입니다 - 실제 시나리오: ${SCENARIO_NAME_KO[worst.info.scenario]}${reading}.`;
  }

  return null;
}
