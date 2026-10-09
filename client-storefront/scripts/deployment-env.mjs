export function validateDeploymentApiUrl(value) {
  if (!value?.trim()) throw new Error('Set VITE_API_BASE_URL to the deployed HTTPS backend API before deployment.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('VITE_API_BASE_URL must be an absolute HTTPS API URL.'); }
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
    || /^(fc|fd|fe[89ab])/.test(host.includes(':') ? host : '') || host.startsWith('::ffff:') || host.startsWith('2001:db8:')
    || /(^|\.)(example\.(com|net|org)|example|invalid|test|local|internal)$/.test(host)
    || !host.includes('.') && !host.includes(':');
  if (url.protocol !== 'https:' || privateIpv4 || reservedHost || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL must use a real public HTTPS backend, without credentials, query parameters, or localhost/example placeholders.');
  }
  if (!url.pathname.replace(/\/$/, '').endsWith('/api/v1')) throw new Error('VITE_API_BASE_URL must point to the backend /api/v1 endpoint.');
  return url.href.replace(/\/$/, '');
}
