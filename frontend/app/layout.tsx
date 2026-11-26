import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Copilot from "@/components/Copilot";
import CopilotErrorBoundary from "@/components/CopilotErrorBoundary";
import Sidebar from "@/components/Sidebar";
import { TelemetryProvider } from "@/lib/TelemetryContext";
import { MultiSiteTelemetryProvider } from "@/lib/MultiSiteTelemetryContext";
import { CopilotUIProvider } from "@/lib/CopilotUIContext";
import { fetchTelemetry } from "@/lib/api";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Net Guardian",
  description: "산업 네트워크 장애 실시간 진단 모니터링 시스템",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 사이드바로 여러 페이지에 나뉘어도 최초 로딩 시 깜빡임 없이 뜨도록 레이아웃에서 한 번만 서버사이드로 미리 가져온다.
  const initial = await fetchTelemetry(50).catch(() => null);

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 대시보드 전체 기본 글꼴(나눔고딕) - next/font/google은 빌드 시점에 구글 폰트 서버에서
          파일을 내려받아야 하는데, 한글 폰트는 유니코드 서브셋이 많아 네트워크가 막힌 환경에서는
          빌드 자체가 실패한다. 대신 런타임에 브라우저가 직접 받아오는 방식(link 태그)을 쓴다. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap"
        rel="stylesheet"
      />
      <body className="flex h-screen overflow-hidden">
        <TelemetryProvider initial={initial}>
          <MultiSiteTelemetryProvider>
            <CopilotUIProvider>
              <Sidebar />
              <div className="flex-1 overflow-y-auto bg-slate-900">{children}</div>
              {/* 실시간 진단 대시보드와 완전히 독립된 보조 위젯 - 에러 바운더리로 격리 */}
              <CopilotErrorBoundary>
                <Copilot />
              </CopilotErrorBoundary>
            </CopilotUIProvider>
          </MultiSiteTelemetryProvider>
        </TelemetryProvider>
      </body>
    </html>
  );
}
