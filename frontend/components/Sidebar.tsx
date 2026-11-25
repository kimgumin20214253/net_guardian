"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** 아직 실제 화면이 없는 메뉴 - 링크를 걸지 않고 "준비 중"으로만 표시한다
   *  (가짜 페이지로 위장하지 않기 위함. 단계적으로 구현되면 href를 채운다). */
  disabled?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "MONITORING",
    items: [
      { href: "/", label: "종합 관제", icon: "🛰️" },
      { href: "/topology", label: "네트워크 토폴로지", icon: "🕸️" },
      { href: "/monitoring", label: "실시간 모니터링", icon: "📡" },
      { href: "/diagnosis", label: "AI 장애 진단", icon: "🧠" },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { href: "/scenario", label: "장애 시뮬레이션", icon: "🎛️" },
      { href: "/logs", label: "이벤트 이력", icon: "📋" },
      { href: "/copilot", label: "AI 코파일럿", icon: "🛠️" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-72 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-200">
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-6">
        <span className="text-2xl">🛡️</span>
        <div>
          <p className="text-xl font-bold tracking-tight text-white">NET GUARDIAN</p>
          <p className="text-[11px] font-medium tracking-wide text-slate-500">
            INDUSTRIAL NETWORK CONTROL CENTER
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="mb-1.5 px-3.5 text-[11px] font-semibold tracking-wider text-slate-500">
              {group.title}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                if (item.disabled) {
                  return (
                    <span
                      key={item.label}
                      title="아직 구현되지 않은 화면입니다"
                      className="flex items-center gap-3 rounded-md px-3.5 py-3 text-base font-medium text-slate-600"
                    >
                      <span className="text-lg opacity-50">{item.icon}</span>
                      {item.label}
                      <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        준비 중
                      </span>
                    </span>
                  );
                }
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-md px-3.5 py-3 text-base font-medium transition ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <span
          title="아직 구현되지 않은 화면입니다"
          className="flex items-center gap-3 rounded-md px-3.5 py-3 text-base font-medium text-slate-600"
        >
          <span className="text-lg opacity-50">⚙️</span>
          시스템 설정
          <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            준비 중
          </span>
        </span>
      </div>
    </aside>
  );
}
