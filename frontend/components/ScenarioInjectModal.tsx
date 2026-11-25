"use client";

import type { SiteId, SiteInfo } from "@/lib/api";

// 사용자 요청 표기: A(복제1), B(복제2), C(복제3). 시나리오 버튼(A/B/C/D)과는
// 별개의 글자 체계이므로 헷갈리지 않도록 사이트 실제 이름을 같이 보여준다.
const REPLICA_LABELS = ["A", "B", "C"];

export default function ScenarioInjectModal({
  scenarioLabel,
  sites,
  onPick,
  onClose,
}: {
  scenarioLabel: string;
  sites: SiteInfo[];
  onPick: (siteId: SiteId) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-slate-800 p-6 shadow-xl ring-1 ring-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-semibold text-white">
          어느 네트워크에 장애를 주입시겠습니까?
        </h3>
        <p className="mb-4 text-xs text-slate-400">주입할 시나리오: {scenarioLabel}</p>

        <div className="flex flex-col gap-2">
          {sites.map((site, i) => {
            const inCooldown = site.cooldown_remaining > 0;
            return (
              <button
                key={site.id}
                onClick={() => onPick(site.id)}
                disabled={inCooldown}
                className="rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-left transition hover:border-blue-500 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-700 disabled:hover:bg-slate-900"
              >
                <span className="font-semibold text-slate-100">
                  {REPLICA_LABELS[i] ?? site.id} (복제{i + 1})
                </span>
                <span className="ml-2 text-sm text-slate-400">{site.name}</span>
                {inCooldown && (
                  <span className="ml-2 text-xs text-amber-400">
                    조치 직후 쿨다운 {site.cooldown_remaining}초 남음
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md py-2 text-sm text-slate-500 hover:text-slate-300"
        >
          취소
        </button>
      </div>
    </div>
  );
}
