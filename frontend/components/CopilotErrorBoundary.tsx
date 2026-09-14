"use client";

import { Component, type ReactNode } from "react";

// 코파일럿 위젯 전용 에러 바운더리.
// 여기서 렌더링 오류가 나도 대시보드 본체(상태 카드/차트/이벤트 로그/시나리오 버튼)는
// 절대 같이 깨지지 않도록 격리한다 (백엔드의 copilot import try/except와 동일한 목적).
export default class CopilotErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("코파일럿 위젯 오류 (대시보드 본체에는 영향 없음):", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
