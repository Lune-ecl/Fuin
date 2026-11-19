import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked';

const CALLOUT_KINDS = ['note', 'tip', 'caution', 'warning', 'danger'] as const;

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Encadrés :
 *   :::danger[Déclenchement mortel]
 *   Texte **markdown** de l'encadré…
 *   :::
 * Types : note · tip · caution · warning · danger
 */
const callout: TokenizerAndRendererExtension = {
  name: 'callout',
  level: 'block',
  start(src: string) {
    return src.match(/^:::/m)?.index;
  },
  tokenizer(src: string) {
    // forme normale (titre facultatif, corps sur plusieurs lignes, corps vide accepté) :
    //   :::danger[Titre]
    //   Texte
    //   :::
    // forme sur une ligne, crochets éventuellement échappés (contenu importé de l'ancien site) :
    //   :::tip\[Titre\] :::      ou      :::note Texte de l'encadré :::
    const m =
      /^:::(\w+)(?:\\?\[([^\]\n]*?)\\?\])?[ \t]*(?:\n([\s\S]*?))?\n:::[ \t]*(?:\n+|$)/.exec(src) ||
      /^:::(\w+)(?:\\?\[([^\]\n]*?)\\?\])?[ \t]+([^\n]*?)[ \t]*:::[ \t]*(?:\n+|$)/.exec(src);
    if (!m) return undefined;
    const kind = (CALLOUT_KINDS as readonly string[]).includes(m[1]) ? m[1] : 'note';
    const token = { type: 'callout', raw: m[0], kind, title: (m[2] || '').trim(), tokens: [] as Tokens.Generic[] };
    if (m[3] && m[3].trim()) this.lexer.blockTokens(m[3], token.tokens);
    return token;
  },
  renderer(token) {
    const t = token as unknown as { kind: string; title: string; tokens: Tokens.Generic[] };
    const title = t.title ? `<span class="callout__title">${escapeHtml(t.title)}</span>` : '';
    const body = t.tokens.length ? `<div class="callout__body">${this.parser.parse(t.tokens)}</div>` : '';
    return `<aside class="callout callout--${t.kind}${body ? '' : ' callout--title-only'}">${title}${body}</aside>`;
  },
};

const marked = new Marked({ gfm: true, breaks: false }, { extensions: [callout] });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md || '', { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  return clean.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
}

export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return '';
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}

export function excerpt(md: string, max = 160): string {
  const text = md
    .replace(/^:::\w+(\[[^\]]*\])?\s*$/gm, '')
    .replace(/^:::\s*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[#*_>`-]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
