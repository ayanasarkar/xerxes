import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import type { ScannerConfig, ScanRequest } from '../types.js';

export class PolicyError extends Error {}
export function parseTarget(raw: unknown): URL {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(raw)) throw new PolicyError('Invalid target URL');
  let url: URL;
  try { url = new URL(raw); } catch { throw new PolicyError('Invalid target URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || url.hash ||
      (url.port && !['80', '443'].includes(url.port))) throw new PolicyError('Only credential-free HTTP(S) URLs on ports 80/443 are allowed');
  // Avoid ambiguous zone IDs and local discovery names even before resolution.
  if (/(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|onion)\.?$/i.test(url.hostname) || url.hostname.endsWith('.')) {
    throw new PolicyError('Prohibited hostname');
  }
  return url;
}
export function publicAddress(address: string): boolean {
  try {
    if (address === '168.63.129.16') return false; // Azure platform virtual IP, not an Internet scan target.
    const parsed = ipaddr.parse(address);
    // ipaddr marks mapped, translation, multicast, reserved, private, and link-local ranges separately.
    return parsed.range() === 'unicast';
  } catch { return false; }
}
export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
export const systemResolver: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true });
export async function resolvePublic(url: URL, resolver: Resolver = systemResolver): Promise<{ address: string; family: number }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolver(hostname);
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new PolicyError('Target resolves to a prohibited network');
  return addresses[0]!;
}
export function authorize(request: ScanRequest, url: URL, config: ScannerConfig): number {
  if (request.mode !== undefined && request.mode !== 'passive' && request.mode !== 'active') throw new PolicyError('Invalid scan mode');
  if ((request.mode ?? 'passive') === 'passive' && !config.requirePassiveAuthorization) return Infinity;
  const token = typeof request.authorizationToken === 'string' ? request.authorizationToken : '';
  const supplied = Buffer.from(token);
  const grant = config.grants.find((candidate) => {
    const expected = Buffer.from(candidate.token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected) && candidate.origin === url.origin &&
      candidate.modes.includes(request.mode ?? 'passive') && Date.parse(candidate.expiresAt) > Date.now();
  });
  if (!grant) throw new PolicyError('A valid, unexpired authorization grant for this exact origin and mode is required');
  return Date.parse(grant.expiresAt);
}
