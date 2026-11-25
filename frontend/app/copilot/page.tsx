"use client";

import { useEffect, useRef, useState } from "react";
import { useTelemetry } from "@/lib/TelemetryContext";
import { useCopilotChat } from "@/lib/useCopilotChat";
import { fetchAllCopilotGuides, type CopilotGuide } from "@/lib/api";

export default function CopilotPage() {
  const { scenario, data } = useTelemetry();
  const { messages, input, setInput, loading, error, quickQuestions, send } = useCopilotChat(
    scenario?.scenario ?? null,
    data
  );
  const listRef = useRef<HTMLDivElement>(null);

  const [guides, setGuides] = useState<CopilotGuide[]>([]);
  const [guidesError, setGuidesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAllCopilotGuides()
      .then((res) => {
        setGuides(res.documents);
        setSelectedId(res.documents[0]?.doc_id ?? null);
      })
      .catch(() => setGuidesError("매뉴얼을 불러오지 못했습니다. API 서버가 켜져 있는지 확인해주세요."));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  async function copyCommand(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한 없어도 화면에 텍스트는 그대로 보이므로 수동 복사 가능
    }
  }

  const selected = guides.find((g) => g.doc_id === selectedId) ?? null;

  return (
    <main className="flex h-full flex-col p-8 text-slate-100">
      <h1 className="mb-1 text-2xl font-bold text-white">🛠️ AI 코파일럿</h1>
      <p className="mb-6 text-sm text-slate-400">
        왼쪽에서 매뉴얼을 직접 훑어보거나, 오른쪽 대화창에 궁금한 점을 물어보세요. 다른 화면
        (장애 시뮬레이션)에서 특정 공장을 짚어 물어보면 화면 우측 하단 플로팅 코파일럿이 그
        공장의 실측값을 가지고 바로 답해줍니다.
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* 좌측: 매뉴얼 문서 브라우저 */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-slate-800 ring-1 ring-slate-700">
          <div className="border-b border-slate-700 px-4 py-3">
            <h2 className="font-semibold text-white">📚 매뉴얼 목록</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {guidesError && <p className="p-4 text-sm text-red-400">{guidesError}</p>}
            {guides.map((g) => (
              <button
                key={g.doc_id}
                onClick={() => setSelectedId(g.doc_id)}
                className={`block w-full border-b border-slate-700/60 px-4 py-3 text-left text-sm transition ${
                  selectedId === g.doc_id ? "bg-blue-500/10 font-medium text-blue-300" : "text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                {g.scenario}
              </button>
            ))}
          </div>

          {selected && (
            <div className="max-h-[45%] overflow-y-auto border-t border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
              <p className="mb-2 text-xs text-slate-500">참고: {selected.reference}</p>
              <p className="mb-1"><span className="font-semibold text-slate-200">증상:</span> {selected.symptom}</p>
              <p className="mb-1"><span className="font-semibold text-slate-200">추정 원인:</span> {selected.root_cause}</p>
              <p className="mb-1 whitespace-pre-wrap"><span className="font-semibold text-slate-200">조치 절차:</span>{"\n"}{selected.action_guide}</p>
              <div className="mt-2 flex items-center gap-2 rounded bg-slate-800 px-2 py-1.5 ring-1 ring-slate-700">
                <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-slate-300">{selected.cli_command}</code>
                <button
                  onClick={() => copyCommand(selected.cli_command)}
                  className="flex-shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
                >
                  {copied ? "복사됨 ✓" : "복사"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 우측: 대화창 */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-slate-800 ring-1 ring-slate-700">
          <div className="border-b border-slate-700 px-4 py-3">
            <h2 className="font-semibold text-white">💬 대화</h2>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-900 p-4">
            {messages.length === 0 && (
              <p className="text-base text-slate-500">
                아래 빠른 질문을 누르거나, 궁금한 조치 방법을 직접 입력해보세요.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap ${
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

          <div className="flex flex-wrap gap-1.5 border-t border-slate-700 bg-slate-800 px-3 py-2">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={loading}
                className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
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
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              전송
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
