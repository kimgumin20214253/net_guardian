"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Brush,
  ResponsiveContainer,
} from "recharts";
import type { TelemetryPoint } from "@/lib/api";

// backend/fault_tiers.py의 RTO_MIN_MS와 같은 값(RFC 6298 RTO 최소값). 실제 RTO는 그 사이트의
// SRTT/RTTVAR에 따라 이보다 커질 수 있으므로, 이 선은 "장애 기준선"이 아니라 "재전송 추정이
// 걸릴 수 있는 최소 임계치"다 - RTT가 이 선을 넘는다고 바로 장애인 것은 아니다.
const RTO_MIN_MS = 200;

function toChartTime(timestamp: string) {
  return timestamp.slice(11, 19) || timestamp;
}

function toChartData(points: TelemetryPoint[]) {
  return points.map((p) => ({
    time: toChartTime(p.timestamp),
    rtt: p.rtt,
    loss_flag: p.loss_flag,
    jitter: p.jitter,
  }));
}

// 다크 네이비 배경(대시보드 공통 테마)에서 축/격자가 잘 보이도록 하는 공용 톤
const AXIS_TICK = { fontSize: 13, fill: "#94a3b8" }; // slate-400
const GRID_STROKE = "#334155"; // slate-700
const TOOLTIP_STYLE = { fontSize: 13, background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0" };
const LEGEND_STYLE = { fontSize: 13, color: "#cbd5e1" };

export default function TrafficChart({
  points,
  injectionTime,
}: {
  points: TelemetryPoint[];
  /** 시나리오를 주입한 시각(원본 timestamp 형식). 넘기면 그래프에 "주입 시점" 세로선을 표시한다. */
  injectionTime?: string | null;
}) {
  const data = toChartData(points);
  const injectionX = injectionTime ? toChartTime(injectionTime) : null;
  // 폴링 윈도우(최근 50건)에서 이미 밀려나간 주입 시점은 표시하지 않는다 (엉뚱한 위치에 선이 남는 것 방지)
  const showInjectionLine = injectionX !== null && data.some((d) => d.time === injectionX);

  if (data.length === 0) {
    return (
      <div className="rounded-lg bg-slate-800 p-6 text-center text-slate-400 ring-1 ring-slate-700">
        표시할 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* RTT */}
      <div className="rounded-lg bg-slate-800 p-4 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-bold text-slate-100">RTT 실시간 그래프</h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="time" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line
              type="monotone"
              dataKey="rtt"
              name="RTT (ms)"
              stroke="#f87171"
              strokeWidth={3}
              dot={false}
            />
            <ReferenceLine
              y={RTO_MIN_MS}
              stroke="#64748b"
              strokeDasharray="2 2"
              label={{ value: `RTO 최소 임계치 ${RTO_MIN_MS}ms`, position: "insideTopRight", fill: "#94a3b8", fontSize: 11 }}
            />
            {showInjectionLine && (
              <ReferenceLine x={injectionX!} stroke="#818cf8" strokeDasharray="4 4" label={{ value: "주입", position: "insideTopLeft", fill: "#818cf8", fontSize: 11 }} />
            )}
            <Brush dataKey="time" height={20} stroke="#475569" fill="#1e293b" travellerWidth={8} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Packet Loss */}
      <div className="rounded-lg bg-slate-800 p-4 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-bold text-slate-100">Packet Loss 그래프</h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="time" tick={AXIS_TICK} />
            <YAxis domain={[0, 1]} ticks={[0, 1]} tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line
              type="stepAfter"
              dataKey="loss_flag"
              name="Packet Loss (0/1)"
              stroke="#fbbf24"
              strokeWidth={3}
              dot={false}
            />
            {showInjectionLine && (
              <ReferenceLine x={injectionX!} stroke="#818cf8" strokeDasharray="4 4" label={{ value: "주입", position: "insideTopLeft", fill: "#818cf8", fontSize: 11 }} />
            )}
            <Brush dataKey="time" height={20} stroke="#475569" fill="#1e293b" travellerWidth={8} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Jitter */}
      <div className="rounded-lg bg-slate-800 p-4 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-bold text-slate-100">Jitter 그래프</h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="time" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line
              type="monotone"
              dataKey="jitter"
              name="Jitter (ms)"
              stroke="#4ade80"
              strokeWidth={3}
              dot={false}
            />
            {showInjectionLine && (
              <ReferenceLine x={injectionX!} stroke="#818cf8" strokeDasharray="4 4" label={{ value: "주입", position: "insideTopLeft", fill: "#818cf8", fontSize: 11 }} />
            )}
            <Brush dataKey="time" height={20} stroke="#475569" fill="#1e293b" travellerWidth={8} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
