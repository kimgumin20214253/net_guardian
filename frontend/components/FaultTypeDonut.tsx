"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { SCENARIO_NAME_KO } from "@/lib/scenarioStyles";
import { fetchEventsSince, type ScenarioCode, type SiteEvent } from "@/lib/api";

const COLORS: Record<ScenarioCode, string> = {
  A: "#34d399", B: "#fbbf24", C: "#f87171", D: "#a78bfa",
};

const REFRESH_MS = 30_000;

/** 백엔드가 영구 기록한 이벤트에서 최근 24시간 fault_started를 시나리오별로 집계한다. 서버가
 *  24시간 내내 떠 있지 않았다면 그만큼만 집계되는 게 맞다 - 돌지 않은 시간을 지어내 채우지
 *  않는다. 다른 화면이 공유하는 "최근 limit건" 폴링(useSharedMultiSiteTelemetry)은 쓰지 않고
 *  직접 /events?hours=24를 호출한다 - 활동이 많은 환경(예: 오래 켜둔 인스턴스)에서는 건수 제한
 *  때문에 아직 진행 중인 오래된 장애의 시작 기록이 "최근 limit건" 밖으로 밀려나 24시간 집계가
 *  조용히 틀려지는 문제가 있었다(사용자 제보, 재현 확인). */
export default function FaultTypeDonut() {
  const [events, setEvents] = useState<SiteEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchEventsSince(24)
        .then((res) => {
          if (cancelled) return;
          setEvents(res.events);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (failed) {
    return <p className="text-sm text-slate-400">장애 유형 통계를 불러올 수 없습니다.</p>;
  }
  if (!events) {
    return <p className="text-sm text-slate-400">불러오는 중입니다.</p>;
  }
  const recentFaults = events.filter((ev) => ev.type === "fault_started");

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
