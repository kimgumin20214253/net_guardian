"use client";

import { useState } from "react";
import { useMultiSiteTelemetry } from "@/lib/useMultiSiteTelemetry";
import { SEVERITY_TEXT_COLOR } from "@/lib/severityStyles";
import { type ScenarioCode, type SiteId } from "@/lib/api";
import ActionChecklist from "@/components/ActionChecklist";
import ScenarioInjectModal from "@/components/ScenarioInjectModal";
import TrafficChart from "@/components/TrafficChart";

const SCENARIO_BUTTONS: { code: ScenarioCode; label: string }[] = [
  { code: "A", label: "정상" },
  { code: "B", label: "지연 장애" },
  { code: "C", label: "유실 장애" },
  { code: "D", label: "복합 장애" },
];

const LABEL_TO_SCENARIO: Record<number, ScenarioCode> = { 0: "A", 1: "B", 2: "C", 3: "D" };

export default function ScenarioPage() {
  const { sites, error, pending, injectScenario } = useMultiSiteTelemetry();

  // 모달에 띄울 "지금 주입하려는 시나리오". null이면 모달 닫힘.
  const [pendingInjectScenario, setPendingInjectScenario] = useState<ScenarioCode | null>(null);

  async function handlePickSite(siteId: SiteId) {
    if (pendingInjectScenario) {
      await injectScenario(siteId, pendingInjectScenario);
    }
    setPendingInjectScenario(null);
  }

  const faultedSites = (sites ?? []).filter((s) => {
    const points = s.telemetry?.points ?? [];
    const latest = points[points.length - 1];
    return latest && latest.predicted.severity !== "ok";
  });

  return (
    <main className="p-8">
      <h1 className="mb-2 text-3xl font-bold">장애 시나리오 제어</h1>
      <p className="mb-6 text-sm text-gray-500">
        버튼을 누르면 어느 산업 네트워크에 장애를 주입할지 선택할 수 있습니다. 선택한 네트워크에만
        실제로 장애가 재현되고, 아래 그래프에서 해당 네트워크만 실시간으로 반응합니다.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* 상단: 시나리오 주입 버튼 */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">① 시나리오 주입</h2>
        <div className="flex flex-wrap gap-3">
          {SCENARIO_BUTTONS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setPendingInjectScenario(code)}
              disabled={pending !== null || !sites}
              className="rounded-md bg-slate-100 px-4 py-2 font-semibold text-slate-700 shadow transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {code} · {label}
            </button>
          ))}
        </div>
        {pending && (
          <p className="mt-3 text-sm text-gray-500">
            {pending.siteId}에 {pending.scenario} 시나리오 주입 중...
          </p>
        )}
      </div>

      {/* 가운데 모달: 어느 네트워크에 주입할지 선택 */}
      {pendingInjectScenario && sites && (
        <ScenarioInjectModal
          scenarioLabel={`${pendingInjectScenario} · ${SCENARIO_BUTTONS.find((b) => b.code === pendingInjectScenario)?.label}`}
          sites={sites.map((s) => s.info)}
          onPick={handlePickSite}
          onClose={() => setPendingInjectScenario(null)}
        />
      )}

      {/* 중단: 사이트별 3x3 그래프 */}
      <div className="mt-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">② 네트워크별 실시간 관찰</h2>

        {!sites && <p className="text-sm text-gray-400">사이트 목록을 불러오는 중입니다.</p>}

        <div className="space-y-8">
          {(sites ?? []).map((site) => {
            const points = site.telemetry?.points ?? [];
            const latest = points[points.length - 1];
            const faulted = latest && latest.predicted.severity !== "ok";

            return (
              <div
                key={site.info.id}
                className={`rounded-lg p-4 transition ${
                  faulted ? "ring-2 ring-red-500" : "ring-1 ring-slate-100"
                }`}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-semibold text-slate-800">{site.info.name}</span>
                  <span className="text-xs text-gray-400">
                    포트 {site.info.port} · 주입된 시나리오 {site.info.scenario}
                  </span>
                  {latest && (
                    <span className={`ml-auto text-sm font-semibold ${SEVERITY_TEXT_COLOR[latest.predicted.severity]}`}>
                      {latest.predicted.name_ko}
                      {faulted && " 🚨"}
                    </span>
                  )}
                </div>
                <TrafficChart points={points} injectionTime={site.lastInjectionTime} />
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단: 초동 조치 대응 가이드 - 평소엔 빈칸, 장애 발생 시에만 출력 */}
      <div className="mt-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">③ 초동 조치 대응 가이드</h2>

        {faultedSites.length === 0 ? (
          <p className="text-sm text-gray-400">현재 장애가 감지된 네트워크가 없습니다.</p>
        ) : (
          <div className="space-y-6">
            {faultedSites.map((site) => {
              const points = site.telemetry?.points ?? [];
              const latest = points[points.length - 1];
              if (!latest) return null;
              return (
                <div key={site.info.id}>
                  <p className="mb-1 text-sm font-semibold text-red-600">
                    🚨 {site.info.name} — {latest.predicted.name_ko}
                  </p>
                  <ActionChecklist scenario={LABEL_TO_SCENARIO[latest.predicted.label]} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
