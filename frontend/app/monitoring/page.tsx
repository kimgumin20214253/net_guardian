"use client";

import { useTelemetry } from "@/lib/TelemetryContext";
import TrafficChart from "@/components/TrafficChart";

export default function MonitoringPage() {
  const { data, error, lastInjectionTime } = useTelemetry();
  const points = data?.points ?? [];

  return (
    <main className="p-8">
      <h1 className="mb-2 text-3xl font-bold">실시간 모니터링</h1>
      <p className="mb-6 text-sm text-gray-500">
        RTT · 손실 · 지터 추이를 3초 간격으로 갱신합니다. 그래프가 요동치기 시작하면 장애가 진행 중이라는
        뜻이며, 원인 유형은 개요 화면의 AI 진단을 확인하세요.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <TrafficChart points={points} injectionTime={lastInjectionTime} />
    </main>
  );
}
