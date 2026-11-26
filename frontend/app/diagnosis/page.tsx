"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useSharedMultiSiteTelemetry } from "@/lib/MultiSiteTelemetryContext";
import { SCENARIO_NAME_KO, SCENARIO_BADGE, SCENARIO_TEXT } from "@/lib/scenarioStyles";
import { fetchSiteGuide, type FaultGuide, type SiteId, type TelemetryPoint } from "@/lib/api";
import ActionChecklist from "@/components/ActionChecklist";

const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };
const TOOLTIP_STYLE = { fontSize: 12, background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0" };

/** 사이트별로 이미 폴링된 points에서 "AI가 매긴 신뢰도"만 뽑아 추이를 보여준다 - 새 API 없이
 *  TelemetryPoint.predicted.probabilities[label]을 그대로 쓴다. */
function ConfidenceTrend({ points }: { points: TelemetryPoint[] }) {
  const data = points
    .map((p) => ({
      time: p.timestamp.slice(11, 19),
      confidence: p.predicted.probabilities ? (p.predicted.probabilities[String(p.predicted.label)] ?? null) * 100 : null,
    }))
    .filter((d) => d.confidence !== null);

  if (data.length < 2) {
    return <p className="text-xs text-slate-500">신뢰도 추이를 표시할 데이터가 아직 부족합니다.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data}>
        <XAxis dataKey="time" tick={AXIS_TICK} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={AXIS_TICK} width={32} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v).toFixed(0)}%`, "신뢰도"]} />
        <Line type="monotone" dataKey="confidence" stroke="#60a5fa" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function DiagnosisPage() {
  const { sites, events, error, resolveFault } = useSharedMultiSiteTelemetry();
  // 사이트별 11가지 세부 사례 가이드(backend/fault_tiers.py) - 장애 없는 사이트는 404라 null로 둔다.
  const [guides, setGuides] = useState<Partial<Record<SiteId, FaultGuide | null>>>({});

  useEffect(() => {
    if (!sites) return;
    sites.forEach((s) => {
      if (s.info.scenario === "A") {
        setGuides((prev) => ({ ...prev, [s.info.id]: null }));
        return;
      }
      fetchSiteGuide(s.info.id)
        .then((g) => setGuides((prev) => ({ ...prev, [s.info.id]: g })))
        .catch(() => setGuides((prev) => ({ ...prev, [s.info.id]: null })));
      // scenario가 바뀔 때마다(장애 전환/복구) 다시 조회한다.
    });
  }, [sites?.map((s) => `${s.info.id}:${s.info.scenario}`).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // 백엔드가 영구 기록한 장애 발생/복구 이벤트 - 폴링 창 크기와 무관하게 계속 남아있다.
  const recentEvents = useMemo(() => {
    if (!events) return [];
    return [...events]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10)
      .map((ev) => ({ ...ev, siteName: sites?.find((s) => s.info.id === ev.site)?.info.name ?? ev.site }));
  }, [events, sites]);

  return (
    <main className="p-8 text-slate-100">
      <h1 className="mb-2 text-2xl font-bold text-white">🧠 AI 장애 진단</h1>
      <p className="mb-6 text-sm text-slate-400">
        각 사이트의 <span className="text-slate-200">실제 주입된 시나리오(ground truth)</span>와{" "}
        <span className="text-slate-200">AI의 순간 예측</span>을 구분해서 보여줍니다. 장애가
        있는 사이트는 세부 진단 사례(지연/유실/복합 11가지 중 하나, <code className="text-xs">backend/fault_tiers.py</code>)와
        대응 가이드 근거를 같이 표시합니다.
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {!sites && <p className="mb-6 text-sm text-slate-400">사이트 목록을 불러오는 중입니다.</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(sites ?? []).map((site) => {
          const points = site.telemetry?.points ?? [];
          const latest = points[points.length - 1];
          const faulted = site.info.scenario !== "A";
          const guide = guides[site.info.id];
          const confidence = latest?.predicted.probabilities
            ? latest.predicted.probabilities[String(latest.predicted.label)]
            : null;

          return (
            <div
              key={site.info.id}
              className={`rounded-lg bg-slate-800 p-5 ring-1 ${faulted ? "ring-red-500/50" : "ring-slate-700"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-lg font-semibold text-white">{site.info.name}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SCENARIO_BADGE[site.info.scenario]}`}>
                  실제: {SCENARIO_NAME_KO[site.info.scenario]}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-slate-900 p-3">
                  <p className="text-xs text-slate-500">AI 순간 판단</p>
                  <p className="mt-1 font-semibold text-slate-100">{latest ? latest.predicted.name_ko : "-"}</p>
                  <p className="text-xs text-slate-500">
                    {confidence !== null && confidence !== undefined ? `신뢰도 ${(confidence * 100).toFixed(0)}%` : "-"}
                  </p>
                </div>
                <div className="rounded-md bg-slate-900 p-3">
                  <p className="text-xs text-slate-500">실측값</p>
                  {latest ? (
                    <p className="mt-1 font-semibold text-slate-100">
                      RTT {latest.rtt.toFixed(1)}ms · Loss {latest.loss_flag} · Jitter {latest.jitter.toFixed(1)}ms
                    </p>
                  ) : (
                    <p className="mt-1 text-slate-500">-</p>
                  )}
                </div>
              </div>

              <div className="mb-3 rounded-md bg-slate-900 p-3">
                <p className="mb-1 text-xs text-slate-500">신뢰도 변화 추이 (최근 수집 구간)</p>
                <ConfidenceTrend points={points} />
              </div>

              {!faulted && (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  ✅ 정상 상태입니다. 별도 조치가 필요하지 않습니다.
                </p>
              )}

              {faulted && guide && (
                <div>
                  <p className="mb-1 text-sm font-semibold text-blue-200">
                    세부 진단: {guide.name_ko}
                  </p>
                  {latest && (
                    <p className="mb-2 text-[11px] text-blue-300/80">
                      이 진단의 근거가 된 현재 실측값: RTT {latest.rtt.toFixed(1)}ms · Loss {latest.loss_flag} · Jitter {latest.jitter.toFixed(1)}ms
                    </p>
                  )}
                  {/* 체크리스트를 전부 완료하면 /scenario와 동일하게 자동으로 정상 복귀 처리한다. */}
                  <ActionChecklist siteId={site.info.id} onComplete={() => resolveFault(site.info.id)} />
                </div>
              )}

              {faulted && !guide && (
                <p className="text-sm text-slate-500">세부 진단을 불러오는 중입니다...</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 유형별 진단 결과 비교 - 이미 위 카드에 있는 사이트별 현재 상태를 한 표로 모아 보여준다 */}
      <div className="mt-6 overflow-x-auto rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-semibold text-white">장애 유형별 진단 결과 비교</h2>
        {!sites ? (
          <p className="text-sm text-slate-400">불러오는 중입니다.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="p-2 text-left">사이트</th>
                <th className="p-2 text-left">실제 시나리오</th>
                <th className="p-2 text-left">AI 순간 판단</th>
                <th className="p-2 text-left">신뢰도</th>
                <th className="p-2 text-left">세부 진단 사례</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const points = site.telemetry?.points ?? [];
                const latest = points[points.length - 1];
                const confidence = latest?.predicted.probabilities
                  ? latest.predicted.probabilities[String(latest.predicted.label)]
                  : null;
                const guide = guides[site.info.id];
                return (
                  <tr key={site.info.id} className="border-b border-slate-800">
                    <td className="p-2 text-slate-200">{site.info.name}</td>
                    <td className={`p-2 font-medium ${SCENARIO_TEXT[site.info.scenario]}`}>
                      {SCENARIO_NAME_KO[site.info.scenario]}
                    </td>
                    <td className="p-2 text-slate-300">{latest ? latest.predicted.name_ko : "-"}</td>
                    <td className="p-2 text-slate-300">
                      {confidence !== null && confidence !== undefined ? `${(confidence * 100).toFixed(0)}%` : "-"}
                    </td>
                    <td className="p-2 text-slate-300">{guide ? guide.name_ko : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-semibold text-white">최근 진단 이력</h2>
        {!events ? (
          <p className="text-sm text-slate-400">불러오는 중입니다.</p>
        ) : recentEvents.length === 0 ? (
          <p className="text-sm text-slate-400">장애 발생/복구 이벤트가 아직 없습니다.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentEvents.map((ev, i) => (
              <li key={`${ev.timestamp}-${i}`} className="flex items-center gap-2 border-b border-slate-700 pb-2 last:border-0">
                <span className="w-20 flex-shrink-0 text-xs text-slate-500">{ev.timestamp.slice(11, 19)}</span>
                {ev.type === "fault_started" ? (
                  <span className="text-red-400">🚨 장애 발생</span>
                ) : (
                  <span className="text-emerald-400">
                    ✅ 정상 복구{ev.elapsed_sec !== null && ` (${Math.round(ev.elapsed_sec)}초 지속)`}
                  </span>
                )}
                <span className="text-slate-400">— {ev.siteName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
