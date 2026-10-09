function requirePublicHttps(value, label, api = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be an absolute HTTPS URL.`); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  const octets = host.split('.').map(Number);
  const ipv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const privateIpv4 = ipv4 && (octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 192 && octets[1] === 0 && octets[2] <= 2)
    || (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19 || octets[1] === 51 && octets[2] === 100))
    || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113));
  const reservedHost = host === 'localhost' || host.endsWith('.localhost') || host === '::' || host === '::1'
    || /^(fc|fd|fe[89ab])/.test(host.includes(':') ? host : '') || host.startsWith('::ffff:')
    || host.startsWith('2001:db8:')
    || /(^|\.)(example\.(com|net|org)|example|invalid|test|local|internal)$/.test(host) || !host.includes('.') && !host.includes(':');
  if (url.protocol !== 'https:' || privateIpv4 || reservedHost) throw new Error(`${label} must use HTTPS and a public deployment hostname; local and placeholder endpoints are not allowed.`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} cannot contain credentials, query parameters, or fragments.`);
  if (api && !/\/api\/v1\/?$/.test(url.pathname)) throw new Error(`${label} must include the backend /api/v1 prefix.`);
  if (!api && url.pathname !== '/') throw new Error(`${label} must be the Socket.io server origin, without a path.`);
  return url.toString();
}

export function validateDeploymentEnv(env) {
  requirePublicHttps(env.VITE_API_BASE_URL, 'VITE_API_BASE_URL', true);
  if (env.VITE_SOCKET_URL) requirePublicHttps(env.VITE_SOCKET_URL, 'VITE_SOCKET_URL');
}
