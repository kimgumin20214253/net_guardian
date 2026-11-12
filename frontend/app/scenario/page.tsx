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

const SCENARIO_LABEL: Record<ScenarioCode, string> = { A: "정상", B: "지연 장애", C: "유실 장애", D: "복합 장애" };

export default function ScenarioPage() {
  const { sites, error, pending, injectScenario, resolveFault } = useMultiSiteTelemetry();

  // 모달에 띄울 "지금 주입하려는 시나리오". null이면 모달 닫힘.
  const [pendingInjectScenario, setPendingInjectScenario] = useState<ScenarioCode | null>(null);

  async function handlePickSite(siteId: SiteId) {
    if (pendingInjectScenario) {
      await injectScenario(siteId, pendingInjectScenario);
    }
    setPendingInjectScenario(null);
  }

  // "장애냐 아니냐"는 AI의 순간 예측(latest.predicted)이 아니라 실제로 주입된 시나리오로 판단한다.
  // 유실/복합 장애는 대부분의 개별 요청이 정상처럼 보이고 일부만 이상하게 나오는 방식이라,
  // AI의 "방금 한 건" 예측만 보면 장애 중에도 계속 정상↔이상으로 깜빡인다. 그 깜빡임을 기준으로
  // 체크리스트를 켜고 끄면, 체크리스트가 수시로 사라졌다 다시 나타나며 체크 상태가 초기화된다.
  const faultedSites = (sites ?? []).filter((s) => s.info.scenario !== "A");

  return (
    <main className="p-8">
      <h1 className="mb-2 text-3xl font-bold">장애 시나리오 제어</h1>
      <p className="mb-1 text-sm text-gray-500">
        버튼을 누르면 어느 산업 네트워크에 장애를 주입할지 선택할 수 있습니다. 선택한 네트워크에만
        실제로 장애가 재현되고, 아래 그래프에서 해당 네트워크만 실시간으로 반응합니다.
      </p>
      <p className="mb-6 text-xs text-gray-400">
        5분마다 정상인 네트워크 중 하나에 자동으로 장애가 무작위 주입됩니다. 초동 조치 체크리스트를
        전부 완료하면 정상으로 복귀하고, 그 네트워크는 1분간 어떤 방식으로도 장애가 걸리지 않습니다
        (직접 주입도 동일하게 적용).
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
            // 빨간 테두리는 "실제로 주입된 장애" 기준 - AI의 순간 예측(latest.predicted)은
            // 유실/복합 장애에서 정상↔이상으로 계속 깜빡이므로 테두리가 그걸 따라가면 안 된다.
            const faulted = site.info.scenario !== "A";

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
                  {site.info.cooldown_remaining > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                      쿨다운 {site.info.cooldown_remaining}초
                    </span>
                  )}
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
            {faultedSites.map((site) => (
              <div key={site.info.id}>
                <p className="mb-1 text-sm font-semibold text-red-600">
                  🚨 {site.info.name} — {SCENARIO_LABEL[site.info.scenario]}
                </p>
                <p className="mb-2 text-xs text-gray-400">
                  체크리스트를 전부 완료하면 자동으로 정상 상태로 복귀하고, 1분간 이 네트워크에는
                  새 장애가 걸리지 않습니다.
                </p>
                {/* 실제로 주입된 시나리오 기준 가이드 - AI의 순간 예측이 아니라 이걸 써야
                    장애가 안 풀린 동안 가이드가 안정적으로 유지된다. */}
                <ActionChecklist
                  scenario={site.info.scenario}
                  onComplete={() => resolveFault(site.info.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
