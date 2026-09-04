"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TelemetryPoint } from "@/lib/api";

function toChartData(points: TelemetryPoint[]) {
  return points.map((p) => ({
    time: p.timestamp.slice(11, 19) || p.timestamp,
    rtt: p.rtt,
    loss_flag: p.loss_flag,
    jitter: p.jitter,
  }));
}

export default function TrafficChart({ points }: { points: TelemetryPoint[] }) {
  const data = toChartData(points);

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
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
