import { useMemo, type CSSProperties } from 'react';

/** Braises qui remontent lentement en fond. */
export default function Embers({ count = 22, className = '' }: { count?: number; className?: string }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        size: 2 + Math.random() * 3.2,
        duration: 9 + Math.random() * 10,
        delay: -Math.random() * 19,
        drift: (Math.random() * 2 - 1) * 70,
      })),
    [count],
  );
  return (
    <div className={`embers ${className}`} aria-hidden="true">
      {items.map((e, i) => (
        <i
          key={i}
          style={
            {
              left: `${e.left}%`,
              width: e.size,
              height: e.size,
              animationDuration: `${e.duration}s`,
              animationDelay: `${e.delay}s`,
              '--drift': `${e.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
