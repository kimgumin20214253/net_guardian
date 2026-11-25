"use client";

import { useState } from "react";
import {
  sendCopilotMessage,
  fetchScenario,
  type ScenarioCode,
  type TelemetryResponse,
  type CopilotReadings,
} from "@/lib/api";
import type { CopilotAskContext } from "@/lib/CopilotUIContext";
import type { SiteState } from "@/lib/useMultiSiteTelemetry";
import { buildAggregateAnswer } from "@/lib/copilotAggregateAnswers";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  source?: string;
  fallbackUsed?: boolean;
};

const QUICK_QUESTIONS_BY_SCENARIO: Record<ScenarioCode, string[]> = {
  A: ["정상 상태 점검 주기는?", "이상 징후를 조기에 발견하려면?"],
  B: ["이 지연이 설비 동작에 미치는 영향은?", "트래픽 제한 명령어 알려줘"],
  C: ["케이블 차폐 접지 점검 순서는?", "CRC 에러 확인법은?"],
  D: ["지금 상황이 얼마나 심각해?", "긴급 대응 절차 알려줘"],
};

// 플로팅 위젯과 /copilot 전용 페이지가 공통으로 쓰는 대화 로직.
// 각 사용처가 독립적으로 이 훅을 호출하므로, 둘의 대화 내역은 서로 분리된다(의도된 동작).
// sites(멀티사이트 실시간 상태)를 넘기면 "전체 요약"/"가장 심각한 사이트" 같은 질문을 백엔드
// 매뉴얼 RAG로 보내지 않고 그 자리에서 직접 답한다(buildAggregateAnswer) - 매뉴얼 4~5개는
// 장애 유형 하나에 대한 설명일 뿐이라 여러 사이트를 비교하는 질문에는 애초에 맞는 문서가 없다.
export function useCopilotChat(
  scenarioCode: ScenarioCode | null,
  data: TelemetryResponse | null,
  sites: SiteState[] | null = null
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickQuestions = QUICK_QUESTIONS_BY_SCENARIO[scenarioCode ?? "A"];
  const latest = data?.points[data.points.length - 1];

  async function send(query: string, override?: CopilotAskContext) {
    const q = query.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setError(null);

    const aggregateAnswer = buildAggregateAnswer(q, sites);
    if (aggregateAnswer !== null) {
      setMessages((prev) => [...prev, { role: "assistant", text: aggregateAnswer, source: "실시간 사이트 상태(매뉴얼 검색 미사용)" }]);
      return;
    }

    setLoading(true);

    // override가 있으면(예: 멀티사이트 대시보드에서 특정 공장을 짚어서 물어본 경우) 그 사이트의
    // 시나리오/실측값을 그대로 쓴다 - 없으면 기존처럼 site-1(단일 사이트 화면)을 자동 조회한다.
    let currentFault: ScenarioCode | null = override?.currentFault ?? null;
    let readings: CopilotReadings | undefined = override?.readings;
    if (!override) {
      try {
        const status = await fetchScenario();
        currentFault = status.scenario;
      } catch {
        // 현재 시나리오 조회 실패해도 질문 자체는 계속 보낸다 (컨텍스트 없이 검색만 수행)
      }
      readings = latest
        ? {
            rtt: latest.rtt,
            loss_flag: latest.loss_flag,
            jitter: latest.jitter,
            confidence: latest.predicted.probabilities
              ? latest.predicted.probabilities[String(latest.predicted.label)]
              : null,
          }
        : undefined;
    }

    try {
      const res = await sendCopilotMessage(q, currentFault, readings);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.answer, source: res.source, fallbackUsed: res.fallback_used },
      ]);
    } catch {
      setError("코파일럿 서버에 연결할 수 없습니다. API 서버가 켜져 있는지 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return { messages, input, setInput, loading, error, quickQuestions, send };
}
