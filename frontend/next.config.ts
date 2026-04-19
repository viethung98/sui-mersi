import type { NextConfig } from "next";

const DEFAULT_BACKEND = 'https://comagent-dev.up.railway.app';
const BACKEND =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  DEFAULT_BACKEND;

if (BACKEND === DEFAULT_BACKEND) {
  console.warn(
    `[proxy-config] BACKEND_URL/NEXT_PUBLIC_API_URL not set, falling back to ${DEFAULT_BACKEND}`,
  );
} else {
  console.info(`[proxy-config] Proxying /api/* to ${BACKEND}`);
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
