"use client";

import { useState } from "react";
import { useMultiSiteTelemetry } from "@/lib/useMultiSiteTelemetry";
import { type ScenarioCode, type SiteId } from "@/lib/api";
import { useCopilotUI } from "@/lib/CopilotUIContext";
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

// 실제 주입된 시나리오 기준 색상 - AI의 순간 예측(latest.predicted.severity)으로 색을 입히면
// 유실/복합 장애에서 대부분 샘플이 정상처럼 보여 색이 계속 바뀐다.
const SCENARIO_SEVERITY_COLOR: Record<ScenarioCode, string> = {
  A: "text-green-600",
  B: "text-yellow-600",
  C: "text-red-600",
  D: "text-purple-600",
};

export default function ScenarioPage() {
  const { sites, error, pending, injectScenario, resolveFault } = useMultiSiteTelemetry();
  const { askCopilot } = useCopilotUI();

  // 모달에 띄울 "지금 주입하려는 시나리오". null이면 모달 닫힘.
  const [pendingInjectScenario, setPendingInjectScenario] = useState<ScenarioCode | null>(null);

  async function handlePickSite(siteId: SiteId) {
    if (pendingInjectScenario) {
      await injectScenario(siteId, pendingInjectScenario);
    }
    setPendingInjectScenario(null);
  }

  return (
    <main className="p-8">
      <h1 className="mb-2 text-3xl font-bold">장애 시나리오 제어</h1>
      <p className="mb-6 text-sm text-gray-500">
        버튼으로 공장을 골라 장애를 직접 주입하거나, 5분마다 자동으로 무작위 주입되는 것을
        기다려보세요. 장애가 난 공장은 그래프 아래에 바로 대응 체크리스트가 나타나고, 전부
        완료하면 자동으로 정상 복귀 후 1분간 재발을 막습니다.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* ① 시나리오 주입 */}
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
            {sites?.find((s) => s.info.id === pending.siteId)?.info.name ?? pending.siteId}에{" "}
            {SCENARIO_LABEL[pending.scenario]} 주입 중...
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

      {/* ② 공장별 상태 - 그래프와 대응 체크리스트를 공장 하나당 카드 하나에 같이 둬서,
          어느 그래프가 어느 체크리스트 건지 눈으로 다시 찾아 맞출 필요가 없게 한다. */}
      <div className="mt-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">② 공장별 상태</h2>

        {!sites && <p className="text-sm text-gray-400">사이트 목록을 불러오는 중입니다.</p>}

        <div className="space-y-8">
          {(sites ?? []).map((site) => {
            const points = site.telemetry?.points ?? [];
            const latest = points[points.length - 1];
            // "장애냐 아니냐"는 AI의 순간 예측이 아니라 실제로 주입된 시나리오로 판단한다 - 유실/복합
            // 장애는 대부분의 개별 요청이 정상처럼 보여서, 순간 예측 기준이면 테두리와 체크리스트가
            // 장애 중에도 계속 깜빡이며 사라졌다 나타난다.
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
                  {site.info.cooldown_remaining > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                      쿨다운 {site.info.cooldown_remaining}초
                    </span>
                  )}
                  {latest && (
                    <span className={`text-sm font-semibold ${SCENARIO_SEVERITY_COLOR[site.info.scenario]}`}>
                      {SCENARIO_LABEL[site.info.scenario]}
                      {faulted && " 🚨"}
                    </span>
                  )}
                  {faulted && (
                    <button
                      onClick={() =>
                        askCopilot(
                          `${site.info.name}에서 지금 ${SCENARIO_LABEL[site.info.scenario]} 상황인데 어떻게 대응해야 해?`,
                          {
                            currentFault: site.info.scenario,
                            readings: latest
                              ? {
                                  rtt: latest.rtt,
                                  loss_flag: latest.loss_flag,
                                  jitter: latest.jitter,
                                  confidence: latest.predicted.probabilities
                                    ? latest.predicted.probabilities[String(latest.predicted.label)]
                                    : null,
                                }
                              : undefined,
                          }
                        )
                      }
                      className="ml-auto flex-shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                    >
                      🛠️ AI 코파일럿에게 물어보기
                    </button>
                  )}
                </div>

                <TrafficChart points={points} injectionTime={site.lastInjectionTime} />

                {faulted && (
                  <ActionChecklist siteId={site.info.id} onComplete={() => resolveFault(site.info.id)} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
