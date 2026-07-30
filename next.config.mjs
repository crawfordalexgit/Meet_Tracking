/** @type {import('next').NextConfig} */

// The app serves named minors' performance, attendance and birth-year data, so
// it should not be embeddable or MIME-sniffable.
//
// A note on the CSP: script-src and style-src both need 'unsafe-inline' here.
// Every page in this codebase styles via React inline `style={{...}}` props and
// Next.js injects an inline bootstrap script. Tightening either one requires
// moving to nonces, which is a far larger change than a pre-launch fix — so this
// policy is deliberately permissive there and earns its value from
// frame-ancestors, the default-src floor and object-src 'none'.
// 'unsafe-eval' is needed only by the dev-mode React refresh runtime.
const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // https: covers meet photos served from Supabase Storage.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Supabase REST + realtime.
  `connect-src 'self' https: wss:${isDev ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing in the app uses these APIs.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

// HSTS only over TLS. Browsers ignore it on plain-http localhost, but there is
// no reason to send it in dev.
if (!isDev) {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  });
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-markdown'],
  // Don't advertise the framework version.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
}

export default nextConfig
