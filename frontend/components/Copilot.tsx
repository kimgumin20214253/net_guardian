"use client";

import { useState, useRef, useEffect } from "react";
import { useCopilotUI } from "@/lib/CopilotUIContext";
import { useTelemetry } from "@/lib/TelemetryContext";
import { useCopilotChat } from "@/lib/useCopilotChat";

const MIN_WIDTH = 380;
const MIN_HEIGHT = 420;
const EDGE_MARGIN = 24; // 화면 가장자리와의 최소 여백 (fixed bottom-6 right-6과 맞춤)

// 기본 크기 = 화면의 약 1/4 (가로 50% x 세로 50%). SSR 시점엔 window가 없으니 안전한 기본값을 씀.
function getDefaultSize() {
  if (typeof window === "undefined") return { width: 480, height: 560 };
  return {
    width: Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.5)),
    height: Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.5)),
  };
}

export default function Copilot() {
  const { isOpen, setIsOpen, pendingQuery, clearPendingQuery } = useCopilotUI();
  const { scenario, data } = useTelemetry();
  const { messages, input, setInput, loading, error, quickQuestions, send } = useCopilotChat(
    scenario?.scenario ?? null,
    data
  );
  const listRef = useRef<HTMLDivElement>(null);

  // 패널이 화면 우측 하단에 고정되어 있으니, 왼쪽 위 모서리를 끌면 그만큼 커지는 방식으로 리사이즈한다.
  const [size, setSize] = useState(getDefaultSize);
  const resizingRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const r = resizingRef.current;
      if (!r) return;
      const dx = r.startX - e.clientX;
      const dy = r.startY - e.clientY;
      const maxW = window.innerWidth - EDGE_MARGIN * 2;
      const maxH = window.innerHeight - EDGE_MARGIN * 2;
      setSize({
        width: Math.min(maxW, Math.max(MIN_WIDTH, r.startW + dx)),
        height: Math.min(maxH, Math.max(MIN_HEIGHT, r.startH + dy)),
      });
    }
    function onUp() {
      resizingRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    resizingRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height };
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  // 다른 화면의 "코파일럿에게 물어보기" 버튼이 채워준 질문을 감지해 자동 전송
  useEffect(() => {
    if (pendingQuery) {
      send(pendingQuery);
      clearPendingQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div
          style={{ width: size.width, height: size.height }}
          className="relative flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-200"
        >
          {/* 리사이즈 핸들 - 좌상단을 끌면 그만큼 커짐 (패널은 우하단에 고정되어 있음) */}
          <div
            onPointerDown={startResize}
            role="separator"
            aria-label="코파일럿 창 크기 조절"
            title="드래그해서 크기 조절"
            className="absolute left-0 top-0 z-10 h-5 w-5 cursor-nwse-resize touch-none"
          >
            <svg viewBox="0 0 20 20" className="h-full w-full text-white/70">
              <path d="M18 2 L2 18 M18 8 L8 18 M18 14 L14 18" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </div>

          {/* 헤더 */}
          <div className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white">
            <div className="pl-4">
              <p className="font-semibold">현장 트러블슈팅 Copilot</p>
              <p className="text-xs text-indigo-100">매뉴얼 기반 조치 가이드 보조 도구</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="닫기"
              className="rounded p-1 text-indigo-100 hover:bg-indigo-500 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* 대화 영역 */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.length === 0 && (
              <p className="text-base text-slate-400">
                아래 빠른 질문을 누르거나, 궁금한 조치 방법을 직접 입력해보세요.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-800 ring-1 ring-slate-200"
                  }`}
                >
                  {m.text}
                  {m.role === "assistant" && m.source && (
                    <div className="mt-2 border-t border-slate-200 pt-1.5 text-xs text-slate-400">
                      출처: {m.source}
                      {m.fallbackUsed && " · 간이 응답(매뉴얼 원문)"}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-400 ring-1 ring-slate-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-md border-l-4 border-red-500 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* 빠른 질문 */}
          <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-white px-3 py-2">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={loading}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {q}
              </button>
            ))}
          </div>

          {/* 입력창 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-slate-200 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="조치 방법을 물어보세요"
              disabled={loading}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              전송
            </button>
          </form>
        </div>
      )}

      {/* 플로팅 버튼 - 아이콘만으로는 눈에 잘 안 띄어서 라벨을 붙인 알약 형태 + 닫혀있을 때만 은은한 펄스 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "트러블슈팅 코파일럿 닫기" : "트러블슈팅 코파일럿 열기"}
        className="group relative flex items-center gap-3 rounded-full bg-indigo-600 py-4 pl-5 pr-6 text-white shadow-xl ring-4 ring-indigo-600/20 transition hover:bg-indigo-700 hover:shadow-2xl"
      >
        {!isOpen && (
          <span className="motion-safe:animate-ping absolute inset-0 -z-10 rounded-full bg-indigo-500 opacity-40" />
        )}
        <span className="text-3xl leading-none">{isOpen ? "✕" : "🛠️"}</span>
        <span className="text-base font-semibold whitespace-nowrap">
          {isOpen ? "닫기" : "AI 코파일럿"}
        </span>
      </button>
    </div>
  );
}
