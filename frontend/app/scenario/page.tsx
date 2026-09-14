"use client";

import { useTelemetry } from "@/lib/TelemetryContext";
import { useCopilotUI } from "@/lib/CopilotUIContext";
import { SEVERITY_TEXT_COLOR } from "@/lib/severityStyles";
import { type ScenarioCode } from "@/lib/api";
import ActionChecklist from "@/components/ActionChecklist";
import TrafficChart from "@/components/TrafficChart";
import type { TelemetryPoint } from "@/lib/api";

const SCENARIO_BUTTONS: { code: ScenarioCode; label: string }[] = [
  { code: "A", label: "정상" },
  { code: "B", label: "지연 장애" },
  { code: "C", label: "유실 장애" },
  { code: "D", label: "복합 장애" },
];

const LABEL_TO_SCENARIO: Record<number, ScenarioCode> = { 0: "A", 1: "B", 2: "C", 3: "D" };

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function splitByInjection(points: TelemetryPoint[], injectionTime: string | null) {
  if (!injectionTime) return null;
  const idx = points.findIndex((p) => p.timestamp === injectionTime);
  if (idx === -1) return null;
  const before = points.slice(0, idx + 1);
  const after = points.slice(idx + 1);
  if (before.length === 0 || after.length === 0) return null;
  return { before, after };
}

