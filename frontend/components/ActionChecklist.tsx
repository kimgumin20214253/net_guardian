"use client";

import { useEffect, useState } from "react";
import { fetchCopilotGuide, type ScenarioCode, type CopilotGuide } from "@/lib/api";

function parseSteps(actionGuide: string): string[] {
  return actionGuide
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function ActionChecklist({ scenario }: { scenario: ScenarioCode }) {
  const [guide, setGuide] = useState<CopilotGuide | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCopilotGuide(scenario)
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
  }, [scenario]);

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

  const steps = parseSteps(guide.action_guide);
  const doneCount = checked.filter(Boolean).length;

  return (
    <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-indigo-900">초동 조치 체크리스트</p>
        <span className="text-xs text-indigo-500">
          {doneCount}/{steps.length} 완료
        </span>
      </div>

      <ul className="space-y-2">
        {steps.map((step, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={checked[i] ?? false}
                onChange={() =>
                  setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
                }
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-indigo-300 text-indigo-600"
              />
              <span className={checked[i] ? "text-slate-400 line-through" : "text-slate-800"}>
                {step}
              </span>
            </label>
          </li>
        ))}
      </ul>

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

      <p className="mt-2 text-[11px] text-indigo-400">참고: {guide.reference}</p>
    </div>
  );
}
