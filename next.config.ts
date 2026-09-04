import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Statically checks every <Link href>, so a nav entry pointing at a route
  // that does not exist fails the build instead of shipping a 404.
  typedRoutes: true,
}

export default nextConfig
