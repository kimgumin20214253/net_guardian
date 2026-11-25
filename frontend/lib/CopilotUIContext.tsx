"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ScenarioCode, CopilotReadings } from "@/lib/api";

/** 멀티사이트 대시보드처럼 "지금 보고 있는 게 site-1이 아닐 수도 있는" 화면에서,
 *  코파일럿이 자동으로 site-1을 조회하는 대신 이 값을 그대로 쓰도록 넘기는 컨텍스트. */
export type CopilotAskContext = { currentFault: ScenarioCode; readings?: CopilotReadings };

type CopilotUIContextValue = {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  pendingQuery: string | null;
  pendingContext: CopilotAskContext | null;
  askCopilot: (query: string, context?: CopilotAskContext) => void;
  clearPendingQuery: () => void;
};

const CopilotUIContext = createContext<CopilotUIContextValue | null>(null);

// 다른 페이지(개요/시나리오 등)에서 "코파일럿에게 물어보기" 버튼을 누르면
// 코파일럿 창을 열고 미리 채워진 질문을 바로 전송할 수 있게 해주는 공유 상태.
// context를 같이 넘기면, 코파일럿이 site-1을 자동 조회하지 않고 그 사이트 기준으로 답한다.
export function CopilotUIProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [pendingContext, setPendingContext] = useState<CopilotAskContext | null>(null);

  function askCopilot(query: string, context?: CopilotAskContext) {
    setPendingQuery(query);
    setPendingContext(context ?? null);
    setIsOpen(true);
  }

  function clearPendingQuery() {
    setPendingQuery(null);
    setPendingContext(null);
  }

  return (
    <CopilotUIContext.Provider
      value={{ isOpen, setIsOpen, pendingQuery, pendingContext, askCopilot, clearPendingQuery }}
    >
      {children}
    </CopilotUIContext.Provider>
  );
}

export function useCopilotUI() {
  const ctx = useContext(CopilotUIContext);
  if (!ctx) throw new Error("useCopilotUI()는 CopilotUIProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
