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

export type ScenarioCode = "A" | "B" | "C" | "D";

export type ScenarioStatus = {
  scenario: ScenarioCode;
  code: string;
  name_ko: string;
  severity: Severity;
  action_guide: string;
};

export async function fetchScenario(): Promise<ScenarioStatus> {
  const res = await fetch(`${API_BASE}/scenario`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API 응답 오류 (${res.status})`);
  }
  return res.json();
}

export async function setScenario(scenario: ScenarioCode): Promise<ScenarioStatus> {
  const res = await fetch(`${API_BASE}/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) {
    throw new Error(`API 응답 오류 (${res.status})`);
  }
  return res.json();
}

export type CopilotResponse = {
  answer: string;
  source: string;
  fallback_used: boolean;
};

export type CopilotGuide = {
  doc_id: string;
  scenario: string;
  reference: string;
  symptom: string;
  root_cause: string;
  action_guide: string;
  cli_command: string;
};

export async function fetchAllCopilotGuides(): Promise<{ documents: CopilotGuide[] }> {
  const res = await fetch(`${API_BASE}/api/copilot/guides`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API 응답 오류 (${res.status})`);
  }
  return res.json();
}

export type StatsSummary = {
  source: "live" | "demo";
  total_count: number;
  by_label: Record<string, number>;
  avg_rtt: number | null;
  first_timestamp: string | null;
  last_timestamp: string | null;
};

export async function fetchStatsSummary(): Promise<StatsSummary> {
  const res = await fetch(`${API_BASE}/stats/summary`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API 응답 오류 (${res.status})`);
  }
  return res.json();
}

export async function fetchCopilotGuide(scenario: ScenarioCode): Promise<CopilotGuide> {
  const res = await fetch(`${API_BASE}/api/copilot/guide/${scenario}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API 응답 오류 (${res.status})`);
  }
  return res.json();
}

export type CopilotReadings = {
  rtt?: number | null;
  loss_flag?: number | null;
  jitter?: number | null;
  confidence?: number | null;
};

export async function sendCopilotMessage(
  query: string,
  currentFault?: ScenarioCode | null,
  readings?: CopilotReadings
): Promise<CopilotResponse> {
  const res = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      current_fault: currentFault ?? null,
      rtt: readings?.rtt ?? null,
      loss_flag: readings?.loss_flag ?? null,
      jitter: readings?.jitter ?? null,
      confidence: readings?.confidence ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(`API 응답 오류 (${res.status})`);
  }
  return res.json();
}
