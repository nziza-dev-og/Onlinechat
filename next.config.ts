
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      // Add pattern for Firebase Storage
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/**', // Allow images from any bucket
      },
      // Add pattern for i.pinimg.com
      {
          protocol: 'https',
          hostname: 'i.pinimg.com',
          port: '',
          pathname: '/**',
      },
    ],
  },
   // The `env` block is removed. NEXT_PUBLIC_ prefixed variables are automatically available client-side.
   // Ensure GOOGLE_GENAI_API_KEY remains server-side only.
};

export default nextConfig;

