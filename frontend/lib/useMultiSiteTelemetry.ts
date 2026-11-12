"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchSites,
  fetchSiteTelemetry,
  setSiteScenario,
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { sites: list } = await fetchSites();
        const telemetries = await Promise.all(
          list.map((s) => fetchSiteTelemetry(s.id, 50))
        );
        if (cancelled) return;
        setSites(
          list.map((info, i) => ({
            info,
            telemetry: telemetries[i],
            lastInjectionTime: lastInjectionRef.current[info.id] ?? null,
          }))
        );
        setError(null);
      } catch {
        if (!cancelled) setError(CONNECTION_ERROR);
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
      await setSiteScenario(siteId, scenario);
      lastInjectionRef.current[siteId] = justBefore;
      setError(null);
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setPending(null);
    }
  }

  return { sites, error, pending, injectScenario };
}
