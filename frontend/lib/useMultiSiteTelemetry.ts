"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const TICK_INTERVAL_MS = 1000;
const CONNECTION_ERROR =
  "API 서버(localhost:8000)에 연결할 수 없습니다. backend/api 서버를 먼저 실행하세요.";

export type SiteState = {
  info: SiteInfo;
  telemetry: TelemetryResponse | null;
  /** 이 사이트에 마지막으로 장애를 주입한 시점 (차트 "주입 시점" 세로선용) */
  lastInjectionTime: string | null;
};

type CooldownBase = { value: number; at: number };

/**
 * 산업 네트워크(사이트) N개를 동시에 폴링한다. 기존 단일 사이트용 TelemetryContext와는
 * 완전히 별개 - /scenario 페이지의 멀티사이트 화면 전용이라 다른 페이지에 영향이 없다.
 *
 * 설계 메모:
 * - 폴링(3초)과 수동 조작(주입/조치)이 동시에 상태를 바꿀 수 있어, 요청마다 순번(seqRef)을 매기고
 *   "가장 최근에 시작된 작업"의 결과만 반영한다. 더 최신 작업이 이미 끝났다면 늦게 도착한 폴링
 *   결과는 버린다 - 안 그러면 방금 반영한 최신 상태를 옛날 응답이 덮어써버린다.
 * - 쿨다운은 서버에서 3초에 한 번만 받아오지만, 화면에는 1초 단위로 매끄럽게 줄어드는 것처럼
 *   보여주기 위해 "마지막으로 받은 값 + 그때 시각"만 기준점으로 저장해두고, 1초 타이머가 돌 때마다
 *   "기준점 - 지난 시간"으로 다시 계산한다.
 */
export function useMultiSiteTelemetry() {
  const [sites, setSites] = useState<SiteState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ siteId: SiteId; scenario: ScenarioCode } | null>(null);

  const sitesRef = useRef<SiteState[] | null>(null);
  sitesRef.current = sites;

  const seqRef = useRef(0);
  const lastInjectionRef = useRef<Partial<Record<SiteId, string | null>>>({});
  const cooldownBaseRef = useRef<Partial<Record<SiteId, CooldownBase>>>({});

  // 1초마다 리렌더를 강제해서 쿨다운 숫자가 매끄럽게 줄어들도록 한다.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const rememberCooldown = useCallback((siteId: SiteId, value: number) => {
    cooldownBaseRef.current[siteId] = { value, at: Date.now() };
  }, []);

  const liveCooldown = useCallback((siteId: SiteId, fallback: number) => {
    const base = cooldownBaseRef.current[siteId];
    if (!base) return fallback;
    const elapsedSec = Math.floor((Date.now() - base.at) / 1000);
    return Math.max(0, base.value - elapsedSec);
  }, []);

  function applySiteUpdate(siteId: SiteId, patch: Partial<SiteInfo>) {
    setSites((prev) => prev?.map((s) => (s.info.id === siteId ? { ...s, info: { ...s.info, ...patch } } : s)) ?? prev);
  }

  // 폴링 루프
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const mySeq = ++seqRef.current;
      try {
        const { sites: list } = await fetchSites();
        const telemetries = await Promise.all(list.map((s) => fetchSiteTelemetry(s.id, 50)));
        if (cancelled || mySeq !== seqRef.current) return; // 더 최신 작업이 이미 있었으면 이 결과는 버림
        list.forEach((info) => rememberCooldown(info.id, info.cooldown_remaining));
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
  }, [rememberCooldown]);

  async function injectScenario(siteId: SiteId, scenario: ScenarioCode) {
    setPending({ siteId, scenario });
    const points = sitesRef.current?.find((s) => s.info.id === siteId)?.telemetry?.points ?? [];
    const justBefore = points[points.length - 1]?.timestamp ?? null;
    try {
      const result = await setSiteScenario(siteId, scenario);
      seqRef.current++; // 이 시점 이전에 떠 있던 폴링 응답은 낡은 것으로 간주해 무시시킨다
      lastInjectionRef.current[siteId] = justBefore;
      rememberCooldown(siteId, result.cooldown_remaining);
      applySiteUpdate(siteId, { scenario: result.scenario, cooldown_remaining: result.cooldown_remaining });
      setError(null);
    } catch (e) {
      // 쿨다운(409) 같은 구체적인 사유는 그대로 보여준다. 그 외(네트워크 끊김 등)는 공통 안내문.
      setError(e instanceof Error ? e.message : CONNECTION_ERROR);
    } finally {
      setPending(null);
    }
  }

  /** 초동 조치 체크리스트를 전부 완료했을 때 호출 - 정상으로 되돌리고 1분 쿨다운을 시작시킨다.
   *  다음 폴링을 기다리지 않도록 서버 응답을 받는 즉시 화면에 반영한다(낙관적 업데이트). */
  async function resolveFault(siteId: SiteId) {
    try {
      const result = await resolveSite(siteId);
      seqRef.current++; // 이 시점 이전에 떠 있던 폴링 응답은 낡은 것으로 간주해 무시시킨다
      rememberCooldown(siteId, result.cooldown_remaining);
      applySiteUpdate(siteId, { scenario: result.scenario, cooldown_remaining: result.cooldown_remaining });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : CONNECTION_ERROR);
    }
  }

  const liveSites =
    sites?.map((s) => ({
      ...s,
      info: { ...s.info, cooldown_remaining: liveCooldown(s.info.id, s.info.cooldown_remaining) },
    })) ?? null;

  return { sites: liveSites, error, pending, injectScenario, resolveFault };
}
