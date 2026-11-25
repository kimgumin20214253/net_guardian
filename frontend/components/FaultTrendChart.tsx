"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import type { SiteState } from "@/lib/useMultiSiteTelemetry";
import { withTransitions } from "@/lib/transitions";
import { SCENARIO_NAME_KO, SCENARIO_TEXT, LABEL_TO_SCENARIO } from "@/lib/scenarioStyles";
import type { ScenarioCode } from "@/lib/api";

const AXIS_TICK = { fontSize: 12, fill: "#94a3b8" };
const GRID_STROKE = "#334155";
const TOOLTIP_STYLE = { fontSize: 13, background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0" };
const LEGEND_STYLE = { fontSize: 13, color: "#cbd5e1" };

function toMinuteBucket(timestamp: string) {
  return timestamp.slice(11, 16) || timestamp;
}

/** 3개 사이트의 실제 주입 시나리오(true_label) 전환 이벤트를 분 단위로 집계해 장애 발생/복구
 *  추이를 보여준다. 백엔드에 별도 이벤트 저장소가 없으므로, 이미 공유 폴링으로 받아둔
 *  points(최근 최대 200건)에서만 계산한다 - 그 창을 벗어난 과거 이력은 보여줄 수 없다. */
export default function FaultTrendChart({ sites }: { sites: SiteState[] | null }) {
  const events = (sites ?? []).flatMap((site) =>
    withTransitions(site.telemetry?.points ?? [])
      .filter((p) => p.transition)
      .map((p) => ({
        bucket: toMinuteBucket(p.timestamp),
        transition: p.transition,
        scenario: p.true_label !== null ? LABEL_TO_SCENARIO[p.true_label] : null,
      }))
  );

  if (!sites || events.length === 0) {
    return (
      <div className="rounded-lg bg-slate-900 p-6 text-center text-sm text-slate-400 ring-1 ring-slate-800">
        {sites ? "최근 수집 데이터 안에서는 장애 발생/복구 이벤트가 없습니다." : "불러오는 중입니다."}
      </div>
    );
  }

  const buckets = new Map<string, { bucket: string; 장애발생: number; 정상복구: number }>();
  for (const ev of events) {
    const row = buckets.get(ev.bucket) ?? { bucket: ev.bucket, 장애발생: 0, 정상복구: 0 };
    if (ev.transition === "fault_started") row.장애발생 += 1;
    if (ev.transition === "recovered") row.정상복구 += 1;
    buckets.set(ev.bucket, row);
  }
  const data = Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

  const byType: Record<ScenarioCode, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const ev of events) {
    if (ev.transition === "fault_started" && ev.scenario) byType[ev.scenario] += 1;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="bucket" tick={AXIS_TICK} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Bar dataKey="장애발생" fill="#f87171" radius={[3, 3, 0, 0]} />
          <Bar dataKey="정상복구" fill="#34d399" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className="text-slate-500">장애유형별 발생 현황:</span>
        {(["B", "C", "D"] as ScenarioCode[]).map((code) => (
          <span key={code} className={`font-medium ${SCENARIO_TEXT[code]}`}>
            {SCENARIO_NAME_KO[code]} {byType[code]}건
          </span>
        ))}
      </div>
    </div>
  );
}
