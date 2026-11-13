"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchSites,
  fetchSiteTelemetry,
  setSiteScenario,
  resolveSite,
  type SiteId,
  type SiteInfo,
  type ScenarioCode,
  type TelemetryResponse,
} from "@/lib/api";

const POLL_INTERVAL_MS = 3000;
const CONNECTION_ERROR =
  "API 서버(localhost:8000)에 연결할 수 없습니다. backend/api 서버를 먼저 실행하세요.";

export type SiteState = {
  info: SiteInfo;
  telemetry: TelemetryResponse | null;
  /** 이 사이트에 마지막으로 장애를 주입한 시점 (차트 "주입 시점" 세로선용) */
  lastInjectionTime: string | null;
};

/**
 * 산업 네트워크(사이트) N개를 동시에 폴링한다. 기존 단일 사이트용 TelemetryContext와는
 * 완전히 별개 - /scenario 페이지의 멀티사이트 화면 전용이라 다른 페이지에 영향이 없다.
 */
export function useMultiSiteTelemetry() {
  const [sites, setSites] = useState<SiteState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ siteId: SiteId; scenario: ScenarioCode } | null>(null);
  const lastInjectionRef = useRef<Partial<Record<SiteId, string | null>>>({});
  const sitesRef = useRef<SiteState[] | null>(null);
  sitesRef.current = sites;

  // 폴링 요청과 수동 조작(주입/조치)이 동시에 /scenario를 건드릴 수 있는데, 먼저 보낸 폴링 요청이
  // 나중에 도착하면 방금 반영된 최신 상태를 오래된 값으로 덮어써버린다. 요청마다 순번을 매겨서,
  // 응답이 왔을 때 그게 여전히 "가장 최근에 보낸 요청"일 때만 반영한다.
  const seqRef = useRef(0);

  // 쿨다운을 1초마다 매끄럽게 줄이기 위한 로컬 타이머. 서버는 3초에 한 번만 값을 주므로,
  // 그 값을 기준점으로 저장해두고 화면에는 "기준점 - 지난 시간"으로 매초 다시 계산해서 보여준다.
  const cooldownBaseRef = useRef<Partial<Record<SiteId, { value: number; at: number }>>>({});
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function setCooldownBase(siteId: SiteId, value: number) {
    cooldownBaseRef.current[siteId] = { value, at: Date.now() };
  }

  function liveCooldown(siteId: SiteId, fallback: number): number {
    const base = cooldownBaseRef.current[siteId];
    if (!base) return fallback;
    const elapsed = Math.floor((Date.now() - base.at) / 1000);
    return Math.max(0, base.value - elapsed);
  }

  // 화면에 노출하는 sites는 폴링으로 받은 원본 그대로가 아니라, 쿨다운만 매초 다시 계산해 끼워넣은 버전이다.
  const liveSites =
    sites?.map((s) => ({
      ...s,
      info: { ...s.info, cooldown_remaining: liveCooldown(s.info.id, s.info.cooldown_remaining) },
    })) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const mySeq = ++seqRef.current;
      try {
        const { sites: list } = await fetchSites();
        const telemetries = await Promise.all(list.map((s) => fetchSiteTelemetry(s.id, 50)));
        if (cancelled || mySeq !== seqRef.current) return; // 그사이 더 최신 요청/수동조작이 있었으면 폐기
        list.forEach((info) => setCooldownBase(info.id, info.cooldown_remaining));
        setSites(
          list.map((info, i) => ({
            info,
            telemetry: telemetries[i],
            lastInjectionTime: lastInjectionRef.current[info.id] ?? null,
          }))
        );
        setError(null);
      } catch {
        if (!cancelled && mySeq === seqRef.current) setError(CONNECTION_ERROR);
      }
    }

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function injectScenario(siteId: SiteId, scenario: ScenarioCode) {
    setPending({ siteId, scenario });
    const current = sitesRef.current?.find((s) => s.info.id === siteId);
    const points = current?.telemetry?.points ?? [];
    const justBefore = points[points.length - 1]?.timestamp ?? null;
    try {
      const result = await setSiteScenario(siteId, scenario);
      // 이 시점 이전에 이미 날아가 있던 폴링 응답은 낡은 것으로 간주해 무시시킨다.
      seqRef.current++;
      lastInjectionRef.current[siteId] = justBefore;
      setCooldownBase(siteId, result.cooldown_remaining);
      setSites(
        (prev) =>
          prev?.map((s) =>
            s.info.id === siteId
              ? { ...s, info: { ...s.info, scenario: result.scenario, cooldown_remaining: result.cooldown_remaining } }
              : s
          ) ?? prev
      );
      setError(null);
    } catch (e) {
      // 쿨다운(409) 같은 구체적인 사유는 그대로 보여준다. 그 외(네트워크 끊김 등)는 공통 안내문.
      setError(e instanceof Error ? e.message : CONNECTION_ERROR);
    } finally {
      setPending(null);
    }
  }

  /** 초동 조치 체크리스트를 전부 완료했을 때 호출 - 정상으로 되돌리고 1분 쿨다운을 시작시킨다.
   *  다음 3초 폴링을 기다리지 않도록, 서버 응답을 받는 즉시 화면에 바로 반영한다(낙관적 업데이트). */
  async function resolveFault(siteId: SiteId) {
    try {
      const result = await resolveSite(siteId);
      // 이 시점 이전에 이미 날아가 있던 폴링 응답은 낡은 것으로 간주해 무시시킨다.
      seqRef.current++;
      setCooldownBase(siteId, result.cooldown_remaining);
      setSites(
        (prev) =>
          prev?.map((s) =>
            s.info.id === siteId
              ? { ...s, info: { ...s.info, scenario: result.scenario, cooldown_remaining: result.cooldown_remaining } }
              : s
          ) ?? prev
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : CONNECTION_ERROR);
    }
  }

  return { sites: liveSites, error, pending, injectScenario, resolveFault };
}
