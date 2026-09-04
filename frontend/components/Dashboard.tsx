"use client";

import { useEffect, useState } from "react";
import TrafficChart from "@/components/TrafficChart";
import { fetchTelemetry, type TelemetryResponse, type Severity } from "@/lib/api";

const POLL_INTERVAL_MS = 3000;

const SEVERITY_TEXT_COLOR: Record<Severity, string> = {
  ok: "text-green-600",
  warning: "text-yellow-600",
  danger: "text-red-600",
  critical: "text-purple-600",
};

const SEVERITY_BORDER_COLOR: Record<Severity, string> = {
  ok: "border-green-500",
  warning: "border-yellow-500",
  danger: "border-red-500",
  critical: "border-purple-500",
};

const SEVERITY_BG_COLOR: Record<Severity, string> = {
  ok: "bg-green-50",
  warning: "bg-yellow-50",
  danger: "bg-red-50",
  critical: "bg-purple-50",
};

export default function Dashboard({ initial }: { initial: TelemetryResponse | null }) {
  const [data, setData] = useState<TelemetryResponse | null>(initial);
  const [error, setError] = useState<string | null>(
    initial ? null : "API 서버(localhost:8000)에 연결할 수 없습니다. backend/api 서버를 먼저 실행하세요."
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchTelemetry(50);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("API 서버(localhost:8000)에 연결할 수 없습니다. backend/api 서버를 먼저 실행하세요.");
        }
      }
    }

    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const points = data?.points ?? [];
  const latest = points[points.length - 1];

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <h1 className="mb-2 text-4xl font-bold">산업 네트워크 장애 대응 시스템</h1>

      {data && (
        <p className="mb-6 text-sm text-gray-500">
          데이터 소스: {data.source === "live" ? "실시간 수집 (data/net_guardian_scenario_dataset.csv)" : "데모 샘플 (raw_dataset_20260904, 실시간 수집 시작 전)"}
        </p>
      )}

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* 상태 카드 */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">시스템 상태</h2>
          <div className={`text-2xl font-bold ${latest ? SEVERITY_TEXT_COLOR[latest.predicted.severity] : "text-gray-400"}`}>
            {latest ? latest.predicted.name_ko : "데이터 없음"}
          </div>
          <p className="mt-2 text-gray-600">
            {latest && latest.predicted.severity === "ok" ? "PLC 제어 명령 정상 처리" : "점검이 필요할 수 있습니다"}
          </p>
        </div>

        {/* RTT 카드 */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">현재 RTT</h2>
          <div className="text-3xl font-bold">
            {latest ? `${latest.rtt.toFixed(1)} ms` : "-"}
          </div>
          <p className="mt-2 text-gray-600">
            {latest ? `Jitter ${latest.jitter.toFixed(1)} ms · Loss ${latest.loss_flag}` : ""}
          </p>
        </div>

        {/* AI 예측 */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">AI 결과</h2>
          <div className={`text-2xl font-bold ${latest ? SEVERITY_TEXT_COLOR[latest.predicted.severity] : "text-gray-400"}`}>
            {latest ? latest.predicted.name_ko : "-"}
          </div>
          <p className="mt-2 text-gray-600">
            {latest && latest.predicted.probabilities
              ? `신뢰도 ${(latest.predicted.probabilities[String(latest.predicted.label)] * 100).toFixed(1)}%`
              : ""}
          </p>
        </div>
      </div>

      {/* 대응 가이드 */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-2xl font-bold">실시간 대응 가이드</h2>
        <div
          className={`rounded-md border-l-4 p-4 ${
            latest ? SEVERITY_BORDER_COLOR[latest.predicted.severity] : "border-gray-300"
          } ${latest ? SEVERITY_BG_COLOR[latest.predicted.severity] : "bg-gray-50"}`}
        >
          <p className="font-semibold">논문 기반 운영 가이드</p>
          <p className="mt-2">{latest ? latest.predicted.action_guide : "데이터를 기다리는 중입니다."}</p>
        </div>
      </div>

      {/* 실시간 네트워크 모니터링 */}
      <div className="mt-8">
        <TrafficChart points={points} />
      </div>

      {/* 로그 영역 */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-2xl font-bold">이벤트 로그</h2>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">시간</th>
              <th className="p-2 text-left">AI 진단</th>
              <th className="p-2 text-left">상태</th>
            </tr>
          </thead>

          <tbody>
            {points.length === 0 && (
              <tr>
                <td colSpan={3} className="p-2 text-center text-gray-400">
                  로그가 없습니다.
                </td>
              </tr>
            )}
            {[...points]
              .slice(-10)
              .reverse()
              .map((p, i) => (
                <tr key={`${p.timestamp}-${i}`} className="border-b">
                  <td className="p-2">{p.timestamp}</td>
                  <td className="p-2">{p.predicted.name_ko}</td>
                  <td className={`p-2 ${SEVERITY_TEXT_COLOR[p.predicted.severity]}`}>
                    {p.predicted.severity}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
