"use client";

import { useEffect, useState } from "react";
import {
  sendCopilotMessage,
  fetchScenario,
  type ScenarioCode,
  type TelemetryResponse,
} from "@/lib/api";

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
export function useCopilotChat(scenarioCode: ScenarioCode | null, data: TelemetryResponse | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickQuestions = QUICK_QUESTIONS_BY_SCENARIO[scenarioCode ?? "A"];
  const latest = data?.points[data.points.length - 1];

  async function send(query: string) {
    const q = query.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    setError(null);

    let currentFault: ScenarioCode | null = null;
    try {
      const status = await fetchScenario();
      currentFault = status.scenario;
    } catch {
      // 현재 시나리오 조회 실패해도 질문 자체는 계속 보낸다 (컨텍스트 없이 검색만 수행)
    }

    const readings = latest
      ? {
          rtt: latest.rtt,
          loss_flag: latest.loss_flag,
          jitter: latest.jitter,
          confidence: latest.predicted.probabilities
            ? latest.predicted.probabilities[String(latest.predicted.label)]
            : null,
        }
      : undefined;

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
