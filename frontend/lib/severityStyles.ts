import type { Severity } from "@/lib/api";

export const SEVERITY_TEXT_COLOR: Record<Severity, string> = {
  ok: "text-green-600",
  warning: "text-yellow-600",
  danger: "text-red-600",
  critical: "text-purple-600",
};

export const SEVERITY_BORDER_COLOR: Record<Severity, string> = {
  ok: "border-green-500",
  warning: "border-yellow-500",
  danger: "border-red-500",
  critical: "border-purple-500",
};

export const SEVERITY_BG_COLOR: Record<Severity, string> = {
  ok: "bg-green-50",
  warning: "bg-yellow-50",
  danger: "bg-red-50",
  critical: "bg-purple-50",
};
