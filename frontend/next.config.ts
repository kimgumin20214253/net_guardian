import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 터널(cloudflared 등)로 외부에 공개할 때, 브라우저가 "자기 컴퓨터의 localhost:8000"으로
  // 잘못 요청하지 않도록 /api-proxy/* 요청을 이 서버(Next.js)가 대신 백엔드(127.0.0.1:8000)로
  // 전달해준다. 평소 로컬 개발(NEXT_PUBLIC_API_URL 미설정)에는 영향 없음 - 그땐 프론트가 여전히
  // http://localhost:8000을 직접 호출한다.
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
