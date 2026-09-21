/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-markdown'],
  // Pin the workspace root to this directory. Without it Next infers the root
  // from the outermost lockfile, which in a git worktree is the parent
  // checkout — and Turbopack then names every chunk after the file's path from
  // there, blowing past the Windows 260-character path limit. In the main
  // checkout this resolves to the same directory Next would have picked anyway.
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
}

export default nextConfig
