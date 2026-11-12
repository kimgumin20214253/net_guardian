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

// ── 산업 네트워크(사이트) 여러 개 ──────────────────────────────
// backend/api/main.py의 SITES와 1:1로 대응한다. site-1은 기존 단일 사이트 엔드포인트
// (/scenario, /telemetry/latest)와 같은 데이터를 보므로, 기존 페이지는 그대로 두고
// 이 함수들은 /scenario 페이지의 멀티사이트 화면에서만 쓴다.
export type SiteId = "site-1" | "site-2" | "site-3";

export type SiteInfo = {
  id: SiteId;
  name: string;
  port: number;
  scenario: ScenarioCode;
  /** 초동 조치 완료 직후 남은 쿨다운 시간(초). 0이면 쿨다운 아님 - 이 사이트에 바로 장애를 걸 수 있음. */
  cooldown_remaining: number;
};

/** 백엔드가 4xx/5xx에 {"detail": "..."} 형태로 보내는 사람이 읽을 수 있는 메시지를 최대한 그대로 꺼내 쓴다
 *  (예: 쿨다운 중 장애 주입 시도 -> 409 "~은(는) 방금 조치가 완료되어 N초 동안..."). */
async function throwApiError(res: Response): Promise<never> {
  let detail: string | null = null;
  try {
    const body = await res.json();
    detail = typeof body?.detail === "string" ? body.detail : null;
  } catch {
    // 응답 본문이 JSON이 아니면 무시하고 아래 기본 메시지를 사용
  }
  throw new Error(detail ?? `API 응답 오류 (${res.status})`);
}

export async function fetchSites(): Promise<{ sites: SiteInfo[] }> {
  const res = await fetch(`${API_BASE}/sites`, { cache: "no-store" });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export async function fetchSiteTelemetry(siteId: SiteId, n = 50): Promise<TelemetryResponse> {
  const res = await fetch(`${API_BASE}/sites/${siteId}/telemetry/latest?n=${n}`, {
    cache: "no-store",
  });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

export async function setSiteScenario(
  siteId: SiteId,
  scenario: ScenarioCode
): Promise<ScenarioStatus & { site: SiteId; cooldown_remaining: number }> {
  const res = await fetch(`${API_BASE}/sites/${siteId}/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) return throwApiError(res);
  return res.json();
}

/** 초동 조치 체크리스트를 전부 완료했을 때 호출 - 정상(A)로 되돌리고 1분 쿨다운을 시작한다. */
export async function resolveSite(
  siteId: SiteId
): Promise<ScenarioStatus & { site: SiteId; cooldown_remaining: number }> {
  const res = await fetch(`${API_BASE}/sites/${siteId}/resolve`, { method: "POST" });
  if (!res.ok) return throwApiError(res);
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
