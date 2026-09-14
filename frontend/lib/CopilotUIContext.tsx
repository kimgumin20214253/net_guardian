"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type CopilotUIContextValue = {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  pendingQuery: string | null;
  askCopilot: (query: string) => void;
  clearPendingQuery: () => void;
};

const CopilotUIContext = createContext<CopilotUIContextValue | null>(null);

// 다른 페이지(개요/시나리오 등)에서 "코파일럿에게 물어보기" 버튼을 누르면
// 코파일럿 창을 열고 미리 채워진 질문을 바로 전송할 수 있게 해주는 공유 상태.
export function CopilotUIProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  function askCopilot(query: string) {
    setPendingQuery(query);
    setIsOpen(true);
  }

  function clearPendingQuery() {
    setPendingQuery(null);
  }

  return (
    <CopilotUIContext.Provider value={{ isOpen, setIsOpen, pendingQuery, askCopilot, clearPendingQuery }}>
      {children}
    </CopilotUIContext.Provider>
  );
}

export function useCopilotUI() {
  const ctx = useContext(CopilotUIContext);
  if (!ctx) throw new Error("useCopilotUI()는 CopilotUIProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
