"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 순수 네비게이션 전용. 상태 요약은 홈 화면 배너로 옮겨서 중복을 없앴다
// (엔터프라이즈 콘솔들도 사이드바는 메뉴만, 상태/헬스는 콘텐츠 영역에 둔다).
const NAV_ITEMS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/scenario", label: "장애 시나리오 제어", icon: "🎛️" },
  { href: "/monitoring", label: "실시간 모니터링", icon: "📡" },
  { href: "/logs", label: "이벤트 로그", icon: "📋" },
  { href: "/copilot", label: "현장 매뉴얼 & 코파일럿", icon: "🛠️" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-72 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-200">
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-6">
        <span className="text-2xl">🛡️</span>
        <span className="text-xl font-bold tracking-tight text-white">NET GUARDIAN</span>
      </div>

      <nav className="flex flex-col gap-1.5 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3.5 py-3 text-base font-medium transition ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
