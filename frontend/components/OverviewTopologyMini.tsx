"use client";

import Link from "next/link";
import type { SiteState } from "@/lib/useMultiSiteTelemetry";
import { SCENARIO_NAME_KO, SCENARIO_DOT, SCENARIO_TEXT } from "@/lib/scenarioStyles";
import { IconServer } from "@/components/DashboardIcons";

/** /topology 페이지와 같은 "개념도" 원칙을 쓰는 축약판 - 백엔드가 실제 장비 간 물리적 연결
 *  구조를 제공하지 않으므로, SCADA 서버 → 스위치 → 3개 사이트로 단순화한 논리 구조만 보여준다.
 *  분기 색은 그 사이트의 실제 scenario(ground truth) 색이다(링크 단위 상태는 제공되지 않음). */
export default function OverviewTopologyMini({ sites }: { sites: SiteState[] | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-2 pb-3">
        <div className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 ring-1 ring-slate-700">
          <IconServer className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-300">SCADA 서버</span>
        </div>
      </div>
      <div className="mx-auto h-5 w-px bg-slate-700" />
      <div className="flex items-center justify-center pb-1">
        <div className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-slate-700">
          산업용 스위치
        </div>
      </div>

      {!sites && <p className="mt-6 text-center text-sm text-slate-400">불러오는 중입니다.</p>}

      <div className="mt-1 grid grid-cols-3 gap-3">
        {(sites ?? []).map((site) => (
          <div key={site.info.id} className="flex flex-col items-center">
            <div className={`h-5 w-0.5 ${SCENARIO_DOT[site.info.scenario]}`} />
            <Link
              href={`/monitoring?site=${site.info.id}`}
              className="flex w-full flex-col items-center gap-1 rounded-md bg-slate-900 p-2.5 text-center ring-1 ring-slate-700 transition hover:ring-slate-500"
            >
              <span className="text-[11px] font-semibold text-slate-200">
                {site.info.name.split(" - ")[0] ?? site.info.name}
              </span>
              <span className={`text-[10px] font-medium ${SCENARIO_TEXT[site.info.scenario]}`}>
                {SCENARIO_NAME_KO[site.info.scenario]}
              </span>
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-auto pt-3 text-center text-[10.5px] text-slate-500">
        개념도 · 실제 물리적 배선과 다를 수 있음
      </p>
    </div>
  );
}
