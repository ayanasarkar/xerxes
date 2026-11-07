import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { FindingInput, Page, Severity } from '../types.js';
import { owaspForCwe } from '../reporting/classify.js';

export function header(page: Page, name: string): string {
  const entry = Object.entries(page.headers).find(([key]) => key.toLowerCase() === name);
  return Array.isArray(entry?.[1]) ? entry[1].join(', ') : entry?.[1] ?? '';
}
export const isHtml = (page: Page) => /(?:text\/html|application\/xhtml\+xml)/i.test(header(page, 'content-type'));
export interface Element { tag: string; attrs: Record<string, string>; }
const cache = new WeakMap<Page, Element[]>();
export function elements(page: Page): Element[] {
  if (!isHtml(page)) return [];
  const cached = cache.get(page);
  if (cached) return cached;
  const root = parse(page.body);
  const nodes: DefaultTreeAdapterMap['node'][] = [root];
  const result: Element[] = [];
  while (nodes.length && result.length < 10_000) {
    const node = nodes.pop()!;
    if ('tagName' in node) result.push({ tag: node.tagName, attrs: Object.fromEntries(node.attrs.map((a) => [a.name, a.value])) });
    if ('childNodes' in node) for (let i = node.childNodes.length - 1; i >= 0; i--) nodes.push(node.childNodes[i]!);
  }
  cache.set(page, result);
  return result;
}
export function baseUrl(page: Page): URL {
  const base = elements(page).find((e) => e.tag === 'base' && e.attrs.href);
  try { return new URL(base?.attrs.href ?? '', page.url); } catch { return new URL(page.url); }
}
export function observation(page: Page, checkId: string, title: string, description: string, evidence: string,
  severity: Severity = 'low', cwe: string[] = [], remediation = 'Apply a restrictive policy appropriate to the application.'): FindingInput {
  return { checkId, title, description, severity, confidence: 'high', affectedUrl: page.url,
    evidence: [{ location: 'HTTP response', observation: evidence }], cwe,
    owasp: cwe.length ? [...new Set(cwe.flatMap(owaspForCwe))] : ['A05:2021'], remediation };
}
