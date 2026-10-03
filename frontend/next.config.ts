import type { NextConfig } from 'next';

// D-018: the browser calls the API on the same address (`/api/...`); Next forwards it to the API on
// the same machine. `API_URL` is the internal address (it ends in `/api`, like the backend routes).
// Rewrites are resolved at build time, so API_URL must be set when running `next build`.
const apiUrl = process.env.API_URL;

const nextConfig: NextConfig = {
  cacheComponents: true, // dynamic by default, opt into caching with 'use cache'
  reactCompiler: true,
  typedRoutes: true,
  async rewrites() {
    if (!apiUrl) throw new Error('API_URL is required: next.config.ts forwards /api to it (D-018)');
    return {
      beforeFiles: [
        // Tactic 24: `/` serves Home straight away (a redirect costs a round trip).
        { source: '/', destination: '/admin' },
        { source: '/api/:path*', destination: `${apiUrl}/:path*` },
      ],
    };
  },
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
