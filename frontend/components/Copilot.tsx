"use client";

import { useState, useRef, useEffect } from "react";
import { useCopilotUI } from "@/lib/CopilotUIContext";
import { useTelemetry } from "@/lib/TelemetryContext";
import { useSharedMultiSiteTelemetry, buildCopilotContext } from "@/lib/MultiSiteTelemetryContext";
import { useCopilotChat } from "@/lib/useCopilotChat";
import { GLOBAL_QUICK_QUESTIONS } from "@/lib/copilotAggregateAnswers";
import { SCENARIO_DOT } from "@/lib/scenarioStyles";
import type { SiteId } from "@/lib/api";

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
  const { isOpen, setIsOpen, pendingQuery, pendingContext, clearPendingQuery } = useCopilotUI();
  const { scenario, data } = useTelemetry();

  // "어느 공장 이야기인지" 선택기. 직접 타이핑할 때도 이 선택을 기준으로 답하게 해서,
  // 질문 텍스트에 "2공장"이라고 써도 실제로는 반영이 안 되던 문제를 막는다 - 질문 텍스트는
  // 코파일럿 RAG 검색에만 쓰이고, 어느 사이트 데이터를 쓸지는 전혀 못 읽기 때문이다.
  const { sites } = useSharedMultiSiteTelemetry();
  const [selectedSiteId, setSelectedSiteId] = useState<SiteId | null>(null);

  const { messages, input, setInput, loading, error, quickQuestions, send } = useCopilotChat(
    scenario?.scenario ?? null,
    data,
    sites
  );
  const listRef = useRef<HTMLDivElement>(null);

  // 다른 화면의 "이 공장에 대해 물어보기" 버튼으로 열렸으면 선택기도 그 공장으로 맞춘다.
  // pendingContext는 실제 사용자 행동(askCopilot 호출)이 있을 때만 바뀌는 값이라, "렌더링 중
  // 이전 값과 비교해서 바뀌었으면 그 자리에서 state를 조정"하는 React 권장 패턴을 쓴다
  // (effect 안에서 setState하면 렌더가 한 번 더 생기고, sites처럼 매 폴링마다 새로 생성되는
  // 값이 아니라서 이 비교 방식이 안전하다).
  const [syncedContext, setSyncedContext] = useState(pendingContext);
  if (pendingContext !== syncedContext) {
    setSyncedContext(pendingContext);
    if (pendingContext?.siteId) setSelectedSiteId(pendingContext.siteId);
  }

  // 아직 선택한 적 없으면: 장애 난 사이트가 있으면 그걸, 없으면 1공장을 기본값으로 보여준다.
  // 매 폴링마다 sites가 새 배열이 되므로, 이건 state로 저장해두지 않고 그때그때 계산만 한다.
  const resolvedSiteId = selectedSiteId ?? sites?.find((s) => s.info.scenario !== "A")?.info.id ?? sites?.[0]?.info.id ?? null;
  const selectedSite = sites?.find((s) => s.info.id === resolvedSiteId) ?? null;

  /** 직접 타이핑/빠른질문 전송 시, 선택된 공장의 실측값을 컨텍스트로 넘긴다. */
  function sendWithSelectedSite(query: string) {
    send(query, selectedSite ? buildCopilotContext(selectedSite) : undefined);
  }

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
      send(pendingQuery, pendingContext ?? undefined);
      clearPendingQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div
          style={{ width: size.width, height: size.height }}
          className="relative flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg bg-slate-800 shadow-2xl ring-1 ring-slate-700"
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
          <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
            <div className="pl-4">
              <p className="font-semibold">현장 트러블슈팅 Copilot</p>
              <p className="text-xs text-blue-100">매뉴얼 기반 조치 가이드 보조 도구</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="닫기"
              className="rounded p-1 text-blue-100 hover:bg-blue-500 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* 어느 공장 이야기인지 선택 - 안 고르면 질문 텍스트의 "2공장" 같은 말은 무시되고
              기본값(1공장)으로 답이 나가버린다. */}
          {sites && (
            <div className="flex items-center gap-1 border-b border-slate-700 bg-slate-800 px-3 py-2">
              <span className="mr-1 text-xs text-slate-500">공장:</span>
              {sites.map((s) => (
                <button
                  key={s.info.id}
                  onClick={() => setSelectedSiteId(s.info.id)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
                    resolvedSiteId === s.info.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${SCENARIO_DOT[s.info.scenario]}`} />
                  {s.info.name.split(" - ")[0] ?? s.info.name}
                </button>
              ))}
            </div>
          )}

          {/* 대화 영역 */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-900 p-4">
            {messages.length === 0 && (
              <p className="text-base text-slate-500">
                아래 빠른 질문을 누르거나, 궁금한 조치 방법을 직접 입력해보세요.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-200 ring-1 ring-slate-700"
                  }`}
                >
                  {m.text}
                  {m.role === "assistant" && m.source && (
                    <div className="mt-2 border-t border-slate-700 pt-1.5 text-xs text-slate-500">
                      출처: {m.source}
                      {m.fallbackUsed && " · 간이 응답(매뉴얼 원문)"}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500 [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-md border-l-4 border-red-500 bg-red-500/10 p-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* 전체 네트워크 추천 질문 - 특정 공장이 아니라 3개 사이트 전체를 묻는 질문이라
              아래 "공장별 빠른 질문"과는 별도 줄로 둔다. */}
          <div className="flex flex-wrap gap-1.5 border-t border-slate-700 bg-slate-800 px-3 py-2">
            {GLOBAL_QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendWithSelectedSite(q)}
                disabled={loading}
                className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {q}
              </button>
            ))}
          </div>

          {/* 공장별 빠른 질문 */}
          <div className="flex flex-wrap gap-1.5 border-t border-slate-700 bg-slate-800 px-3 py-2">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => sendWithSelectedSite(q)}
                disabled={loading}
                className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {q}
              </button>
            ))}
          </div>

          {/* 입력창 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendWithSelectedSite(input);
            }}
            className="flex gap-2 border-t border-slate-700 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="조치 방법을 물어보세요"
              disabled={loading}
              className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
        className="group relative flex items-center gap-3 rounded-full bg-blue-600 py-4 pl-5 pr-6 text-white shadow-xl ring-4 ring-blue-600/20 transition hover:bg-blue-500 hover:shadow-2xl"
      >
        {!isOpen && (
          <span className="motion-safe:animate-ping absolute inset-0 -z-10 rounded-full bg-blue-500 opacity-40" />
        )}
        <span className="text-3xl leading-none">{isOpen ? "✕" : "🛠️"}</span>
        <span className="text-base font-semibold whitespace-nowrap">
          {isOpen ? "닫기" : "AI 코파일럿"}
        </span>
      </button>
    </div>
  );
}
