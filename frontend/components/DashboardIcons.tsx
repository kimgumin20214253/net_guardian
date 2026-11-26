// 이모지 대신 쓰는 작은 인라인 SVG 아이콘 세트(종합 관제 전용). 전부 stroke 기반 24x24
// 라인 아이콘이라 className으로 색/크기만 바꾸면 다크 테마 어디에도 자연스럽게 맞는다.
type IconProps = { className?: string };

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconFactory({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 21V10l6 4v-4l6 4V7l6 4v10H3Z" />
      <path d="M7 21v-4M12 21v-4M17 21v-4" />
    </svg>
  );
}

export function IconCheckCircle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3L15.5 9.5" />
    </svg>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 21.5 20H2.5L12 3.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconAlertOctagon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconActivity({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12h4l2.2-7 4 14 2.2-7H21" />
    </svg>
  );
}

export function IconWaves({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 10c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" />
      <path d="M3 16c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" />
    </svg>
  );
}

export function IconDroplet({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3s7 7.5 7 12a7 7 0 1 1-14 0c0-4.5 7-12 7-12Z" />
    </svg>
  );
}

export function IconRepeat({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9a5 5 0 0 1 5-5h9" />
      <path d="m15 1 3 3-3 3" />
      <path d="M20 15a5 5 0 0 1-5 5H6" />
      <path d="m9 23-3-3 3-3" />
    </svg>
  );
}

export function IconBell({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconServer({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="16" height="6" rx="1.3" />
      <rect x="4" y="14" width="16" height="6" rx="1.3" />
      <path d="M8 7h.01M8 17h.01" />
    </svg>
  );
}

export function IconShare({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="19" r="2.2" />
      <circle cx="19" cy="19" r="2.2" />
      <path d="M10.3 6.6 6.7 17.1M13.7 6.6l3.6 10.5" />
    </svg>
  );
}

export function IconBrain({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 4.5a3 3 0 0 0-3 3V9a3 3 0 0 0-2 5 3.2 3.2 0 0 0 2 5.3 3 3 0 0 0 3 2.2 2.6 2.6 0 0 0 2-1" />
      <path d="M15 4.5a3 3 0 0 1 3 3V9a3 3 0 0 1 2 5 3.2 3.2 0 0 1-2 5.3 3 3 0 0 1-3 2.2 2.6 2.6 0 0 1-2-1" />
      <path d="M12 4.5v16" />
    </svg>
  );
}

export function IconCalendarClock({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="1.6" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
      <circle cx="12" cy="14.5" r="3.3" />
      <path d="M12 13v1.6l1.1.9" />
    </svg>
  );
}
