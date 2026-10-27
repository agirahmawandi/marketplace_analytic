/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' }
    ],
    unoptimized: true
  },
  serverExternalPackages: ['playwright'],
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/.chrome-cdp-profile/**',
        '**/.browser-profile/**',
        '**/data/**',
      ],
    };
    return config;
  },
};

export default nextConfig;
