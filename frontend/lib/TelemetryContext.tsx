"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  fetchTelemetry,
  fetchScenario,
  type TelemetryResponse,
  type ScenarioStatus,
} from "@/lib/api";

const POLL_INTERVAL_MS = 3000;
const CONNECTION_ERROR =
  "API 서버(localhost:8000)에 연결할 수 없습니다. backend/api 서버를 먼저 실행하세요.";

type TelemetryContextValue = {
  data: TelemetryResponse | null;
  scenario: ScenarioStatus | null;
  error: string | null;
  /** 마지막으로 주입한 순간의 서버 타임스탬프 (차트에 "주입 시점" 세로선을 그리는 데 사용) */
  lastInjectionTime: string | null;
};

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

// 4개 페이지(개요/시나리오/모니터링/로그)가 각자 폴링하면 API 호출이 4배로 뻥튀기되니,
// 레이아웃 한 곳에서만 폴링하고 Context로 공유한다.
export function TelemetryProvider({
  initial,
  children,
}: {
  initial: TelemetryResponse | null;
  children: ReactNode;
}) {
  const [data, setData] = useState<TelemetryResponse | null>(initial);
  const [error, setError] = useState<string | null>(initial ? null : CONNECTION_ERROR);
  const [scenario, setScenarioState] = useState<ScenarioStatus | null>(null);
  // 이 사이트(site-1)에서 시나리오를 직접 주입하는 버튼은 이제 없다(/scenario가 멀티사이트로
  // 대체함) - 그래서 이 값은 항상 null이지만, TrafficChart에 "주입 시점" prop 자리가 남아있어
  // 필드 자체는 유지한다.
  const [lastInjectionTime] = useState<string | null>(null);

  // 3초 주기 폴링과 "버튼 클릭 → 즉시 반영"이 동시에 /scenario를 요청할 수 있는데,
  // 먼저 보낸 폴링 요청이 나중에 도착하면 방금 반영된 최신 상태를 오래된 값으로 덮어써버린다
  // (A를 눌렀는데 잠깐 B로 보였다가 다음 폴링에서야 A로 정정되는 현상의 원인).
  // 요청마다 순번을 매겨서, 응답이 왔을 때 그게 여전히 "가장 최근에 보낸 요청"일 때만 반영한다.
  const scenarioSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const mySeq = ++scenarioSeqRef.current;
      try {
        const [telemetry, scenarioStatus] = await Promise.all([
          fetchTelemetry(50),
          fetchScenario(),
        ]);
        if (!cancelled) {
          setData(telemetry);
          if (mySeq === scenarioSeqRef.current) {
            setScenarioState(scenarioStatus);
          }
          setError(null);
        }
      } catch {
        if (!cancelled) setError(CONNECTION_ERROR);
      }
    }

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <TelemetryContext.Provider value={{ data, scenario, error, lastInjectionTime }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetry()는 TelemetryProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
