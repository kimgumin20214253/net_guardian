"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { SCENARIO_NAME_KO } from "@/lib/scenarioStyles";
import type { ScenarioCode, SiteEvent } from "@/lib/api";

const COLORS: Record<ScenarioCode, string> = {
  A: "#34d399", B: "#fbbf24", C: "#f87171", D: "#a78bfa",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 백엔드가 영구 기록한 이벤트(GET /events, 실제 timestamp)에서 최근 24시간 fault_started를
 *  시나리오별로 집계한다. 서버가 24시간 내내 떠 있지 않았다면 그만큼만 집계되는 게 맞다 -
 *  돌지 않은 시간을 지어내 채우지 않는다. */
export default function FaultTypeDonut({ events }: { events: SiteEvent[] | null }) {
  // 렌더 중 Date.now()를 직접 호출할 수 없어(react-hooks/purity), 마운트 시점 한 번만 고정한다 -
  // "최근 24시간" 판정 기준이 이 화면을 연 시점이 되는 것이라 실용적으로 충분하다.
  const [since] = useState(() => Date.now() - DAY_MS);

  if (!events) {
    return <p className="text-sm text-slate-400">불러오는 중입니다.</p>;
  }
  const recentFaults = events.filter((ev) => {
    if (ev.type !== "fault_started") return false;
    const t = new Date(ev.timestamp.replace(" ", "T")).getTime();
    return !Number.isNaN(t) && t >= since;
  });

  if (recentFaults.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="text-sm text-slate-400">최근 24시간 내 장애 발생 기록이 없습니다.</p>
      </div>
    );
  }

  const counts: Partial<Record<ScenarioCode, number>> = {};
  for (const ev of recentFaults) counts[ev.scenario] = (counts[ev.scenario] ?? 0) + 1;
  const total = recentFaults.length;
  const data = (Object.entries(counts) as [ScenarioCode, number][])
    .map(([scenario, count]) => ({ scenario, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="flex h-full flex-col items-center">
      <div className="relative h-[140px] w-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="scenario" innerRadius={44} outerRadius={64} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.scenario} fill={COLORS[d.scenario]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0" }}
              formatter={(value, _name, item) => {
                const payload = (item as { payload?: { pct: number; scenario: ScenarioCode } })?.payload;
                return [`${value}건 (${payload?.pct ?? 0}%)`, SCENARIO_NAME_KO[payload?.scenario ?? "B"]];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{total}</span>
          <span className="text-[10px] text-slate-400">총 발생</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
        {data.map((d) => (
          <span key={d.scenario} className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS[d.scenario] }} />
            {SCENARIO_NAME_KO[d.scenario]} {d.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}