export default function ScenarioPage() {
  const { data, scenario, pendingScenario, handleScenarioClick, error, lastInjectionTime } = useTelemetry();
  const { askCopilot } = useCopilotUI();
  const points = data?.points ?? [];
  const latest = points[points.length - 1];
  const split = splitByInjection(points, lastInjectionTime);

  // 유실(C) 장애처럼 대부분의 순간은 정상처럼 보이고 드물게만 이상이 터지는 유형은,
  // "지금 이 한 점"만 보면 정상으로 보일 수 있다. 최근 20건을 같이 보여줘서 오해를 줄인다.
  const RECENT_WINDOW = 20;
  const recentWindow = points.slice(-RECENT_WINDOW);
  const recentFaultCount = recentWindow.filter((p) => p.predicted.severity !== "ok").length;

  return (
    <main className="p-8">
      <h1 className="mb-2 text-3xl font-bold">장애 시나리오 제어</h1>
      <p className="mb-6 text-sm text-gray-500">
        버튼을 누르면 Modbus 서버가 실제로 해당 조건(지연/유실)을 재현하고, 그 결과를 AI가 실시간으로 진단합니다.
        직접 장애를 발생시켜보고, 아래 화면에서 바로 대응 절차를 연습하세요.
        (network/server.py + packet_analyzer.py가 켜져 있어야 효과가 보입니다)
      </p>

      {error && (
        <div className="mb-6 rounded-md border-l-4 border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* 1. 주입 */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">① 시나리오 주입</h2>
        <div className="flex flex-wrap gap-3">
          {SCENARIO_BUTTONS.map(({ code, label }) => {
            const isActive = scenario?.scenario === code;
            const isPending = pendingScenario === code;
            return (
              <button
                key={code}
                onClick={() => handleScenarioClick(code)}
                disabled={pendingScenario !== null}
                className={`rounded-md px-4 py-2 font-semibold shadow transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isActive
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {isPending ? "전환 중..." : `${code} · ${label}`}
              </button>
            );
          })}
        </div>

        {scenario && (
          <p className="mt-4 text-sm text-gray-500">
            방금 명령한 시나리오(정답): <span className="font-semibold">{scenario.scenario} · {scenario.name_ko}</span>
          </p>
        )}
      </div>

      {/* 2. 관찰 - 버튼 누른 결과를 페이지 이동 없이 바로 확인 */}
      <div className="mt-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">② 실시간 관찰</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-xs text-gray-500">AI 실시간 진단(이 순간)</p>
            <div className={`mt-1 text-xl font-bold ${latest ? SEVERITY_TEXT_COLOR[latest.predicted.severity] : "text-gray-400"}`}>
              {latest ? latest.predicted.name_ko : "-"}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {latest && latest.predicted.probabilities
                ? `신뢰도 ${(latest.predicted.probabilities[String(latest.predicted.label)] * 100).toFixed(1)}%`
                : ""}
            </p>
            {recentWindow.length > 0 && (
              <p className={`mt-1.5 border-t pt-1.5 text-xs ${recentFaultCount > 0 ? "text-orange-600 font-medium" : "text-gray-400"}`}>
                {recentFaultCount > 0
                  ? `⚠️ 최근 ${recentWindow.length}건 중 이상 ${recentFaultCount}건 감지`
                  : `최근 ${recentWindow.length}건 모두 정상`}
              </p>
            )}
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-xs text-gray-500">RTT</p>
            <div className="mt-1 text-xl font-bold">{latest ? `${latest.rtt.toFixed(1)} ms` : "-"}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-xs text-gray-500">Jitter · Loss</p>
            <div className="mt-1 text-xl font-bold">
              {latest ? `${latest.jitter.toFixed(1)}ms · ${latest.loss_flag}` : "-"}
            </div>
          </div>
        </div>

        {latest && scenario && LABEL_TO_SCENARIO[latest.predicted.label] !== scenario.scenario && (
          <p className="mt-3 text-xs text-gray-400">
            ※ 명령한 시나리오와 "이 순간"의 AI 진단이 다를 수 있습니다. 유실(C)처럼 대부분은 정상처럼 보이다가
            드물게만 이상이 발생하는 간헐적 장애 유형은, 하필 정상인 순간에 값을 확인하면 이렇게 보일 수 있습니다
            (위 "최근 {RECENT_WINDOW}건" 수치를 함께 확인하세요). 또는 지연·유실처럼 값 자체가 애매한 경계 구간이라
            AI가 헷갈렸을 수도 있습니다 — 둘 다 오류가 아니라 실제 모델 동작의 일부입니다.
          </p>
        )}

        {split && (
          <div className="mt-4 rounded-md border border-indigo-100 bg-indigo-50/50 p-4">
            <p className="mb-3 text-sm font-semibold text-indigo-900">주입 전후 비교</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div />
              <p className="text-center text-xs font-medium text-gray-500">주입 전</p>
              <p className="text-center text-xs font-medium text-gray-500">주입 후</p>

              <p className="text-gray-500">평균 RTT</p>
              <p className="text-center font-semibold">{avg(split.before.map((p) => p.rtt)).toFixed(1)} ms</p>
              <p className="text-center font-semibold">{avg(split.after.map((p) => p.rtt)).toFixed(1)} ms</p>

              <p className="text-gray-500">손실률</p>
              <p className="text-center font-semibold">
                {(avg(split.before.map((p) => p.loss_flag)) * 100).toFixed(0)}%
              </p>
              <p className="text-center font-semibold">
                {(avg(split.after.map((p) => p.loss_flag)) * 100).toFixed(0)}%
              </p>

              <p className="text-gray-500">평균 Jitter</p>
              <p className="text-center font-semibold">{avg(split.before.map((p) => p.jitter)).toFixed(1)} ms</p>
              <p className="text-center font-semibold">{avg(split.after.map((p) => p.jitter)).toFixed(1)} ms</p>
            </div>
          </div>
        )}

        <div className="mt-4">
          <TrafficChart points={points} injectionTime={lastInjectionTime} />
        </div>
      </div>

      {/* 3. 대응 - 체크리스트 + 코파일럿 */}
      {latest && latest.predicted.severity !== "ok" && (
        <div className="mt-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-xl font-semibold">③ 대응</h2>
          <ActionChecklist scenario={LABEL_TO_SCENARIO[latest.predicted.label]} />
          <button
            onClick={() =>
              askCopilot(`지금 "${latest.predicted.name_ko}" 상황인데, 구체적으로 어떻게 조치해야 해?`)
            }
            className="mt-4 flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            🛠️ 이 상황, 코파일럿에게 자세히 물어보기 →
          </button>
        </div>
      )}
    </main>
  );
}
