"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSharedMultiSiteTelemetry } from "@/lib/MultiSiteTelemetryContext";
import { type SiteState } from "@/lib/useMultiSiteTelemetry";
import {
  SCENARIO_NAME_KO,
  SCENARIO_BADGE,
  SCENARIO_DOT,
  SCENARIO_RING,
  SCENARIO_TEXT,
  SCENARIO_CANONICAL_SEVERITY,
  SEVERITY_RANK,
} from "@/lib/scenarioStyles";
import { countRtoExceed, windowDeltaPct } from "@/lib/rtoEstimate";
import OverviewTopologyMini from "@/components/OverviewTopologyMini";
import OverviewMonitoringChart from "@/components/OverviewMonitoringChart";
import FaultTypeDonut from "@/components/FaultTypeDonut";
import {
  IconFactory, IconCheckCircle, IconAlertTriangle, IconAlertOctagon,
  IconActivity, IconWaves, IconDroplet, IconRepeat, IconBell, IconShare, IconBrain,
} from "@/components/DashboardIcons";

const POINT_COUNT_OPTIONS = [50, 100, 200];

function latestOf(site: SiteState) {
  const points = site.telemetry?.points ?? [];
  return points[points.length - 1] ?? null;
}

function formatClock(timestamp: string | undefined) {
  if (!timestamp) return "-";
  return timestamp.slice(11, 19) || timestamp;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const rounded = Math.round(pct);
  if (rounded === 0) return <span className="text-xs font-medium text-slate-500">변화 없음</span>;
  const up = rounded > 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-red-400" : "text-emerald-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(rounded)}%
    </span>
  );
}

