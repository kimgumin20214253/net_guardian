"use client";

import { useMemo, useState } from "react";
import { useMultiSiteTelemetry } from "@/lib/useMultiSiteTelemetry";
import { SEVERITY_TEXT_COLOR } from "@/lib/severityStyles";
import { withTransitions, type PointWithTransition } from "@/lib/transitions";
import type { SiteId } from "@/lib/api";

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

type LogRow = PointWithTransition & { siteId: SiteId; siteName: string };

function levelFor(p: LogRow) {
  return p.transition === "recovered" ? "RECOVERED" : LEVEL_BY_SEVERITY[p.predicted.severity];
}

function toCsv(rows: LogRow[]) {
  const header = "timestamp,site,name_ko,severity,level,rtt,loss_flag,jitter,transition";
  const lines = rows.map((p) =>
    [
      p.timestamp,
      p.siteName,
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
  const { sites, error } = useMultiSiteTelemetry(200);

  const allRows: LogRow[] = useMemo(() => {
    if (!sites) return [];
    return sites
      .flatMap((s) =>
        withTransitions(s.telemetry?.points ?? []).map((p) => ({
          ...p,
          siteId: s.info.id,
          siteName: s.info.name,
        }))
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [sites]);

  const [severityFilter, setSeverityFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState<SiteId | "all">("all");
  const [keyword, setKeyword] = useState("");

  const filteredRows = useMemo(() => {
    return allRows.filter((p) => {
      if (siteFilter !== "all" && p.siteId !== siteFilter) return false;
      if (severityFilter === "recovered" && p.transition !== "recovered") return false;
      if (severityFilter !== "all" && severityFilter !== "recovered" && p.predicted.severity !== severityFilter)
        return false;
      if (keyword.trim() && !p.predicted.name_ko.includes(keyword.trim())) return false;
      return true;
    });
  }, [allRows, severityFilter, siteFilter, keyword]);

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
    <main className="p-8 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-white">📋 이벤트 이력</h1>
      <p className="mb-6 text-sm text-slate-400">
        3개 사이트의 최근 진단 이력입니다. 상태가 바뀌는 시점(실제 주입된 시나리오 기준)은
        &quot;🚨 장애 발생&quot; / &quot;✅ 정상 복구&quot;로 자동 표시됩니다. &quot;레벨&quot;은
        AI가 그 샘플 1건을 본 순간 판단입니다.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* 필터 툴바 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-800 p-3 ring-1 ring-slate-700">
        <select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value as SiteId | "all")}
          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="all">전체 사이트</option>
          {(sites ?? []).map((s) => (
            <option key={s.info.id} value={s.info.id}>
              {s.info.name}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
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
          className="min-w-[180px] flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500"
        />
        <span className="text-xs text-slate-500">{filteredRows.length}건</span>
        <button
          onClick={exportCsv}
          disabled={filteredRows.length === 0}
          className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          CSV 내보내기
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg bg-slate-800 p-6 ring-1 ring-slate-700">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="p-2 text-left">시간</th>
              <th className="p-2 text-left">사이트</th>
              <th className="p-2 text-left">AI 진단</th>
              <th className="p-2 text-left">레벨</th>
              <th className="p-2 text-left">변화</th>
            </tr>
          </thead>
          <tbody>
            {!sites && (
              <tr>
                <td colSpan={5} className="p-2 text-center text-slate-500">
                  사이트 목록을 불러오는 중입니다.
                </td>
              </tr>
            )}
            {sites && filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-2 text-center text-slate-500">
                  조건에 맞는 로그가 없습니다.
                </td>
              </tr>
            )}
            {[...filteredRows]
              .slice(-50)
              .reverse()
              .map((p, i) => (
                <tr
                  key={`${p.siteId}-${p.timestamp}-${i}`}
                  className={`border-b border-slate-800 ${p.transition ? "bg-slate-700/30 font-medium" : ""}`}
                >
                  <td className="p-2 text-slate-300">{p.timestamp}</td>
                  <td className="p-2 text-slate-300">{p.siteName}</td>
                  <td className="p-2 text-slate-200">{p.predicted.name_ko}</td>
                  <td className={`p-2 ${SEVERITY_TEXT_COLOR[p.predicted.severity]}`}>{levelFor(p)}</td>
                  <td className="p-2">
                    {p.transition === "recovered" && (
                      <span className="text-emerald-400">✅ 정상 복구</span>
                    )}
                    {p.transition === "fault_started" && (
                      <span className="text-red-400">🚨 장애 발생</span>
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
