import { useMemo, type CSSProperties } from 'react';
import { displaySealSvg, sealGlyphs } from '../lib/sealDesign';
import { sanitizeSvg } from '../lib/markdown';
import { useBrushFont } from '../lib/useBrushFont';

// fissures qui apparaissent à chaque verrou brisé
const CRACKS = [
  'M100 100 L112 82 L107 69 L122 52 L117 36',
  'M100 100 L83 108 L71 103 L57 116 L42 111',
  'M100 100 L104 121 L95 134 L102 151 L93 167',
  'M100 100 L121 108 L135 101 L149 112 L165 105',
  'M100 100 L89 83 L94 69 L79 55 L84 38',
  'M100 100 L115 119 L129 124 L134 141 L151 147',
];

function mood(fails: number): string {
  if (fails <= 0) return 'Le sceau sommeille.';
  if (fails <= 2) return 'Le sceau frémit sous les tentatives.';
  if (fails <= 4) return 'Le sceau rougeoie, menaçant.';
  return 'Le sceau brûle d’une rage écarlate.';
}

/**
 * Sceau d'une étape de désenclavement : il rougeoie un peu plus à chaque roll raté,
 * se fissure à chaque verrou brisé et vole en éclats quand il cède.
 */
export default function TrameSeal({
  svg,
  fails,
  successes,
  needed,
  broken,
  flash,
  compact = false,
}: {
  svg: string | null | undefined;
  fails: number;
  successes: number;
  needed: number;
  broken: boolean;
  flash?: { type: 'fail' | 'hit' | null; key: number };
  compact?: boolean;
}) {
  const font = useBrushFont(sealGlyphs(svg ?? null, '封 印'));
  const art = useMemo(
    () => (font.ready ? sanitizeSvg(displaySealSvg(svg ?? null, '封 印')) : ''),
    [svg, font.ready, font.version],
  );
  const rage = Math.min(Math.max(fails, 0), 8);
  const cracks = broken ? CRACKS.length : successes > 0 ? Math.max(1, Math.round((Math.min(successes, needed) / needed) * (CRACKS.length - 1))) : 0;

  return (
    <figure className={`trame-seal${broken ? ' is-broken' : rage >= 5 ? ' is-raging' : ''}${compact ? ' trame-seal--compact' : ''}`} style={{ '--rage': rage } as CSSProperties}>
      <div className="trame-seal__stage">
        <div key={flash?.key ?? 0} className={`trame-seal__art${flash?.type ? ` flash-${flash.type}` : ''}`} dangerouslySetInnerHTML={{ __html: art }} />
        <svg className="trame-seal__cracks" viewBox="0 0 200 200" aria-hidden="true">
          {CRACKS.slice(0, cracks).map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
        {broken && (
          <span className="trame-seal__broken" aria-hidden="true">
            解
          </span>
        )}
      </div>
      {!compact && <figcaption>{broken ? 'Le sceau est brisé.' : mood(fails)}</figcaption>}
    </figure>
  );
}
