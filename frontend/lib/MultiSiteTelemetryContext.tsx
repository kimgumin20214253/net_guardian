"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useMultiSiteTelemetry } from "@/lib/useMultiSiteTelemetry";

type MultiSiteTelemetryValue = ReturnType<typeof useMultiSiteTelemetry>;

const MultiSiteTelemetryContext = createContext<MultiSiteTelemetryValue | null>(null);

// 레이아웃에 한 번만 두고 모든 멀티사이트 화면(종합 관제/모니터링/시나리오/AI 진단/이벤트 이력)이
// 공유한다. 예전에는 각 페이지가 useMultiSiteTelemetry()를 직접 호출해서, 페이지를 옮길
// 때마다 그 페이지의 훅이 처음부터(sites: null) 다시 폴링을 시작해 매번 몇 초씩 기다려야
// 했다. 레이아웃은 페이지 이동으로 언마운트되지 않으므로, 여기서 한 번 불러온 뒤로는 페이지를
// 옮겨도 이미 있는 데이터를 그대로 보여준다. 포인트 개수는 넉넉하게 200으로 고정 - 화면별로
// "최근 50/100건만 보기"가 필요하면 이미 받은 배열을 화면에서 잘라서 쓰면 되고, 그러면
// 다시 네트워크를 안 타서 더 빠르다.
const SHARED_POINT_COUNT = 200;

export function MultiSiteTelemetryProvider({ children }: { children: ReactNode }) {
  const value = useMultiSiteTelemetry(SHARED_POINT_COUNT);
  return <MultiSiteTelemetryContext.Provider value={value}>{children}</MultiSiteTelemetryContext.Provider>;
}

export function useSharedMultiSiteTelemetry() {
  const ctx = useContext(MultiSiteTelemetryContext);
  if (!ctx) {
    throw new Error("useSharedMultiSiteTelemetry()는 MultiSiteTelemetryProvider 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}
