import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true, // dynamic by default, opt into caching with 'use cache'
  reactCompiler: true,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
