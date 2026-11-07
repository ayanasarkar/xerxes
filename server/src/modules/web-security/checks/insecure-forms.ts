import type { Check } from '../types.js';
import { baseUrl, elements, observation } from './helpers.js';

export const insecureForms: Check = {
  id: 'insecure-forms',
  run(page) {
    const base = baseUrl(page);
    return elements(page).filter((e) => e.tag === 'form').flatMap(({ attrs }, index) => {
      let action: URL;
      try { action = new URL(attrs.action || page.url, base); } catch { return []; }
      if (action.protocol !== 'http:') return [];
      return [observation(page, this.id, 'Form submits over unencrypted HTTP',
        'The declared form action uses HTTP. No form was submitted; script handlers or browser upgrades may alter behavior.',
        `form #${index + 1}, method ${(attrs.method ?? 'get').toUpperCase()}, action ${action.href}`, 'medium', ['CWE-319'],
        'Serve forms and submission endpoints over HTTPS; do not rely on redirects to protect submitted data.')];
    });
  },
};
