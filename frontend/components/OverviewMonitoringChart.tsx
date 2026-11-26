"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer } from "recharts";
import type { SiteState } from "@/lib/useMultiSiteTelemetry";
import { RTO_MIN_MS } from "@/lib/rtoEstimate";

const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };
const GRID_STROKE = "#334155";
const TOOLTIP_STYLE = { fontSize: 12, background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0" };

// 사이트별 고정 색(지금은 site-1/2/3로 순서가 고정이라 index로 매핑한다).
const SITE_COLORS = ["#60a5fa", "#fbbf24", "#fb7185"];

function toClock(ts: string) {
  return ts.slice(11, 19) || ts;
}

/** 3개 사이트를 각각 독립적으로 폴링하므로 같은 인덱스의 샘플이 정확히 같은 순간이라는
 *  보장은 없다 - "실시간 모니터링" 상세 화면(사이트별 정밀 비교)과 달리, 여기서는 "한눈에
 *  보는 개요"로만 쓴다. x축 라벨은 가장 데이터가 많은 사이트의 타임스탬프를 그대로 쓴다. */
function buildSeries(sites: SiteState[], pointCount: number, metric: "rtt" | "loss_flag" | "jitter") {
  const slices = sites.map((s) => (s.telemetry?.points ?? []).slice(-pointCount));
  const maxLen = Math.max(0, ...slices.map((s) => s.length));
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < maxLen; i++) {
    const row: Record<string, string | number> = {};
    let label: string | null = null;
    slices.forEach((points, si) => {
      const idx = points.length - maxLen + i;
      const p = idx >= 0 ? points[idx] : undefined;
      if (p) {
        row[`s${si}`] = p[metric];
        label = label ?? toClock(p.timestamp);
      }
    });
    row.time = label ?? String(i);
    rows.push(row);
  }
  return rows;
}

function MiniChart({
  sites,
  pointCount,
  metric,
  title,
  color,
  domain,
  showRtoLine,
}: {
  sites: SiteState[];
  pointCount: number;
  metric: "rtt" | "loss_flag" | "jitter";
  title: string;
  color: string;
  domain?: [number, number];
  showRtoLine?: boolean;
}) {
  const data = buildSeries(sites, pointCount, metric);
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-400">{title}</p>
      <ResponsiveContainer width="100%" height={92}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="time" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={AXIS_TICK} domain={domain} width={34} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          {showRtoLine && (
            <ReferenceLine y={RTO_MIN_MS} stroke="#64748b" strokeDasharray="2 2" />
          )}
          {sites.map((site, i) => (
            <Line
              key={site.info.id}
              type="monotone"
              dataKey={`s${i}`}
              name={site.info.name.split(" - ")[0] ?? site.info.name}
              stroke={SITE_COLORS[i] ?? color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function OverviewMonitoringChart({
  sites,
  pointCount,
}: {
  sites: SiteState[] | null;
  pointCount: number;
}) {
  if (!sites || sites.length === 0) {
    return <p className="text-sm text-slate-400">불러오는 중입니다.</p>;
  }

  return (
    <div className="space-y-3">
      <MiniChart sites={sites} pointCount={pointCount} metric="rtt" title="RTT (ms)" color="#f87171" showRtoLine />
      <MiniChart sites={sites} pointCount={pointCount} metric="loss_flag" title="Packet Loss (0/1)" color="#fbbf24" domain={[0, 1]} />
      <MiniChart sites={sites} pointCount={pointCount} metric="jitter" title="Jitter (ms)" color="#4ade80" />
      <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
        {sites.map((site, i) => (
          <span key={site.info.id} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: SITE_COLORS[i] }} />
            {site.info.name.split(" - ")[0] ?? site.info.name}
          </span>
        ))}
      </div>
    </div>
  );
}
