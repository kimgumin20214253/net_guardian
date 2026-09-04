export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Severity = "ok" | "warning" | "danger" | "critical";

export type ScenarioPrediction = {
  label: number;
  code: string;
  name_ko: string;
  severity: Severity;
  action_guide: string;
  probabilities: Record<string, number> | null;
};

export type TelemetryPoint = {
  timestamp: string;
  rtt: number;
  loss_flag: number;
  jitter: number;
  true_label: number | null;
  predicted: ScenarioPrediction;
};

export type TelemetryResponse = {
  source: "live" | "demo";
  points: TelemetryPoint[];
};

export async function fetchTelemetry(
  n = 50,
  init?: RequestInit
): Promise<TelemetryResponse> {
  const res = await fetch(`${API_BASE}/telemetry/latest?n=${n}`, {
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API 응답 오류 (${res.status})`);
  }
  return res.json();
}
