"use client";

import { useEffect, useState } from "react";
import { useSharedMultiSiteTelemetry, buildCopilotContext } from "@/lib/MultiSiteTelemetryContext";
import { type ScenarioCode, type SiteId, type TelemetryPoint } from "@/lib/api";
import type { SiteState } from "@/lib/useMultiSiteTelemetry";
import { useCopilotUI } from "@/lib/CopilotUIContext";
import { SCENARIO_NAME_KO as SCENARIO_LABEL, SCENARIO_TEXT as SCENARIO_SEVERITY_COLOR } from "@/lib/scenarioStyles";
import ActionChecklist from "@/components/ActionChecklist";
import ScenarioInjectModal from "@/components/ScenarioInjectModal";
import TrafficChart from "@/components/TrafficChart";

const SCENARIO_BUTTONS: { code: ScenarioCode; label: string }[] = [
  { code: "A", label: "정상" },
  { code: "B", label: "지연 장애" },
  { code: "C", label: "유실 장애" },
  { code: "D", label: "복합 장애" },
];

type Stats = { rtt: number; loss: number; jitter: number };
type RecoverySnapshot = { before: Stats; elapsedMs: number };

function avgStats(points: TelemetryPoint[]): Stats | null {
  if (points.length === 0) return null;
  return {
    rtt: points.reduce((a, p) => a + p.rtt, 0) / points.length,
    loss: points.reduce((a, p) => a + p.loss_flag, 0) / points.length,
    jitter: points.reduce((a, p) => a + p.jitter, 0) / points.length,
  };
}

/** lastInjectionTime(주입 직전 마지막 샘플의 timestamp)을 기준으로 points를 "주입 전/후"로
 *  나눠 각각 평균을 구한다. 백엔드 자동 주입(5분 주기)처럼 lastInjectionTime이 없는 경우는
 *  비교할 기준점이 없으므로 null을 반환한다(값을 지어내지 않음). */
function beforeAfterStats(points: TelemetryPoint[], injectionTime: string | null) {
  if (!injectionTime) return null;
  const idx = points.findIndex((p) => p.timestamp === injectionTime);
  if (idx === -1) return null;
  const before = avgStats(points.slice(0, idx + 1));
  const after = avgStats(points.slice(idx + 1));
  if (!before || !after) return null;
  return { before, after };
}

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatStats(s: Stats) {
  return `RTT ${s.rtt.toFixed(1)}ms · Loss ${(s.loss * 100).toFixed(0)}% · Jitter ${s.jitter.toFixed(1)}ms`;
}

