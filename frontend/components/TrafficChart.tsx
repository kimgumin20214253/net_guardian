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

const data = [
  { time: "14:00", rtt: 20, packetLoss: 0, throughput: 98 },
  { time: "14:01", rtt: 25, packetLoss: 0, throughput: 95 },
  { time: "14:02", rtt: 40, packetLoss: 1, throughput: 90 },
  { time: "14:03", rtt: 80, packetLoss: 3, throughput: 75 },
  { time: "14:04", rtt: 150, packetLoss: 8, throughput: 55 },
  { time: "14:05", rtt: 45, packetLoss: 1, throughput: 92 },
];

export default function TrafficChart() {
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
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="packetLoss"
              name="Packet Loss (%)"
              stroke="#f59e0b"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Throughput */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-4 font-bold">Throughput 그래프</h2>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="throughput"
              name="Throughput (Mbps)"
              stroke="#22c55e"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}