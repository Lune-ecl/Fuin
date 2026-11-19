import { useEffect, useMemo, useRef } from 'react';
import { sanitizeSvg } from '../lib/markdown';

const SHAPES = 'path, circle, rect, line, polyline, polygon, ellipse';

/**
 * Grand sceau : chaque trait se trace comme de l'encre, puis le kanji apparaît
 * et l'anneau extérieur tourne lentement.
 */
export default function SealEmblem({ svg, className = '', replay = 0 }: { svg: string; className?: string; replay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => sanitizeSvg(svg), [svg]);
  const designed = html.includes('fuin-seal');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-drawing', 'is-drawn');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-drawing', 'is-drawn');
      return;
    }
    const shapes = Array.from(el.querySelectorAll<SVGGeometryElement>(SHAPES)).filter(
      (s) => s.getAttribute('stroke') !== 'none',
    );
    shapes.forEach((s, i) => {
      let len = 0;
      try {
        len = s.getTotalLength();
      } catch {
        len = 0;
      }
      if (!len) return;
      s.style.strokeDasharray = `${len}`;
      s.style.strokeDashoffset = `${len}`;
      s.style.transitionDelay = `${Math.min(i * 45, 1300)}ms`;
    });
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-drawing')));
    const done = window.setTimeout(() => {
      shapes.forEach((s) => {
        s.style.strokeDasharray = '';
        s.style.strokeDashoffset = '';
        s.style.transitionDelay = '';
      });
      el.classList.add('is-drawn');
    }, 3300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [html, replay]);

  return (
    <div className={`emblem${designed ? ' emblem--designed' : ''} ${className}`} aria-hidden="true">
      <div ref={ref} className="emblem__art" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
