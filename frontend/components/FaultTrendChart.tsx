"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import { SCENARIO_NAME_KO, SCENARIO_TEXT } from "@/lib/scenarioStyles";
import type { ScenarioCode, SiteEvent } from "@/lib/api";

const AXIS_TICK = { fontSize: 12, fill: "#94a3b8" };
const GRID_STROKE = "#334155";
const TOOLTIP_STYLE = { fontSize: 13, background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0" };
const LEGEND_STYLE = { fontSize: 13, color: "#cbd5e1" };

function toMinuteBucket(timestamp: string) {
  return timestamp.slice(11, 16) || timestamp;
}

/** 백엔드가 영구 기록한 장애 발생/복구 이벤트(GET /events)를 분 단위로 집계해 추이를 보여준다.
 *  이전엔 폴링 창(최근 N건, 실제로는 20~60초 분량)에서 추론해서 금방 사라지는 문제가 있었는데,
 *  이제는 백엔드가 전환 순간에 직접 기록한 데이터라 폴링 창 크기와 무관하게 계속 남아있다. */
export default function FaultTrendChart({ events }: { events: SiteEvent[] | null }) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-lg bg-slate-900 p-6 text-center text-sm text-slate-400 ring-1 ring-slate-800">
        {events ? "장애 발생/복구 이벤트가 아직 없습니다." : "불러오는 중입니다."}
      </div>
    );
  }

  const buckets = new Map<string, { bucket: string; 장애발생: number; 정상복구: number }>();
  for (const ev of events) {
    const bucket = toMinuteBucket(ev.timestamp);
    const row = buckets.get(bucket) ?? { bucket, 장애발생: 0, 정상복구: 0 };
    if (ev.type === "fault_started") row.장애발생 += 1;
    if (ev.type === "recovered") row.정상복구 += 1;
    buckets.set(bucket, row);
  }
  const data = Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

  const byType: Record<ScenarioCode, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const ev of events) {
    if (ev.type === "fault_started") byType[ev.scenario] += 1;
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
