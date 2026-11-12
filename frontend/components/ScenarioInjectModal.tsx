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
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-semibold text-slate-800">
          어느 네트워크에 장애를 주입시겠습니까?
        </h3>
        <p className="mb-4 text-xs text-gray-500">주입할 시나리오: {scenarioLabel}</p>

        <div className="flex flex-col gap-2">
          {sites.map((site, i) => {
            const inCooldown = site.cooldown_remaining > 0;
            return (
              <button
                key={site.id}
                onClick={() => onPick(site.id)}
                disabled={inCooldown}
                className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
              >
                <span className="font-semibold text-slate-800">
                  {REPLICA_LABELS[i] ?? site.id} (복제{i + 1})
                </span>
                <span className="ml-2 text-sm text-gray-500">{site.name}</span>
                {inCooldown && (
                  <span className="ml-2 text-xs text-amber-600">
                    조치 직후 쿨다운 {site.cooldown_remaining}초 남음
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md py-2 text-sm text-gray-400 hover:text-gray-600"
        >
          취소
        </button>
      </div>
    </div>
  );
}
