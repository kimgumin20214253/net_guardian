"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSharedMultiSiteTelemetry } from "@/lib/MultiSiteTelemetryContext";
import { SEVERITY_TEXT_COLOR } from "@/lib/severityStyles";
import { withTransitions, type PointWithTransition } from "@/lib/transitions";
import type { SiteId } from "@/lib/api";

const VALID_SITE_IDS: SiteId[] = ["site-1", "site-2", "site-3"];

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

type FaultDuration = {
  siteName: string;
  startedAt: string;
  recoveredAt: string;
  durationMs: number;
};

/** fault_started -> 그 다음에 오는 recovered(같은 사이트)를 짝지어 지속시간을 구한다.
 *  아직 복구되지 않은 장애(짝이 없는 fault_started)는 포함하지 않는다 - 끝나지 않은 걸
 *  지속시간으로 보여주면 숫자를 지어내는 셈이 되기 때문이다. */
function pairFaultDurations(rows: LogRow[]): FaultDuration[] {
  const bySite = new Map<SiteId, LogRow[]>();
  for (const r of rows) {
    if (!r.transition) continue;
    const list = bySite.get(r.siteId) ?? [];
    list.push(r);
    bySite.set(r.siteId, list);
  }
  const results: FaultDuration[] = [];
  for (const [, events] of bySite) {
    const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let pendingStart: LogRow | null = null;
    for (const ev of sorted) {
      if (ev.transition === "fault_started") {
        pendingStart = ev;
      } else if (ev.transition === "recovered" && pendingStart) {
        results.push({
          siteName: ev.siteName,
          startedAt: pendingStart.timestamp,
          recoveredAt: ev.timestamp,
          durationMs: new Date(ev.timestamp).getTime() - new Date(pendingStart.timestamp).getTime(),
        });
        pendingStart = null;
      }
    }
  }
  return results.sort((a, b) => b.recoveredAt.localeCompare(a.recoveredAt));
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

// useSearchParams()(?site= 읽기)는 Suspense 경계 안에서만 프리렌더링 가능하므로 내부 컴포넌트로 분리.
export default function LogsPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm text-slate-400">불러오는 중입니다.</main>}>
      <LogsPageInner />
    </Suspense>
  );
}

function LogsPageInner() {
  const { sites, error } = useSharedMultiSiteTelemetry();

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

  // 종합 관제 화면의 "상세 →" 링크가 /logs?site=site-2로 넘어오면 그 사이트로 미리 필터링한다.
  const siteParam = useSearchParams().get("site");
  const linkedSiteId = VALID_SITE_IDS.includes(siteParam as SiteId) ? (siteParam as SiteId) : "all";

  const [severityFilter, setSeverityFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState<SiteId | "all">(linkedSiteId);
  const [keyword, setKeyword] = useState("");
  // datetime-local 입력은 "YYYY-MM-DDTHH:mm" 형식이라, 수신 데이터의 ISO timestamp와 문자열
  // 비교만으로 앞부분 15글자가 맞아떨어진다(둘 다 사전식 비교가 시간 순서와 일치하는 형식).
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [selectedRow, setSelectedRow] = useState<LogRow | null>(null);

  const filteredRows = useMemo(() => {
    return allRows.filter((p) => {
      if (siteFilter !== "all" && p.siteId !== siteFilter) return false;
      if (severityFilter === "recovered" && p.transition !== "recovered") return false;
      if (severityFilter !== "all" && severityFilter !== "recovered" && p.predicted.severity !== severityFilter)
        return false;
      if (keyword.trim() && !p.predicted.name_ko.includes(keyword.trim())) return false;
      if (fromTime && p.timestamp < fromTime) return false;
      if (toTime && p.timestamp > toTime) return false;
      return true;
    });
  }, [allRows, severityFilter, siteFilter, keyword, fromTime, toTime]);

  const faultDurations = useMemo(() => pairFaultDurations(filteredRows), [filteredRows]);

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
        <input
          type="datetime-local"
          value={fromTime}
          onChange={(e) => setFromTime(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
        />
        <span className="text-xs text-slate-500">~</span>
        <input
          type="datetime-local"
          value={toTime}
          onChange={(e) => setToTime(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
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

      {/* fault_started -> recovered 페어링으로 지속시간 계산 (완료된 구간만) */}
      {faultDurations.length > 0 && (
        <div className="mb-4 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-700">
          <h2 className="mb-2 text-sm font-semibold text-white">장애 지속시간 요약 (복구 완료된 구간만)</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {faultDurations.slice(0, 10).map((d, i) => (
              <span key={i} className="rounded-full bg-slate-900 px-2.5 py-1 text-slate-300 ring-1 ring-slate-700">
                {d.siteName} · {d.startedAt.slice(11, 19)}→{d.recoveredAt.slice(11, 19)} · {formatDuration(d.durationMs)}
              </span>
            ))}
          </div>
        </div>
      )}

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
                  onClick={() => setSelectedRow(p)}
                  className={`cursor-pointer border-b border-slate-800 hover:bg-slate-700/50 ${p.transition ? "bg-slate-700/30 font-medium" : ""}`}
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

      {/* 행 클릭 상세 모달 */}
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-slate-800 p-6 shadow-xl ring-1 ring-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-lg font-semibold text-white">이벤트 상세</h3>
            <div className="space-y-1.5 text-sm text-slate-300">
              <p>시간: {selectedRow.timestamp}</p>
              <p>사이트: {selectedRow.siteName}</p>
              <p>AI 진단: {selectedRow.predicted.name_ko}</p>
              <p className={SEVERITY_TEXT_COLOR[selectedRow.predicted.severity]}>레벨: {levelFor(selectedRow)}</p>
              <p>RTT: {selectedRow.rtt.toFixed(1)}ms</p>
              <p>Packet Loss: {selectedRow.loss_flag}</p>
              <p>Jitter: {selectedRow.jitter.toFixed(1)}ms</p>
              {selectedRow.transition && (
                <p className={selectedRow.transition === "recovered" ? "text-emerald-400" : "text-red-400"}>
                  변화: {selectedRow.transition === "recovered" ? "✅ 정상 복구" : "🚨 장애 발생"}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedRow(null)}
              className="mt-4 w-full rounded-md py-2 text-sm text-slate-500 hover:text-slate-300"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
