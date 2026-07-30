import dns from 'dns/promises';
import net from 'net';

// SSRF guard for the routes that fetch or browse a user-supplied URL
// (pages/api/ai/scrape-gala-url.js). Without this, an authenticated coach can
// point the scraper at cloud metadata (169.254.169.254), the Supabase instance,
// or anything else reachable from the serverless function, and the response is
// persisted to meets.pdf_text and returned to them.
//
// Scheme allow-list alone is not enough: an internal service on https would
// still pass. The control that actually matters is resolving the hostname and
// rejecting non-public addresses, which is why both http and https are allowed
// (plenty of club/county sites are still plain http) but every resolved address
// is checked.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIpv4(ip) {
  const n = ipv4ToInt(ip);
  const inRange = (cidrBase, bits) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(cidrBase) & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||        // "this" network
    inRange('10.0.0.0', 8) ||       // private
    inRange('100.64.0.0', 10) ||    // carrier-grade NAT
    inRange('127.0.0.0', 8) ||      // loopback
    inRange('169.254.0.0', 16) ||   // link-local — cloud metadata lives here
    inRange('172.16.0.0', 12) ||    // private
    inRange('192.0.0.0', 24) ||     // IETF protocol assignments
    inRange('192.0.2.0', 24) ||     // TEST-NET-1
    inRange('192.168.0.0', 16) ||   // private
    inRange('198.18.0.0', 15) ||    // benchmarking
    inRange('198.51.100.0', 24) ||  // TEST-NET-2
    inRange('203.0.113.0', 24) ||   // TEST-NET-3
    inRange('224.0.0.0', 4) ||      // multicast
    inRange('240.0.0.0', 4)         // reserved, includes broadcast
  );
}

function isPrivateIpv6(ip) {
  const addr = ip.toLowerCase().split('%')[0];
  if (addr === '::' || addr === '::1') return true;          // unspecified, loopback
  if (addr.startsWith('fe80')) return true;                   // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('ff')) return true;                     // multicast
  // IPv4-mapped (::ffff:169.254.169.254) — check the embedded v4 address.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true; // not an IP literal we understand — treat as unsafe
}

/**
 * Validates a user-supplied URL for outbound fetching/browsing.
 * Resolves the hostname and rejects any non-public address.
 * @returns {Promise<URL>} the parsed URL when it is safe
 * @throws {Error} with a caller-safe message when it is not
 */
export async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }

  // Credentials in the URL are a redirect/parsing-confusion vector.
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  // Literal IP: check directly, no DNS needed.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error('URL resolves to a non-public address');
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }

  if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) {
    throw new Error('URL resolves to a non-public address');
  }

  return parsed;
}

/** Non-throwing form, for filtering lists of discovered links. */
export async function isSafeUrl(rawUrl) {
  try {
    await assertSafeUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * fetch() that validates every redirect hop rather than blindly following it.
 * Plain `redirect: 'follow'` would let a public host bounce the request to an
 * internal one; `redirect: 'error'` would break the very common http→https
 * upgrade. This validates each Location before following it.
 */
export async function safeFetch(rawUrl, options = {}, maxRedirects = 3) {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(current);
    const response = await fetch(current, { ...options, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    current = new URL(location, current).toString();
  }
  throw new Error('Too many redirects');
}

/**
 * Re-checks every navigation a Puppeteer page attempts, so a redirect or a
 * meta-refresh cannot walk out of the allow-list after the initial check.
 * Sub-resources (images, css) are left alone; only document navigations matter
 * here because it is the page text we read back.
 */
export async function attachSafeNavigationGuard(page) {
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (request.resourceType() !== 'document') {
      request.continue().catch(() => {});
      return;
    }
    if (await isSafeUrl(request.url())) {
      request.continue().catch(() => {});
    } else {
      request.abort('blockedbyclient').catch(() => {});
    }
  });
}