function KpiCard({
  icon, iconTone, label, value, valueTone, sub,
}: {
  icon: ReactNode; iconTone: string; label: string;
  value: string | number; valueTone?: string; sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-slate-800 p-4 ring-1 ring-slate-700">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconTone}`}>{icon}</span>
        <span className="text-[13px] font-medium text-slate-400">{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-[32px] font-bold leading-none tracking-tight ${valueTone ?? "text-white"}`}>{value}</p>
        {sub}
      </div>
    </div>
  );
}

export default function HomePage() {
  // 레이아웃에서 이미 최대 200건을 받아와 모든 페이지가 공유한다 - 다시 네트워크를 타지 않고
  // "최근 N건" 선택은 그 안에서 화면에 보여줄 범위만 잘라서 쓴다(더 빠르게 즉시 반영됨).
  const { sites, events, error } = useSharedMultiSiteTelemetry();
  const [pointCount, setPointCount] = useState(50);

  const totalSites = sites?.length ?? 0;
  const faultedSites = useMemo(() => (sites ?? []).filter((s) => s.info.scenario !== "A"), [sites]);
  const normalCount = totalSites - faultedSites.length;
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

  // RTO 초과 추정 - 실제 TCP 재전송 세그먼트 수를 수집하지 않으므로, backend/fault_tiers.py와
  // 동일한 RFC 6298 + Karn 공식으로 "재전송이 있었을 가능성이 높은 샘플" 수를 추정한다.
  const rtoExceedCount = useMemo(() => {
    if (!sites) return null;
    return sites.reduce((sum, s) => sum + countRtoExceed(s.telemetry?.points ?? []), 0);
  }, [sites]);

  // KPI 변화율 - 저장된 과거 기준값이 없으므로, 지금 이미 받아온 폴링 창의 앞/뒤 절반 평균을
  // 비교한 실제 추세다(지어낸 "전일 대비"가 아님). 사이트별로 구해서 평균낸다.
  function avgWindowDelta(siteList: SiteState[] | null, key: "rtt" | "jitter" | "loss_flag") {
    if (!siteList) return null;
    const deltas = siteList
      .map((s) => windowDeltaPct(s.telemetry?.points ?? [], key))
      .filter((v): v is number => v !== null);
    if (!deltas.length) return null;
    return deltas.reduce((a, b) => a + b, 0) / deltas.length;
  }
  const rttDeltaPct = useMemo(() => avgWindowDelta(sites, "rtt"), [sites]);
  const jitterDeltaPct = useMemo(() => avgWindowDelta(sites, "jitter"), [sites]);
  const lossDeltaPct = useMemo(() => avgWindowDelta(sites, "loss_flag"), [sites]);

  const dataSource = sites?.find((s) => s.telemetry)?.telemetry?.source ?? null;
  const lastUpdated = (sites ?? [])
    .map((s) => latestOf(s)?.timestamp)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);

  // 장애 중인 사이트들을 심각도(시나리오 고정 심각도, AI 순간예측이 아님) 순으로 정렬 -
  // 코파일럿 "가장 심각한 사이트" 질문과 같은 기준. 2개 이상 장애가 겹쳐도 전부 보여주기 위해
  // 패널 안에서 페이지를 넘겨가며 볼 수 있게 한다.
  const sortedFaultedSites = useMemo(() => {
    return [...faultedSites].sort(
      (a, b) =>
        SEVERITY_RANK[SCENARIO_CANONICAL_SEVERITY[b.info.scenario]] -
        SEVERITY_RANK[SCENARIO_CANONICAL_SEVERITY[a.info.scenario]]
    );
  }, [faultedSites]);
  const faultCount = sortedFaultedSites.length;
  const [faultIndex, setFaultIndex] = useState(0);
  // 장애가 복구되어 목록이 줄어드는 사이 인덱스가 범위를 벗어날 수 있어 매 렌더마다 안전하게 자른다.
  const safeFaultIndex = faultCount ? Math.min(faultIndex, faultCount - 1) : 0;
  const worstSite = sortedFaultedSites[safeFaultIndex] ?? null;
  const worstLatest = worstSite ? latestOf(worstSite) : null;
  const worstConfidence = worstLatest?.predicted.probabilities
    ? worstLatest.predicted.probabilities[String(worstLatest.predicted.label)]
    : null;
  const worstRttDelta = worstSite ? windowDeltaPct(worstSite.telemetry?.points ?? [], "rtt") : null;

  const recentEvents = useMemo(() => {
    if (!events) return [];
    return [...events]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 6)
      .map((ev) => ({ ...ev, siteName: sites?.find((s) => s.info.id === ev.site)?.info.name ?? ev.site }));
  }, [events, sites]);

  const alertCount = warningSites.length + dangerSites.length;
  const alertSites = useMemo(() => [...dangerSites, ...warningSites], [dangerSites, warningSites]);
  const [alertMenuOpen, setAlertMenuOpen] = useState(false);

  return (
    <main className="p-8 text-slate-100">
      {/* 상단 헤더 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-white">산업 네트워크 통합 관제 시스템</h1>
          <p className="mt-0.5 text-[13px] font-medium tracking-wide text-slate-500">
            Real-time Monitoring · AI Diagnosis · Smart Response
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${error ? "text-red-400" : "text-emerald-400"}`}>
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-400" : "bg-emerald-400"}`} />
            {error ? "연결 끊김" : "시스템 정상 운영중"}
          </span>
          <span className="text-sm text-slate-400">마지막 갱신 {formatClock(lastUpdated)}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${dataSource === "live" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-300"}`}>
            {dataSource === "live" ? "실시간 데이터" : dataSource === "demo" ? "데모 데이터" : "-"}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAlertMenuOpen((v) => !v)}
              aria-label="경고/위험 사이트 목록"
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              <IconBell className="h-5 w-5" />
              {alertCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {alertCount}
                </span>
              )}
            </button>

            {alertMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAlertMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg bg-slate-800 p-2 shadow-xl ring-1 ring-slate-700">
                  <p className="px-2 py-1.5 text-xs font-semibold text-slate-400">
                    경고·위험 사이트 {alertCount}건
                  </p>
                  {alertSites.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-slate-400">현재 경고·위험 사이트가 없습니다.</p>
                  ) : (
                    <ul className="space-y-1">
                      {alertSites.map((site) => (
                        <li key={site.info.id}>
                          <Link
                            href={`/diagnosis?site=${site.info.id}`}
                            onClick={() => setAlertMenuOpen(false)}
                            className="flex items-center justify-between rounded-md px-2 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
                          >
                            <span>{site.info.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SCENARIO_BADGE[site.info.scenario]}`}>
                              {SCENARIO_NAME_KO[site.info.scenario]}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-500/10 p-4 text-red-300">{error}</div>
      )}

      {/* KPI 카드 */}
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={<IconFactory className="h-4 w-4 text-blue-300" />} iconTone="bg-blue-500/10" label="전체 사이트" value={sites ? totalSites : "-"} />
        <KpiCard icon={<IconCheckCircle className="h-4 w-4 text-emerald-300" />} iconTone="bg-emerald-500/10" label="정상 사이트" value={sites ? normalCount : "-"} valueTone="text-emerald-400" />
        <KpiCard icon={<IconAlertTriangle className="h-4 w-4 text-amber-300" />} iconTone="bg-amber-500/10" label="경고 사이트" value={sites ? warningSites.length : "-"} valueTone={warningSites.length > 0 ? "text-amber-400" : "text-white"} />
        <KpiCard icon={<IconAlertOctagon className="h-4 w-4 text-red-300" />} iconTone="bg-red-500/10" label="위험 사이트" value={sites ? dangerSites.length : "-"} valueTone={dangerSites.length > 0 ? "text-red-400" : "text-white"} />
        <KpiCard icon={<IconActivity className="h-4 w-4 text-sky-300" />} iconTone="bg-sky-500/10" label="평균 RTT" value={avgRtt !== null ? `${avgRtt.toFixed(0)}ms` : "-"} sub={<DeltaBadge pct={rttDeltaPct} />} />
        <KpiCard icon={<IconWaves className="h-4 w-4 text-purple-300" />} iconTone="bg-purple-500/10" label="평균 Jitter" value={avgJitter !== null ? `${avgJitter.toFixed(1)}ms` : "-"} sub={<DeltaBadge pct={jitterDeltaPct} />} />
        <KpiCard icon={<IconDroplet className="h-4 w-4 text-cyan-300" />} iconTone="bg-cyan-500/10" label="손실 감지 사이트" value={sites ? `${lossSiteCount}/${totalSites}` : "-"} />
        <KpiCard icon={<IconDroplet className="h-4 w-4 text-rose-300" />} iconTone="bg-rose-500/10" label="패킷 손실률" value={lossRatePct !== null ? `${lossRatePct.toFixed(1)}%` : "-"} sub={<DeltaBadge pct={lossDeltaPct} />} />
        <KpiCard
          icon={<IconRepeat className="h-4 w-4 text-indigo-300" />}
          iconTone="bg-indigo-500/10"
          label="TCP 재전송(추정)"
          value={rtoExceedCount !== null ? `${rtoExceedCount}건` : "-"}
          sub={<span className="text-[11px] text-slate-500">현재 창 기준</span>}
        />
      </section>

      {/* 2번째 줄: 토폴로지 / 통합 모니터링 / AI 장애진단 */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.5fr_1fr]">
        <div className="rounded-xl bg-slate-800 p-5 ring-1 ring-slate-700">
          <div className="mb-3 flex items-center gap-2">
            <IconShare className="h-4 w-4 text-slate-400" />
            <h2 className="text-[15px] font-semibold text-white">네트워크 토폴로지</h2>
          </div>
          <OverviewTopologyMini sites={sites} />
        </div>

        <div className="rounded-xl bg-slate-800 p-5 ring-1 ring-slate-700">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconActivity className="h-4 w-4 text-slate-400" />
              <h2 className="text-[15px] font-semibold text-white">실시간 네트워크 모니터링</h2>
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
          <OverviewMonitoringChart sites={sites} pointCount={pointCount} />
        </div>

        <div className="rounded-xl bg-slate-800 p-5 ring-1 ring-slate-700">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconBrain className="h-4 w-4 text-slate-400" />
              <h2 className="text-[15px] font-semibold text-white">AI 장애 진단</h2>
            </div>
            {faultCount > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFaultIndex((safeFaultIndex - 1 + faultCount) % faultCount)}
                  aria-label="이전 장애 사이트"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                >
                  ‹
                </button>
                <span className="text-[11px] font-medium text-slate-500">
                  {safeFaultIndex + 1}/{faultCount}
                </span>
                <button
                  type="button"
                  onClick={() => setFaultIndex((safeFaultIndex + 1) % faultCount)}
                  aria-label="다음 장애 사이트"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                >
                  ›
                </button>
              </div>
            )}
          </div>
          {!sites ? (
            <p className="text-sm text-slate-400">불러오는 중입니다.</p>
          ) : !worstSite ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <IconCheckCircle className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-slate-200">전체 사이트 정상 운영중</p>
              <p className="text-xs text-slate-500">감지된 장애가 없습니다.</p>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">장애 감지</span>
                {worstConfidence !== null && worstConfidence !== undefined && (
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                    신뢰도 {(worstConfidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className={`text-xl font-bold ${SCENARIO_TEXT[worstSite.info.scenario]}`}>
                {SCENARIO_NAME_KO[worstSite.info.scenario]} 감지
              </p>
              <p className="mb-3 text-sm text-slate-400">{worstSite.info.name}</p>

              {worstLatest && (
                <div className="mb-3 space-y-1.5 rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
                  <p className="mb-1 font-semibold text-slate-400">실측 근거</p>
                  <div className="flex items-center justify-between">
                    <span>RTT {worstLatest.rtt.toFixed(0)}ms</span>
                    <DeltaBadge pct={worstRttDelta} />
                  </div>
                  <p>패킷 손실률 {(worstLatest.loss_flag * 100).toFixed(0)}%</p>
                  <p>Jitter {worstLatest.jitter.toFixed(1)}ms</p>
                </div>
              )}

              <Link
                href={`/diagnosis?site=${worstSite.info.id}`}
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                대응 가이드 보기 →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 3번째 줄: 사이트별 상태 / 최근 이벤트 / 장애유형 분포 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr_0.9fr]">
        <div className="rounded-xl bg-slate-800 p-5 ring-1 ring-slate-700">
          <h2 className="mb-4 text-[15px] font-semibold text-white">사이트별 네트워크 상태</h2>
          {!sites && <p className="text-sm text-slate-400">사이트 목록을 불러오는 중입니다.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(sites ?? []).map((site) => {
              const latest = latestOf(site);
              return (
                <div key={site.info.id} className={`rounded-lg bg-slate-900 p-3.5 ${SCENARIO_RING[site.info.scenario]}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`h-2 w-2 rounded-full ${SCENARIO_DOT[site.info.scenario]}`} />
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SCENARIO_BADGE[site.info.scenario]}`}>
                      {SCENARIO_NAME_KO[site.info.scenario]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-100">{site.info.name}</p>
                  <p className="mb-2 text-[11px] text-slate-500">포트 {site.info.port} · Modbus TCP</p>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div><p className="text-[10px] text-slate-500">RTT</p><p className="text-sm font-semibold text-slate-200">{latest ? `${latest.rtt.toFixed(0)}` : "-"}</p></div>
                    <div><p className="text-[10px] text-slate-500">Loss</p><p className="text-sm font-semibold text-slate-200">{latest ? latest.loss_flag : "-"}</p></div>
                    <div><p className="text-[10px] text-slate-500">Jitter</p><p className="text-sm font-semibold text-slate-200">{latest ? `${latest.jitter.toFixed(0)}` : "-"}</p></div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-[10.5px]">
                    <span className="text-slate-500">{latest ? formatClock(latest.timestamp) : "-"} 수신</span>
                    <Link href={`/monitoring?site=${site.info.id}`} className="font-medium text-blue-400 hover:text-blue-300">
                      →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl bg-slate-800 p-5 ring-1 ring-slate-700">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-white">최근 이벤트</h2>
            <Link href="/logs" className="text-xs font-medium text-blue-400 hover:text-blue-300">더보기 →</Link>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-slate-400">{events ? "장애 발생/복구 이벤트가 아직 없습니다." : "불러오는 중입니다."}</p>
          ) : (
            <ul className="space-y-2.5 text-[13px]">
              {recentEvents.map((ev, i) => (
                <li key={`${ev.timestamp}-${i}`} className="flex items-center gap-2 border-b border-slate-800 pb-2.5 last:border-0 last:pb-0">
                  <span className="w-14 flex-shrink-0 text-[11px] text-slate-500">{formatClock(ev.timestamp)}</span>
                  <span className="truncate text-slate-300">{ev.siteName}</span>
                  <span className={`ml-auto flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    ev.type === "fault_started" ? SCENARIO_BADGE[ev.scenario] : "bg-emerald-500/10 text-emerald-400"
                  }`}>
                    {ev.type === "fault_started" ? SCENARIO_NAME_KO[ev.scenario].toUpperCase() : "RECOVER"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl bg-slate-800 p-5 ring-1 ring-slate-700">
          <h2 className="mb-3 text-[15px] font-semibold text-white">장애 유형 분포 (최근 24시간)</h2>
          <FaultTypeDonut />
        </div>
      </section>
    </main>
  );
}
