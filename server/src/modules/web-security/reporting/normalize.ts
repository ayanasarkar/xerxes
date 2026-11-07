import { createHash, randomUUID } from 'node:crypto';
import { severities, type Finding, type FindingInput, type Severity } from '../types.js';

export function redact(value: string): string {
  return value
    .replace(/(?:set-cookie|cookie|authorization)\s*:[^\r\n]*/gi, '[REDACTED SENSITIVE HEADER]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED ACCESS KEY]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED JWT]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.~-]+/gi, '$1 [REDACTED]')
    .replace(/((?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session(?:id)?)["']?\s*[=:]\s*["']?)[^\s"'<>&;,]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s<>"']+/gi, (raw) => safeUrl(raw));
}
export function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = ''; url.password = ''; url.hash = '';
    for (const key of new Set(url.searchParams.keys())) url.searchParams.set(key, '[REDACTED]');
    // Paths can contain reset tokens, email addresses, and opaque identifiers.
    const segments = url.pathname.split('/');
    url.pathname = segments.map((part, index) => part.length > 24 || /@|%40/i.test(part) ||
      /^(?:reset|reset-password|token|secret|session|api-key)$/i.test(segments[index - 1] ?? '') ? '[REDACTED]' : part).join('/');
    return url.href;
  } catch { return '[invalid URL]'; }
}
export function normalize(input: FindingInput, detectedAt = new Date().toISOString()): Finding {
  if (!severities.includes(input.severity) || !['low', 'medium', 'high'].includes(input.confidence) || !input.evidence.length) {
    throw new Error('Invalid finding severity, confidence, or evidence');
  }
  const clean = (value: string) => redact(value).slice(0, 1024);
  return {
    ...input, id: randomUUID(), detectedAt,
    checkId: clean(input.checkId), title: clean(input.title), description: clean(input.description),
    affectedUrl: safeUrl(input.affectedUrl), remediation: clean(input.remediation), source: input.source ?? 'native',
    evidence: input.evidence.slice(0, 5).map((e) => ({ location: clean(e.location), observation: clean(e.observation) })),
    cwe: (input.cwe ?? []).filter((id) => /^CWE-\d+$/.test(id)),
    owasp: (input.owasp ?? []).filter((id) => /^A\d{2}:2021$/.test(id)),
    cves: (input.cves ?? []).filter((id) => /^CVE-\d{4}-\d{4,}$/.test(id)),
  };
}
export function findingKey(input: FindingInput): string {
  // Deduplicate on original location without exposing it or any secret values.
  return createHash('sha256').update(JSON.stringify([input.source ?? 'native', input.checkId, input.title, input.affectedUrl, input.evidence])).digest('hex');
}
export function countSeverities(findings: Finding[]): Record<Severity, number> {
  const counts = Object.fromEntries(severities.map((s) => [s, 0])) as Record<Severity, number>;
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}
