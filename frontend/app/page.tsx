import TrafficChart from "@/components/TrafficChart";
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <h1 className="mb-8 text-4xl font-bold">
        산업 네트워크 장애 탐지 시스템
      </h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">

        {/* 상태 카드 */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">
            시스템 상태
          </h2>

          <div className="text-2xl font-bold text-green-600">
            정상 가동 중
          </div>

          <p className="mt-2 text-gray-600">
            PLC 제어 명령 정상 처리
          </p>
        </div>

        {/* RTT 카드 */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">
            현재 RTT
          </h2>

          <div className="text-3xl font-bold">
            42 ms
          </div>

          <p className="mt-2 text-gray-600">
            기준치 이내
          </p>
        </div>

        {/* AI 예측 */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">
            AI 결과
          </h2>

          <div className="text-2xl font-bold text-green-600">
            정상
          </div>

          <p className="mt-2 text-gray-600">
            장애 발생 가능성 낮음
          </p>
        </div>

      </div>

      {/* 대응 가이드 */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-2xl font-bold">
          실시간 대응 가이드
        </h2>

        <div className="rounded-md border-l-4 border-yellow-500 bg-yellow-50 p-4">
          <p className="font-semibold">
            논문 기반 운영 가이드
          </p>

          <p className="mt-2">
            RTT 상승 감지 시 트래픽 분산을 수행하고
            스위치 포트 상태를 점검하십시오.
          </p>
        </div>
      </div>
      

       {/* 실시간 네트워크 모니터링 */}
        <div className="mt-8">
          <TrafficChart />
       </div>
      

      {/* 로그 영역 */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-2xl font-bold">
          이벤트 로그
        </h2>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">시간</th>
              <th className="p-2 text-left">이벤트</th>
              <th className="p-2 text-left">상태</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-b">
              <td className="p-2">14:01:22</td>
              <td className="p-2">RTT 증가</td>
              <td className="p-2 text-yellow-600">
                경고
              </td>
            </tr>

            <tr className="border-b">
              <td className="p-2">14:03:18</td>
              <td className="p-2">패킷 손실 감지</td>
              <td className="p-2 text-red-600">
                위험
              </td>
            </tr>

            <tr>
              <td className="p-2">14:05:41</td>
              <td className="p-2">정상 복구</td>
              <td className="p-2 text-green-600">
                정상
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}