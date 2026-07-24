/** @type {import('next').NextConfig} */
const nextConfig = {
  // The reviewer-facing report is a server component that reads the committed
  // baseline from disk at build time. Nothing here needs the Node runtime at
  // the edge, so defaults are fine.
}

export default nextConfig
