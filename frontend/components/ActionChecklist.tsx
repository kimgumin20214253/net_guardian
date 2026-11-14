"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSiteGuide, type SiteId, type FaultGuide } from "@/lib/api";

function parseSteps(actionGuide: string): string[] {
  return actionGuide
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function ActionChecklist({
  siteId,
  onComplete,
}: {
  siteId: SiteId;
  /** 체크리스트 항목을 전부 체크한 "그 순간"에 한 번만 호출된다 (다시 열어도 중복 호출 안 됨). */
  onComplete?: () => void;
}) {
  const [guide, setGuide] = useState<FaultGuide | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [copied, setCopied] = useState(false);
  // 같은 체크리스트에 대해 onComplete를 두 번 이상 부르지 않기 위한 엣지 트리거 가드
  const firedRef = useRef(false);

  // siteId가 같아도 "새로 장애가 발생할 때마다" 다시 추천받아야 하므로, 이 컴포넌트가
  // 처음 마운트되는 시점(= 부모가 faultedSites에 이 사이트를 새로 포함시킨 시점)에 한 번만
  // 조회한다. 이후 폴링으로 실측값이 바뀌어도 같은 장애가 끝날 때까지 가이드는 고정된다
  // (그래야 체크 중간에 가이드가 바뀌면서 체크리스트가 리셋되는 예전 버그가 재발하지 않는다).
  useEffect(() => {
    let cancelled = false;
    firedRef.current = false;
    fetchSiteGuide(siteId)
      .then((g) => {
        if (cancelled) return;
        setGuide(g);
        setChecked(new Array(parseSteps(g.action_guide).length).fill(false));
      })
      .catch(() => {
        if (!cancelled) setGuide(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // "d1"(복합 장애 전환 초기)은 실제로 할 조치가 없는 관찰 단계라서, 체크/완료 처리를 하지 않는다
  // - 그냥 안내문 하나를 보여주고, 다음 폴링에서 d2로 넘어가면 그때 진짜 체크리스트가 뜬다.
  const isObservationOnly = guide?.case_id === "d1";

  useEffect(() => {
    if (checked.length === 0 || firedRef.current || isObservationOnly) return;
    if (checked.every(Boolean)) {
      firedRef.current = true;
      onComplete?.();
    }
  }, [checked, onComplete, isObservationOnly]);

  async function copyCommand() {
    if (!guide) return;
    try {
      await navigator.clipboard.writeText(guide.cli_command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없어도 조용히 무시 (텍스트는 화면에 그대로 보이므로 수동 복사 가능)
    }
  }

  if (!guide) return null;

  const steps = parseSteps(guide.action_guide); // 사례당 1~4개
  const doneCount = checked.filter(Boolean).length;
  const allDone = !isObservationOnly && steps.length > 0 && doneCount === steps.length;

  function handleTakeAction(i: number) {
    setChecked((prev) => {
      if (prev[i]) return prev; // 이미 조치된 항목은 다시 눌러도 변화 없음
      return prev.map((v, idx) => (idx === i ? true : v));
    });
  }

  return (
    <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-indigo-900">초동 조치 체크리스트</p>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
            AI 추천: {guide.name_ko}
          </span>
        </div>
        {!isObservationOnly && (
          <span className="text-xs text-indigo-500">
            {doneCount}/{steps.length} 완료
          </span>
        )}
      </div>

      {isObservationOnly ? (
        <p className="rounded-md border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-700">
          {steps[0]}
        </p>
      ) : (
        <div className="space-y-2">
          {steps.map((step, i) => {
            const done = checked[i] ?? false;
            return (
              <button
                key={i}
                onClick={() => handleTakeAction(i)}
                disabled={done}
                className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition ${
                  done
                    ? "cursor-default border-green-200 bg-green-50 text-green-700"
                    : "border-indigo-200 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-100"
                }`}
              >
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done ? "bg-green-500 text-white" : "bg-indigo-100 text-indigo-600"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={done ? "line-through" : ""}>{step}</span>
                <span className="ml-auto flex-shrink-0 text-xs font-medium text-indigo-400">
                  {done ? "조치 완료" : "눌러서 조치"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {allDone && (
        <p className="mt-3 rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700">
          ✅ 초동 조치를 모두 완료했습니다. 정상 상태로 복귀하고, 1분간 이 네트워크에는 새 장애가
          걸리지 않습니다.
        </p>
      )}

      {guide.cli_command && (
        <div className="mt-3 flex items-center gap-2 rounded bg-white px-3 py-2 ring-1 ring-indigo-100">
          <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-slate-700">
            {guide.cli_command}
          </code>
          <button
            onClick={copyCommand}
            className="flex-shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
          >
            {copied ? "복사됨 ✓" : "복사"}
          </button>
        </div>
      )}

      <p className="mt-2 text-[11px] text-indigo-400">참고: {guide.reference}</p>
    </div>
  );
}
