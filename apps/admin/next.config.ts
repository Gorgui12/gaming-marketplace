import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@gm/types', '@gm/utils'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
