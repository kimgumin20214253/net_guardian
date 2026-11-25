"use client";

import { useState } from "react";
import { useSharedMultiSiteTelemetry } from "@/lib/MultiSiteTelemetryContext";
import { SCENARIO_NAME_KO, SCENARIO_BADGE, SCENARIO_DOT } from "@/lib/scenarioStyles";
import TrafficChart from "@/components/TrafficChart";
import type { SiteId } from "@/lib/api";

const POINT_COUNT_OPTIONS = [50, 100, 200];

export default function MonitoringPage() {
  // 레이아웃이 이미 받아온 데이터를 공유한다 - "최근 N건"은 그 안에서 화면에 보여줄 범위만 자른다.
  const { sites, error } = useSharedMultiSiteTelemetry();
  const [pointCount, setPointCount] = useState(50);
  const [activeSiteId, setActiveSiteId] = useState<SiteId | null>(null);

  const resolvedSiteId = activeSiteId ?? sites?.[0]?.info.id ?? null;
  const activeSite = (sites ?? []).find((s) => s.info.id === resolvedSiteId) ?? null;
  const points = (activeSite?.telemetry?.points ?? []).slice(-pointCount);
  const latest = points[points.length - 1];

  return (
    <main className="p-8 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-white">📡 실시간 모니터링</h1>
      <p className="mb-6 text-sm text-slate-400">
        RTT · 손실 · 지터 추이를 3초 간격으로 갱신합니다. 그래프가 요동치기 시작하면 장애가
        진행 중이라는 뜻이며, 정확한 장애 유형은 사이트 배지(실제 주입된 시나리오 기준)를
        확인하세요.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* 사이트 전환 + 최근 측정값 + 데이터 수신 상태 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-700">
        <div className="flex gap-1 rounded-md bg-slate-900 p-1 ring-1 ring-slate-700">
          {(sites ?? []).map((site) => (
            <button
              key={site.info.id}
              onClick={() => setActiveSiteId(site.info.id)}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
                resolvedSiteId === site.info.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${SCENARIO_DOT[site.info.scenario]}`} />
              {site.info.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {activeSite && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SCENARIO_BADGE[activeSite.info.scenario]}`}>
              {SCENARIO_NAME_KO[activeSite.info.scenario]}
            </span>
          )}
          <span className="text-xs text-slate-500">
            {activeSite?.telemetry?.source === "live" ? "🟢 실시간 수신 중" : activeSite?.telemetry?.source === "demo" ? "⚪ 데모 데이터" : "-"}
          </span>
          <div className="flex gap-1 rounded-md bg-slate-900 p-1 ring-1 ring-slate-700">
            {POINT_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setPointCount(n)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  pointCount === n ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                최근 {n}건
              </button>
            ))}
          </div>
        </div>
      </div>

      {!sites && <p className="text-sm text-slate-400">사이트 목록을 불러오는 중입니다.</p>}

      {latest && (
        <div className="mb-4 grid grid-cols-3 gap-4">
          {[
            { label: "RTT", value: `${latest.rtt.toFixed(1)}ms` },
            { label: "Packet Loss", value: String(latest.loss_flag) },
            { label: "Jitter", value: `${latest.jitter.toFixed(1)}ms` },
          ].map((m) => (
            <div key={m.label} className="rounded-lg bg-slate-800 p-4 text-center ring-1 ring-slate-700">
              <p className="text-xs text-slate-500">{m.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-100">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {sites && <TrafficChart points={points} injectionTime={activeSite?.lastInjectionTime ?? null} />}
    </main>
  );
}
