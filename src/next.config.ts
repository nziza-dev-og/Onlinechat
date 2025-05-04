
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
      // Add pattern for vimeo.com (Note: Vimeo primarily hosts videos, ensure URLs are for images like thumbnails if used with next/image)
      {
          protocol: 'https',
          hostname: 'vimeo.com',
          port: '',
          pathname: '/**',
      },
      {
          protocol: 'https',
          hostname: 'i.vimeocdn.com', // Common CDN for Vimeo images
          port: '',
          pathname: '/**',
      },
       // Add pattern for YouTube thumbnails
      {
          protocol: 'https',
          hostname: 'i.ytimg.com', // Common domain for YouTube thumbnails
          port: '',
          pathname: '/vi/**',
      },
      {
          protocol: 'https',
          hostname: 'img.youtube.com', // Another possible domain
          port: '',
          pathname: '/vi/**',
      },
      // Add pattern for Instagram CDN
      {
          protocol: 'https',
          hostname: '*.cdninstagram.com', // Wildcard for Instagram CDN subdomains
          port: '',
          pathname: '/**',
      },
       {
          protocol: 'https',
          hostname: 'instagram.com', // Base domain if needed, might not serve images directly
          port: '',
          pathname: '/**',
       },
       {
          protocol: 'https',
          hostname: 'scontent.cdninstagram.com', // Specific CDN host often used
          port: '',
          pathname: '/**',
       },
       // Add pattern for the media server
       {
         protocol: 'https',
         hostname: 'movies-server-plia.onrender.com',
         port: '',
         pathname: '/**',
       },
    ],
  },
   // The `env` block is removed. NEXT_PUBLIC_ prefixed variables are automatically available client-side.
   // Ensure GOOGLE_GENAI_API_KEY remains server-side only.
};

export default nextConfig;

