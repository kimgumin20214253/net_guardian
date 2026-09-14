"use client";

import { useMemo, useState } from "react";
import { useTelemetry } from "@/lib/TelemetryContext";
import { SEVERITY_TEXT_COLOR } from "@/lib/severityStyles";
import { withTransitions, type PointWithTransition } from "@/lib/transitions";

const LEVEL_BY_SEVERITY: Record<string, string> = {
  ok: "INFO",
  warning: "WARN",
  danger: "DANGER",
  critical: "CRITICAL",
};

const SEVERITY_FILTERS = [
  { value: "all", label: "전체" },
  { value: "ok", label: "INFO" },
  { value: "warning", label: "WARN" },
  { value: "danger", label: "DANGER" },
  { value: "critical", label: "CRITICAL" },
  { value: "recovered", label: "RECOVERED" },
];

function levelFor(p: PointWithTransition) {
  return p.transition === "recovered" ? "RECOVERED" : LEVEL_BY_SEVERITY[p.predicted.severity];
}

function toCsv(rows: PointWithTransition[]) {
  const header = "timestamp,name_ko,severity,level,rtt,loss_flag,jitter,transition";
  const lines = rows.map((p) =>
    [
      p.timestamp,
      p.predicted.name_ko,
      p.predicted.severity,
      levelFor(p),
      p.rtt,
      p.loss_flag,
      p.jitter,
      p.transition ?? "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

export default function LogsPage() {
  const { data, error } = useTelemetry();
  const points = data?.points ?? [];
  const allRows = withTransitions(points);

  const [severityFilter, setSeverityFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const filteredRows = useMemo(() => {
    return allRows.filter((p) => {
      if (severityFilter === "recovered" && p.transition !== "recovered") return false;
      if (severityFilter !== "all" && severityFilter !== "recovered" && p.predicted.severity !== severityFilter)
        return false;
      if (keyword.trim() && !p.predicted.name_ko.includes(keyword.trim())) return false;
      return true;
    });
  }, [allRows, severityFilter, keyword]);

  function exportCsv() {
    const csv = toCsv(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `net_guardian_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="p-8">
      <h1 className="mb-2 text-3xl font-bold">이벤트 로그</h1>
      <p className="mb-6 text-sm text-gray-500">
        최근 진단 이력입니다. 상태가 바뀌는 시점은 "🚨 장애 발생" / "✅ 정상 복구"로 자동 표시됩니다.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* 필터 툴바 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {SEVERITY_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="진단명 검색 (예: 지연 장애)"
          className="flex-1 min-w-[180px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-gray-400">{filteredRows.length}건</span>
        <button
          onClick={exportCsv}
          disabled={filteredRows.length === 0}
          className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          CSV 내보내기
        </button>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">시간</th>
              <th className="p-2 text-left">AI 진단</th>
              <th className="p-2 text-left">레벨</th>
              <th className="p-2 text-left">변화</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-2 text-center text-gray-400">
                  조건에 맞는 로그가 없습니다.
                </td>
              </tr>
            )}
            {[...filteredRows]
              .slice(-50)
              .reverse()
              .map((p, i) => (
                <tr
                  key={`${p.timestamp}-${i}`}
                  className={`border-b ${p.transition ? "bg-slate-50 font-medium" : ""}`}
                >
                  <td className="p-2">{p.timestamp}</td>
                  <td className="p-2">{p.predicted.name_ko}</td>
                  <td className={`p-2 ${SEVERITY_TEXT_COLOR[p.predicted.severity]}`}>{levelFor(p)}</td>
                  <td className="p-2">
                    {p.transition === "recovered" && (
                      <span className="text-green-600">✅ 정상 복구</span>
                    )}
                    {p.transition === "fault_started" && (
                      <span className="text-red-600">🚨 장애 발생</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
