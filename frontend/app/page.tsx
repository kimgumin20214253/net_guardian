"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSharedMultiSiteTelemetry } from "@/lib/MultiSiteTelemetryContext";
import { type SiteState } from "@/lib/useMultiSiteTelemetry";
import { SCENARIO_NAME_KO, SCENARIO_BADGE, SCENARIO_DOT, SCENARIO_RING } from "@/lib/scenarioStyles";
import TrafficChart from "@/components/TrafficChart";
import FaultTrendChart from "@/components/FaultTrendChart";
import type { SiteId } from "@/lib/api";

const POINT_COUNT_OPTIONS = [50, 100, 200];

function latestOf(site: SiteState) {
  const points = site.telemetry?.points ?? [];
  return points[points.length - 1] ?? null;
}

function formatClock(timestamp: string | undefined) {
  if (!timestamp) return "-";
  return timestamp.slice(11, 19) || timestamp;
}

export default function HomePage() {
  // 레이아웃에서 이미 최대 200건을 받아와 모든 페이지가 공유한다 - 다시 네트워크를 타지 않고
  // "최근 N건" 선택은 그 안에서 화면에 보여줄 범위만 잘라서 쓴다(더 빠르게 즉시 반영됨).
  const { sites, events, error } = useSharedMultiSiteTelemetry();
  const [pointCount, setPointCount] = useState(50);
  const [chartSiteId, setChartSiteId] = useState<SiteId | null>(null);

  const totalSites = sites?.length ?? 0;
  const faultedSites = useMemo(() => (sites ?? []).filter((s) => s.info.scenario !== "A"), [sites]);
  const normalCount = totalSites - faultedSites.length;
  // 경고(지연)와 위험(유실/복합)을 나눠서 본다 - 둘 다 이미 아는 site.info.scenario로만 판단하므로
  // 새 데이터가 필요하지 않다.
  const warningSites = useMemo(() => (sites ?? []).filter((s) => s.info.scenario === "B"), [sites]);
  const dangerSites = useMemo(
    () => (sites ?? []).filter((s) => s.info.scenario === "C" || s.info.scenario === "D"),
    [sites]
  );

  // 평균 RTT/Jitter와 손실 현황은 "실제로 값이 있는 사이트"만으로 계산한다 - 데이터가 아예 없는
  // 사이트를 0으로 쳐서 평균을 왜곡시키지 않기 위함.
  const rttValues = (sites ?? [])
    .map((s) => latestOf(s)?.rtt)
    .filter((v): v is number => typeof v === "number");
  const avgRtt = rttValues.length ? rttValues.reduce((a, b) => a + b, 0) / rttValues.length : null;
  const jitterValues = (sites ?? [])
    .map((s) => latestOf(s)?.jitter)
    .filter((v): v is number => typeof v === "number");
  const avgJitter = jitterValues.length ? jitterValues.reduce((a, b) => a + b, 0) / jitterValues.length : null;
  const lossSiteCount = (sites ?? []).filter((s) => latestOf(s)?.loss_flag === 1).length;
  // 패킷 손실률(%) - 사이트별로 최근 수신 구간 중 loss_flag=1 비율을 구해 평균한다(스냅샷 1건이
  // 아니라 구간 전체를 보므로 "손실 감지 사이트" 카드와는 다른, 보조적인 지표).
  const lossRatePct = useMemo(() => {
    if (!sites) return null;
    const rates = (sites ?? [])
      .map((s) => {
        const pts = s.telemetry?.points ?? [];
        if (pts.length === 0) return null;
        return pts.filter((p) => p.loss_flag === 1).length / pts.length;
      })
      .filter((v): v is number => v !== null);
    if (rates.length === 0) return null;
    return (rates.reduce((a, b) => a + b, 0) / rates.length) * 100;
  }, [sites]);

  const dataSource = sites?.find((s) => s.telemetry)?.telemetry?.source ?? null;
  const lastUpdated = (sites ?? [])
    .map((s) => latestOf(s)?.timestamp)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);

  const activeChartSiteId = chartSiteId ?? faultedSites[0]?.info.id ?? sites?.[0]?.info.id ?? null;
  const activeSite = (sites ?? []).find((s) => s.info.id === activeChartSiteId) ?? null;

  // 최근 이벤트 - 백엔드가 영구 기록한 장애 발생/복구 이벤트(GET /events). 예전엔 폴링 창(최근
  // N건, 실제로는 20~60초 분량)에서 추론해서 그 창을 벗어나면 금방 사라지는 문제가 있었는데,
  // 이제는 전환 순간에 직접 기록한 데이터라 폴링 창 크기와 무관하게 계속 남아있다.
  const recentEvents = useMemo(() => {
    if (!events) return [];
    return [...events]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 8)
      .map((ev) => ({ ...ev, siteName: sites?.find((s) => s.info.id === ev.site)?.info.name ?? ev.site }));
  }, [events, sites]);

  return (
    <main className="p-8 text-slate-100">
      {/* 상단 헤더 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            🛰️ NET GUARDIAN <span className="text-slate-500">종합 관제</span>
          </h1>
          <p className="mt-0.5 text-sm font-medium tracking-wide text-slate-500">
            INDUSTRIAL NETWORK CONTROL CENTER
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-slate-800 px-4 py-2 ring-1 ring-slate-700">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${error ? "text-red-400" : "text-emerald-400"}`}>
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-400" : "bg-emerald-400"}`} />
            {error ? "연결 끊김" : "시스템 정상 연결"}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-sm text-slate-400">
            마지막 갱신 {formatClock(lastUpdated)}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-sm text-slate-400">
            {dataSource === "live" ? "🟢 실시간 데이터" : dataSource === "demo" ? "⚪ 데모 데이터" : "-"}
          </span>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* KPI 카드 */}
      <section className="mb-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: "🏭", label: "전체 사이트", value: sites ? totalSites : "-" },
          { icon: "✅", label: "정상 사이트", value: sites ? normalCount : "-", tone: "text-emerald-400" },
          { icon: "⚠️", label: "경고 사이트", value: sites ? warningSites.length : "-", tone: warningSites.length > 0 ? "text-amber-400" : "text-slate-100" },
          { icon: "🚨", label: "위험 사이트", value: sites ? dangerSites.length : "-", tone: dangerSites.length > 0 ? "text-red-400" : "text-slate-100" },
          { icon: "⏱️", label: "평균 RTT", value: avgRtt !== null ? `${avgRtt.toFixed(1)}ms` : "-" },
          { icon: "📶", label: "평균 Jitter", value: avgJitter !== null ? `${avgJitter.toFixed(1)}ms` : "-" },
          { icon: "📉", label: "손실 감지 사이트", value: sites ? `${lossSiteCount}/${totalSites}` : "-" },
          { icon: "📊", label: "패킷 손실률", value: lossRatePct !== null ? `${lossRatePct.toFixed(1)}%` : "-" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg bg-slate-800 p-4 ring-1 ring-slate-700">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-400">
              <span>{kpi.icon}</span>
              {kpi.label}
            </div>
            <p className={`text-2xl font-bold ${kpi.tone ?? "text-slate-100"}`}>{kpi.value}</p>
          </div>
        ))}
      </section>
      <p className="mb-6 text-[11px] text-slate-500">
        ℹ️ TCP 재전송 세그먼트 수는 현재 수집하지 않아 KPI로 제공하지 않습니다.
      </p>

      {/* 사이트별 네트워크 상태 */}
      <section className="mb-6 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
        <h2 className="mb-4 text-lg font-semibold text-white">사이트별 네트워크 상태</h2>

        {!sites && <p className="text-sm text-slate-400">사이트 목록을 불러오는 중입니다.</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(sites ?? []).map((site) => {
            const latest = latestOf(site);
            const confidence = latest?.predicted.probabilities
              ? latest.predicted.probabilities[String(latest.predicted.label)]
              : null;
            return (
              <div
                key={site.info.id}
                className={`flex flex-col gap-2 rounded-lg bg-slate-900 p-4 transition ${SCENARIO_RING[site.info.scenario]} ${
                  activeChartSiteId === site.info.id ? "outline outline-2 outline-blue-500" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setChartSiteId(site.info.id)}
                  className="flex flex-col gap-2 text-left hover:opacity-90"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">{site.info.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SCENARIO_BADGE[site.info.scenario]}`}>
                      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${SCENARIO_DOT[site.info.scenario]}`} />
                      {SCENARIO_NAME_KO[site.info.scenario]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">포트 {site.info.port}</p>

                  <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[11px] text-slate-500">RTT</p>
                      <p className="text-sm font-semibold text-slate-100">{latest ? `${latest.rtt.toFixed(1)}ms` : "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Loss</p>
                      <p className="text-sm font-semibold text-slate-100">{latest ? latest.loss_flag : "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Jitter</p>
                      <p className="text-sm font-semibold text-slate-100">{latest ? `${latest.jitter.toFixed(1)}ms` : "-"}</p>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
                    <span className="text-slate-400">
                      AI 진단: <span className="font-medium text-slate-200">{latest ? latest.predicted.name_ko : "-"}</span>
                      {confidence !== null && confidence !== undefined && ` (${(confidence * 100).toFixed(0)}%)`}
                    </span>
                    {site.info.cooldown_remaining > 0 && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400">
                        쿨다운 {site.info.cooldown_remaining}s
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-[11px]">
                  <span className="text-slate-500">
                    마지막 수신 {latest ? formatClock(latest.timestamp) : "-"}
                  </span>
                  <div className="flex gap-2">
                    <Link href={`/monitoring?site=${site.info.id}`} className="font-medium text-blue-400 hover:text-blue-300">
                      모니터링 →
                    </Link>
                    <Link href={`/diagnosis?site=${site.info.id}`} className="font-medium text-blue-400 hover:text-blue-300">
                      AI진단 →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Link
          href="/scenario"
          className="mt-3 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
        >
          사이트 상세(장애 시뮬레이션 화면)로 이동 →
        </Link>
      </section>

      {/* 네트워크 장애 추이 */}
      <section className="mb-6 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
        <h2 className="mb-1 text-lg font-semibold text-white">네트워크 장애 추이</h2>
        <p className="mb-4 text-xs text-slate-500">
          분 단위 장애 발생/정상 복구 횟수입니다. 백엔드가 전환 순간에 직접 기록한 이벤트라 폴링
          창 크기와 무관하게 계속 남아있습니다(최근 최대 100건).
        </p>
        <FaultTrendChart events={events} />
      </section>

      {/* 실시간 네트워크 모니터링 */}
      <section className="mb-6 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">실시간 네트워크 모니터링</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-md bg-slate-900 p-1 ring-1 ring-slate-700">
              {(sites ?? []).map((site) => (
                <button
                  key={site.info.id}
                  onClick={() => setChartSiteId(site.info.id)}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${
                    activeChartSiteId === site.info.id
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {site.info.name.split(" - ")[0] ?? site.info.name}
                </button>
              ))}
            </div>
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

        {!activeSite && <p className="text-sm text-slate-400">표시할 사이트가 없습니다.</p>}
        {activeSite && (
          <TrafficChart
            points={(activeSite.telemetry?.points ?? []).slice(-pointCount)}
            injectionTime={activeSite.lastInjectionTime}
          />
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* AI 장애 진단 현황 */}
        <section className="rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
          <h2 className="mb-4 text-lg font-semibold text-white">AI 장애 진단 현황</h2>
          <div className="space-y-3">
            {(sites ?? []).map((site) => {
              const latest = latestOf(site);
              const faulted = site.info.scenario !== "A";
              const confidence = latest?.predicted.probabilities
                ? latest.predicted.probabilities[String(latest.predicted.label)]
                : null;
              return (
                <div
                  key={site.info.id}
                  className={`rounded-md bg-slate-900 p-3 ${faulted ? "ring-1 ring-red-500/40" : "ring-1 ring-slate-800"}`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-200">{site.info.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SCENARIO_BADGE[site.info.scenario]}`}>
                      실제: {SCENARIO_NAME_KO[site.info.scenario]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    AI 순간 판단: {latest ? latest.predicted.name_ko : "-"}
                    {confidence !== null && confidence !== undefined && ` · 신뢰도 ${(confidence * 100).toFixed(0)}%`}
                  </p>
                  {latest && (
                    <p className="mt-1 text-xs text-slate-500">
                      RTT {latest.rtt.toFixed(1)}ms · Loss {latest.loss_flag} · Jitter {latest.jitter.toFixed(1)}ms
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            &quot;실제&quot;는 주입된 시나리오(ground truth), &quot;AI 순간 판단&quot;은 분류기가 방금 샘플 1건을 본
            결과입니다. 유실·복합 장애는 개별 요청 대부분이 정상처럼 보여 둘이 다를 수 있습니다.
          </p>
        </section>

        {/* 최근 이벤트 */}
        <section className="rounded-lg bg-slate-800 p-5 ring-1 ring-slate-700">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">최근 이벤트</h2>
            <Link href="/logs" className="text-xs font-medium text-blue-400 hover:text-blue-300">
              전체 이벤트 이력 →
            </Link>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-slate-400">
              {events ? "장애 발생/복구 이벤트가 아직 없습니다." : "불러오는 중입니다."}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentEvents.map((ev, i) => (
                <li key={`${ev.timestamp}-${i}`} className="flex items-center gap-2 border-b border-slate-800 pb-2 last:border-0">
                  <span className="w-20 flex-shrink-0 text-xs text-slate-500">{formatClock(ev.timestamp)}</span>
                  {ev.type === "fault_started" ? (
                    <span className="text-red-400">🚨 장애 발생</span>
                  ) : (
                    <span className="text-emerald-400">
                      ✅ 정상 복구{ev.elapsed_sec !== null && ` (${Math.round(ev.elapsed_sec)}초 지속)`}
                    </span>
                  )}
                  <span className="text-slate-400">— {ev.siteName}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${SCENARIO_BADGE[ev.scenario]}`}>
                    {SCENARIO_NAME_KO[ev.scenario]}
                  </span>
                  <Link href={`/logs?site=${ev.site}`} className="flex-shrink-0 text-[11px] font-medium text-blue-400 hover:text-blue-300">
                    상세 →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
