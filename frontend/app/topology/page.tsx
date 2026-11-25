"use client";

import { useState } from "react";
import { useSharedMultiSiteTelemetry } from "@/lib/MultiSiteTelemetryContext";
import { SCENARIO_NAME_KO, SCENARIO_BADGE, SCENARIO_DOT } from "@/lib/scenarioStyles";
import type { SiteId } from "@/lib/api";

type NodeKind = "sensor" | "switch" | "server";

const NODE_META: Record<NodeKind, { label: string; icon: string }> = {
  sensor: { label: "PLC / 센서", icon: "🔧" },
  switch: { label: "네트워크 스위치", icon: "🔀" },
  server: { label: "Modbus TCP 서버", icon: "🖥️" },
};

export default function TopologyPage() {
  const { sites, error } = useSharedMultiSiteTelemetry();
  const [activeSiteId, setActiveSiteId] = useState<SiteId | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeKind | null>(null);

  const resolvedSiteId = activeSiteId ?? sites?.[0]?.info.id ?? null;
  const activeSite = (sites ?? []).find((s) => s.info.id === resolvedSiteId) ?? null;
  const latest = activeSite?.telemetry?.points.at(-1);

  return (
    <main className="p-8 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-white">🕸️ 네트워크 토폴로지</h1>

      {/* 가상 데이터 명시 - 실제 장비 배치도를 제공받지 못해 개념도로만 표시한다는 점을 숨기지 않는다 */}
      <div className="mb-6 rounded-md border-l-4 border-amber-500 bg-amber-500/10 p-4 text-sm text-amber-200">
        ⚠️ <span className="font-semibold">개념도입니다.</span> 백엔드가 실제 장비(PLC/스위치) 간
        물리적 연결 구조를 제공하지 않아, Modbus TCP 통신 경로를 일반적인 3단 구조(PLC/센서 →
        스위치 → 서버)로 단순화해 표시합니다. 포트 번호와 상태(정상/장애)만 실제 데이터이고,
        나머지 장비 배치는 실제 현장 배선과 다를 수 있습니다.
      </div>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* 사이트 전환 탭 */}
      <div className="mb-6 flex gap-1 rounded-md bg-slate-800 p-1 ring-1 ring-slate-700 w-fit">
        {(sites ?? []).map((site) => (
          <button
            key={site.info.id}
            onClick={() => {
              setActiveSiteId(site.info.id);
              setSelectedNode(null);
            }}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
              resolvedSiteId === site.info.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${SCENARIO_DOT[site.info.scenario]}`} />
            {site.info.name}
          </button>
        ))}
      </div>

      {!activeSite && <p className="text-sm text-slate-400">사이트 목록을 불러오는 중입니다.</p>}

      {activeSite && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* 토폴로지 다이어그램 */}
          <div className="rounded-lg bg-slate-800 p-8 ring-1 ring-slate-700">
            <div className="flex items-center justify-center gap-4">
              {(["sensor", "switch", "server"] as NodeKind[]).map((kind, i) => {
                const faulted = activeSite.info.scenario !== "A";
                return (
                  <div key={kind} className="flex items-center gap-4">
                    <button
                      onClick={() => setSelectedNode(kind)}
                      className={`flex w-40 flex-col items-center gap-2 rounded-lg border-2 bg-slate-900 p-4 transition hover:bg-slate-900/60 ${
                        selectedNode === kind
                          ? "border-blue-500"
                          : faulted
                          ? "border-red-500/60"
                          : "border-slate-700"
                      }`}
                    >
                      <span className="text-3xl">{NODE_META[kind].icon}</span>
                      <span className="text-center text-sm font-medium text-slate-200">{NODE_META[kind].label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SCENARIO_BADGE[activeSite.info.scenario]}`}>
                        {SCENARIO_NAME_KO[activeSite.info.scenario]}
                      </span>
                    </button>
                    {i < 2 && (
                      <span className={`text-2xl ${faulted ? "text-red-500" : "text-slate-600"}`}>
                        {faulted ? "⚡" : "—"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-center text-xs text-slate-500">
              {activeSite.info.name} · 통신 포트 {activeSite.info.port} (Modbus TCP)
            </p>
          </div>

          {/* 선택한 장비 상세 */}
          <div className="rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
            <h2 className="mb-3 text-sm font-semibold text-white">장비 상세 정보</h2>
            {!selectedNode ? (
              <p className="text-sm text-slate-400">다이어그램에서 장비를 클릭하면 상세 정보가 표시됩니다.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-slate-200">
                  {NODE_META[selectedNode].icon} {NODE_META[selectedNode].label}
                </p>
                <p className="text-slate-400">소속 사이트: {activeSite.info.name}</p>
                {selectedNode === "server" ? (
                  <>
                    <p className="text-slate-400">통신 포트: {activeSite.info.port}</p>
                    <p className="text-slate-400">
                      데이터 수집: {activeSite.telemetry?.source === "live" ? "🟢 실시간" : "⚪ 데모"}
                    </p>
                    {latest && (
                      <p className="text-slate-400">
                        최근 RTT {latest.rtt.toFixed(1)}ms · Loss {latest.loss_flag} · Jitter {latest.jitter.toFixed(1)}ms
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-slate-500">
                    이 장비에 대한 개별 식별 정보(IP, 모델 등)는 현재 백엔드에서 제공하지 않습니다.
                    상태는 소속 사이트 전체 상태와 동일하게 표시됩니다.
                  </p>
                )}
                <p className={`font-medium ${activeSite.info.scenario !== "A" ? "text-red-400" : "text-emerald-400"}`}>
                  상태: {SCENARIO_NAME_KO[activeSite.info.scenario]}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
