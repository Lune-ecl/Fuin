import { useId } from 'react';

const RING_TEXT = '封印 · 結界 · 解印 · 呪縛 · 契約 · 禁術 · 八卦 · 四象 · 封印 · 結界 · 解印 · 呪縛 · 契約 · 禁術 · 八卦 · 四象 · ';

/** Cercle de scellement décoratif (SVG animé). */
export default function SealRing({ glyph = '封', className = '', label }: { glyph?: string; className?: string; label?: string }) {
  const id = useId().replace(/:/g, '');
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  const points = (n: number, r: number, offset = -90) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((offset + (360 / n) * i) * Math.PI) / 180;
      return `${200 + r * Math.cos(a)},${200 + r * Math.sin(a)}`;
    }).join(' ');

  return (
    <div className={`seal-ring ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <defs>
          <path id={`ring-${id}`} d="M200,200 m-168,0 a168,168 0 1,1 336,0 a168,168 0 1,1 -336,0" />
          <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--red)" stopOpacity=".28" />
            <stop offset="60%" stopColor="var(--red)" stopOpacity=".06" />
            <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="198" fill={`url(#glow-${id})`} />
        <g className="seal-ring__outer">
          <circle cx="200" cy="200" r="190" className="sr-line" />
          <circle cx="200" cy="200" r="182" className="sr-line sr-line--faint" />
          <text className="sr-text">
            <textPath href={`#ring-${id}`} startOffset="0">
              {RING_TEXT}
            </textPath>
          </text>
          <circle cx="200" cy="200" r="152" className="sr-line" />
        </g>
        <g className="seal-ring__ticks">
          {ticks.map((i) => (
            <line
              key={i}
              x1="200"
              y1={i % 6 === 0 ? 50 : 54}
              x2="200"
              y2="60"
              className={i % 6 === 0 ? 'sr-tick sr-tick--major' : 'sr-tick'}
              transform={`rotate(${i * 5} 200 200)`}
            />
          ))}
        </g>
        <g className="seal-ring__inner">
          <circle cx="200" cy="200" r="128" className="sr-line sr-line--dash" />
          <polygon points={points(3, 128)} className="sr-shape" />
          <polygon points={points(3, 128, 90)} className="sr-shape" />
          <polygon points={points(8, 100, -67.5)} className="sr-shape sr-shape--faint" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = ((-90 + 45 * i) * Math.PI) / 180;
            return <circle key={i} cx={200 + 128 * Math.cos(a)} cy={200 + 128 * Math.sin(a)} r="3.2" className="sr-dot" />;
          })}
        </g>
        <circle cx="200" cy="200" r="74" className="sr-core" />
        <text x="200" y="200" className="sr-glyph" textAnchor="middle" dominantBaseline="central">
          {glyph}
        </text>
      </svg>
      {label && <span className="seal-ring__label">{label}</span>}
    </div>
  );
}
