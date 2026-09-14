"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTelemetry } from "@/lib/TelemetryContext";
import { SEVERITY_TEXT_COLOR, SEVERITY_BG_COLOR } from "@/lib/severityStyles";
import { fetchStatsSummary, type StatsSummary } from "@/lib/api";

const RESEARCH_BADGES = ["L4 경량 지표 3종 기반", "L7 페이로드 비열람", "실측 데이터 기반 검증"];

const FEATURE_CARDS = [
  { href: "/scenario", icon: "🎛️", title: "장애 시나리오 제어", desc: "직접 장애를 주입하고 실시간으로 대응을 연습하세요" },
  { href: "/monitoring", icon: "📡", title: "실시간 모니터링", desc: "RTT·손실·지터 추이를 실시간 차트로 확인하세요" },
  { href: "/logs", icon: "📋", title: "이벤트 로그", desc: "과거 진단 이력을 조회하고 CSV로 내보내세요" },
  { href: "/copilot", icon: "🛠️", title: "AI 코파일럿", desc: "현장 매뉴얼 기반 대응 가이드를 물어보세요" },
];

export default function HomePage() {
  const { data, scenario, error } = useTelemetry();
  const points = data?.points ?? [];
  const latest = points[points.length - 1];

  const [stats, setStats] = useState<StatsSummary | null>(null);

  useEffect(() => {
    fetchStatsSummary()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <main className="p-8">
      {/* 헤더 */}
      <h1 className="mb-1 text-3xl font-bold">NET GUARDIAN</h1>
      <p className="mb-3 text-base font-medium text-slate-600">
        L4 경량 지표 기반 실시간 장애 원인 진단 모니터링 시스템
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        {RESEARCH_BADGES.map((b) => (
          <span key={b} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            {b}
          </span>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* 현재 상태 배너 */}
      <div className="mb-6 flex items-center gap-3 rounded-lg bg-white px-5 py-3 shadow">
        <span
          className={`h-3 w-3 rounded-full ${latest ? SEVERITY_BG_COLOR[latest.predicted.severity].replace("-50", "-500") : "bg-slate-300"}`}
        />
        <span className={`font-semibold ${latest ? SEVERITY_TEXT_COLOR[latest.predicted.severity] : "text-slate-400"}`}>
          {latest ? latest.predicted.name_ko : "대기 중"}
        </span>
        {latest && (
          <span className="text-sm text-gray-500">
            RTT {latest.rtt.toFixed(1)}ms · 신뢰도{" "}
            {latest.predicted.probabilities
              ? `${(latest.predicted.probabilities[String(latest.predicted.label)] * 100).toFixed(0)}%`
              : "-"}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {data?.source === "live" ? "🟢 실시간 데이터" : "⚪ 데모 데이터"}
        </span>
      </div>

      {/* 핵심 기능 바로가기 */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURE_CARDS.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="rounded-lg bg-white p-5 shadow transition hover:shadow-md hover:ring-2 hover:ring-indigo-200"
          >
            <div className="mb-2 text-2xl">{f.icon}</div>
            <p className="font-semibold text-slate-800">{f.title}</p>
            <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
          </Link>
        ))}
      </div>

      {/* 시스템 파이프라인 - 실측값 실시간 표시 */}
      <div className="mb-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">시스템 파이프라인</h2>
        <div className="flex flex-wrap items-stretch gap-2 text-sm">
          <div className="rounded-md bg-slate-100 px-3 py-2">
            <p className="font-medium text-slate-700">① Modbus TCP 통신</p>
            <p className="mt-1 text-xs text-slate-500">
              포트 5020 · {data?.source === "live" ? "🟢 실시간 연결" : "⚪ 데모 모드"}
            </p>
          </div>
          <span className="self-center text-gray-300">▶</span>
          <div className="rounded-md bg-slate-100 px-3 py-2">
            <p className="font-medium text-slate-700">② 실측 지연/유실 재현</p>
            <p className="mt-1 text-xs text-slate-500">
              {scenario ? `${scenario.scenario} · RTT ${latest ? latest.rtt.toFixed(1) : "-"}ms` : "-"}
            </p>
          </div>
          <span className="self-center text-gray-300">▶</span>
          <div className={`rounded-md px-3 py-2 ${latest ? SEVERITY_BG_COLOR[latest.predicted.severity] : "bg-slate-100"}`}>
            <p className="font-medium text-slate-700">③ L4 경량 AI 진단</p>
            <p className={`mt-1 text-xs ${latest ? SEVERITY_TEXT_COLOR[latest.predicted.severity] : "text-slate-500"}`}>
              {latest && latest.predicted.probabilities
                ? `${latest.predicted.name_ko} (${(latest.predicted.probabilities[String(latest.predicted.label)] * 100).toFixed(1)}%)`
                : "-"}
            </p>
          </div>
          <span className="self-center text-gray-300">▶</span>
          <div className="rounded-md bg-slate-100 px-3 py-2">
            <p className="font-medium text-slate-700">④ 대응 가이드 표출</p>
            <p className="mt-1 text-xs text-slate-500">
              {latest && latest.predicted.severity !== "ok" ? "⚠️ 가이드 활성" : "대기 중"}
            </p>
          </div>
        </div>
      </div>

      {/* 누적 통계 - 실제 수집 데이터 집계 */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">누적 통계</h2>
        {!stats && <p className="text-sm text-gray-400">통계를 불러오는 중입니다.</p>}
        {stats && stats.total_count === 0 && (
          <p className="text-sm text-gray-400">아직 누적된 수집 데이터가 없습니다.</p>
        )}
        {stats && stats.total_count > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div>
                <p className="text-xs text-gray-500">총 관측 건수</p>
                <p className="text-xl font-bold">{stats.total_count.toLocaleString()}</p>
              </div>
              {Object.entries(stats.by_label).map(([name, count]) => (
                <div key={name}>
                  <p className="text-xs text-gray-500">{name}</p>
                  <p className="text-xl font-bold">{count.toLocaleString()}</p>
                </div>
              ))}
              <div>
                <p className="text-xs text-gray-500">평균 RTT</p>
                <p className="text-xl font-bold">{stats.avg_rtt}ms</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              수집 기간: {stats.first_timestamp} ~ {stats.last_timestamp}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
