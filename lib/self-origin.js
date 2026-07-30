// The app's own origin, for the export routes that drive a headless browser
// back into this deployment.
//
// It must NOT come from req.headers.host / x-forwarded-proto. Those are
// caller-controlled, and export-report.js / generate-pdf.js inject the user's
// Supabase session (including the refresh token) into whatever origin the page
// loads. A forged Host header would write those tokens into an attacker's
// localStorage. VERCEL_URL and friends are set by the platform, not the caller.

export function getSelfOrigin() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  if (process.env.NODE_ENV !== 'production') {
    return `http://localhost:${process.env.PORT || 3000}`;
  }

  throw new Error(
    'Cannot determine the site origin. Set NEXT_PUBLIC_SITE_URL in the hosting environment.'
  );
}

/**
 * Fully decodes a path (repeatedly, so %252e%252e cannot hide a traversal from
 * a single-pass check) and validates the result. Returns the decoded form for
 * inspection; callers should build the URL from the ORIGINAL string so that
 * legitimate percent-encoding in query values survives.
 */
export function decodePathForValidation(rawPath, maxPasses = 5) {
  let current = String(rawPath);
  for (let i = 0; i < maxPasses; i++) {
    let next;
    try {
      next = decodeURIComponent(current);
    } catch {
      throw new Error('Invalid path encoding');
    }
    if (next === current) return current;
    current = next;
  }
  throw new Error('Path encoding nested too deeply');
}
