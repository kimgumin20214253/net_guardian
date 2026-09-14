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
  ResponsiveContainer,
} from "recharts";
import type { TelemetryPoint } from "@/lib/api";

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
      <div className="rounded-lg bg-white p-6 text-center text-gray-500 shadow">
        표시할 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* RTT */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-4 font-bold">RTT 실시간 그래프</h2>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="rtt"
              name="RTT (ms)"
              stroke="#ef4444"
              strokeWidth={3}
              dot={false}
            />
            {showInjectionLine && (
              <ReferenceLine x={injectionX!} stroke="#6366f1" strokeDasharray="4 4" label={{ value: "주입", position: "insideTopLeft", fill: "#6366f1", fontSize: 11 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Packet Loss */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-4 font-bold">Packet Loss 그래프</h2>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis domain={[0, 1]} ticks={[0, 1]} />
            <Tooltip />
            <Legend />
            <Line
              type="stepAfter"
              dataKey="loss_flag"
              name="Packet Loss (0/1)"
              stroke="#f59e0b"
              strokeWidth={3}
              dot={false}
            />
            {showInjectionLine && (
              <ReferenceLine x={injectionX!} stroke="#6366f1" strokeDasharray="4 4" label={{ value: "주입", position: "insideTopLeft", fill: "#6366f1", fontSize: 11 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Jitter */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-4 font-bold">Jitter 그래프</h2>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="jitter"
              name="Jitter (ms)"
              stroke="#22c55e"
              strokeWidth={3}
              dot={false}
            />
            {showInjectionLine && (
              <ReferenceLine x={injectionX!} stroke="#6366f1" strokeDasharray="4 4" label={{ value: "주입", position: "insideTopLeft", fill: "#6366f1", fontSize: 11 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
