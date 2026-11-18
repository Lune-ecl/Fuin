import { useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderMarkdown } from '../lib/markdown';

/** Rend le contenu markdown d'une fiche ; les liens internes restent dans l'application. */
export default function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const navigate = useNavigate();
  const html = useMemo(() => renderMarkdown(source), [source]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('/') && !href.startsWith('//') && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      navigate(href.replace(/\/+$/, '') || '/');
    }
  };

  return <div className={`prose ${className}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
