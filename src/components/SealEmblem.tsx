import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { parseDesign } from '../lib/sealDesign';
import { sanitizeSvg } from '../lib/markdown';

const SHAPES = 'path, circle, rect, line, polyline, polygon, ellipse';

/**
 * Grand sceau : chaque trait se trace comme de l'encre, puis le kanji apparaît
 * et l'anneau extérieur tourne lentement.
 */
export default function SealEmblem({
  svg,
  className = '',
  replay = 0,
  animateOnChange = true,
}: {
  svg: string;
  className?: string;
  replay?: number;
  /** false : le tracé ne se rejoue qu'à l'ouverture et via « replay », pas à chaque retouche */
  animateOnChange?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastReplay = useRef<number | null>(null);
  const html = useMemo(() => sanitizeSvg(svg), [svg]);
  const designed = html.includes('fuin-seal');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const replayed = lastReplay.current !== replay;
    lastReplay.current = replay;
    el.classList.remove('is-drawing', 'is-drawn');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || (!animateOnChange && !replayed)) {
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
  }, [html, replay, animateOnChange]);

  const glow = parseDesign(svg)?.color;

  return (
    <div
      className={`emblem${designed ? ' emblem--designed' : ''} ${className}`}
      style={glow ? ({ '--glow': glow } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      <div ref={ref} className="emblem__art" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