export default function ScenarioPage() {
  const { sites, error, pending, injectScenario, resolveFault } = useSharedMultiSiteTelemetry();
  const { askCopilot } = useCopilotUI();

  // 모달에 띄울 "지금 주입하려는 시나리오". null이면 모달 닫힘.
  const [pendingInjectScenario, setPendingInjectScenario] = useState<ScenarioCode | null>(null);

  async function handlePickSite(siteId: SiteId) {
    if (pendingInjectScenario) {
      await injectScenario(siteId, pendingInjectScenario);
    }
    setPendingInjectScenario(null);
  }

  // 장애 지속 시간 - 백엔드가 장애 시작 시각을 따로 안 주므로, "이 화면이 장애 전환을 감지한
  // 실제 시각(Date.now())"부터 잰다(수동 주입이든 5분 자동 주입이든 동일하게 잡힌다).
  const [faultStartAt, setFaultStartAt] = useState<Partial<Record<SiteId, number>>>({});
  const [recoverySnapshot, setRecoverySnapshot] = useState<Partial<Record<SiteId, RecoverySnapshot>>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 렌더 중에 "지금 scenario 조합"과 "마지막으로 반영했던 조합"을 비교해서, 실제로 바뀐
  // 순간에만 상태를 갱신한다(Copilot.tsx의 pendingContext 동기화와 같은 패턴 - useEffect
  // 안에서 setState를 부르지 않는다).
  const scenarioSnapshot = (sites ?? []).map((s) => `${s.info.id}:${s.info.scenario}`).join(",");
  const [prevScenarioSnapshot, setPrevScenarioSnapshot] = useState(scenarioSnapshot);
  if (scenarioSnapshot !== prevScenarioSnapshot) {
    const started = { ...faultStartAt };
    const snapshots = { ...recoverySnapshot };
    for (const site of sites ?? []) {
      if (site.info.scenario === "A") {
        delete started[site.info.id];
      } else if (!(site.info.id in started)) {
        started[site.info.id] = now; // 1초 단위로 갱신되는 now(state)를 쓴다 - 렌더 중 Date.now() 직접 호출 금지
        delete snapshots[site.info.id]; // 새로 장애가 시작됐으니 지난 복구 비교는 지운다
      }
    }
    setFaultStartAt(started);
    setRecoverySnapshot(snapshots);
    setPrevScenarioSnapshot(scenarioSnapshot);
  }

  function handleResolve(site: SiteState) {
    const recent = (site.telemetry?.points ?? []).slice(-10);
    const before = avgStats(recent);
    const start = faultStartAt[site.info.id];
    if (before) {
      setRecoverySnapshot((prev) => ({
        ...prev,
        [site.info.id]: { before, elapsedMs: start ? Date.now() - start : 0 },
      }));
    }
    resolveFault(site.info.id);
  }

  return (
    <main className="p-8 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-white">🎛️ 장애 시뮬레이션</h1>
      <p className="mb-6 text-sm text-slate-400">
        버튼으로 공장을 골라 장애를 직접 주입하거나, 5분마다 자동으로 무작위 주입되는 것을
        기다려보세요. 장애가 난 공장은 그래프 아래에 바로 대응 체크리스트가 나타나고, 전부
        완료하면 자동으로 정상 복귀 후 1분간 재발을 막습니다.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* ① 시나리오 주입 */}
      <div className="rounded-lg bg-slate-800 p-6 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-semibold text-white">① 시나리오 주입</h2>
        <div className="flex flex-wrap gap-3">
          {SCENARIO_BUTTONS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setPendingInjectScenario(code)}
              disabled={pending !== null || !sites}
              className="rounded-md bg-slate-700 px-4 py-2 font-semibold text-slate-100 ring-1 ring-slate-600 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {code} · {label}
            </button>
          ))}
        </div>
        {pending && (
          <p className="mt-3 text-sm text-slate-400">
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
      <div className="mt-6 rounded-lg bg-slate-800 p-6 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-semibold text-white">② 공장별 상태</h2>

        {!sites && <p className="text-sm text-slate-400">사이트 목록을 불러오는 중입니다.</p>}

        <div className="space-y-8">
          {(sites ?? []).map((site) => {
            const points = site.telemetry?.points ?? [];
            const latest = points[points.length - 1];
            // "장애냐 아니냐"는 AI의 순간 예측이 아니라 실제로 주입된 시나리오로 판단한다 - 유실/복합
            // 장애는 대부분의 개별 요청이 정상처럼 보여서, 순간 예측 기준이면 테두리와 체크리스트가
            // 장애 중에도 계속 깜빡이며 사라졌다 나타난다.
            const faulted = site.info.scenario !== "A";
            const startedAt = faultStartAt[site.info.id];
            const compare = faulted ? beforeAfterStats(points, site.lastInjectionTime) : null;
            const recovery = !faulted ? recoverySnapshot[site.info.id] : undefined;

            return (
              <div
                key={site.info.id}
                className={`rounded-lg bg-slate-900 p-4 transition ${
                  faulted ? "ring-2 ring-red-500/60" : "ring-1 ring-slate-800"
                }`}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-semibold text-slate-100">{site.info.name}</span>
                  {site.info.cooldown_remaining > 0 && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                      쿨다운 {site.info.cooldown_remaining}초
                    </span>
                  )}
                  {latest && (
                    <span className={`text-sm font-semibold ${SCENARIO_SEVERITY_COLOR[site.info.scenario]}`}>
                      {SCENARIO_LABEL[site.info.scenario]}
                      {faulted && " 🚨"}
                    </span>
                  )}
                  {faulted && startedAt && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300">
                      ⏱ 경과 {formatElapsed(now - startedAt)}
                    </span>
                  )}
                  {faulted && (
                    <button
                      onClick={() =>
                        askCopilot(
                          `${site.info.name}에서 지금 ${SCENARIO_LABEL[site.info.scenario]} 상황인데 어떻게 대응해야 해?`,
                          buildCopilotContext(site)
                        )
                      }
                      className="ml-auto flex-shrink-0 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20"
                    >
                      🛠️ AI 코파일럿에게 물어보기
                    </button>
                  )}
                </div>

                <TrafficChart points={points} injectionTime={site.lastInjectionTime} />

                {compare && (
                  <div className="mt-3 rounded-md bg-slate-800 p-3 text-xs">
                    <p className="mb-1 font-medium text-slate-300">주입 전/후 비교</p>
                    <p className="text-slate-400">전: {formatStats(compare.before)}</p>
                    <p className="text-slate-400">후: {formatStats(compare.after)}</p>
                  </div>
                )}

                {recovery && (
                  <div className="mt-3 rounded-md bg-emerald-500/5 p-3 text-xs ring-1 ring-emerald-500/20">
                    <p className="mb-1 font-medium text-emerald-300">
                      ✅ 최근 복구 비교 · 장애 지속 {formatElapsed(recovery.elapsedMs)}
                    </p>
                    <p className="text-slate-400">복구 전(최근 10건 평균): {formatStats(recovery.before)}</p>
                    {latest && <p className="text-slate-400">복구 후(현재): {formatStats({ rtt: latest.rtt, loss: latest.loss_flag, jitter: latest.jitter })}</p>}
                  </div>
                )}

                {faulted && (
                  <ActionChecklist siteId={site.info.id} onComplete={() => handleResolve(site)} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
