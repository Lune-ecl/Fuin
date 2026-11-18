import { Link } from 'react-router-dom';

export function Hanko({ glyph = '封', size = 'md' }: { glyph?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`hanko hanko--${size}`} aria-hidden="true">
      <span>{glyph}</span>
    </span>
  );
}

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Retour à l’accueil">
      <Hanko />
      <span className="brand__text">
        <b>Fuinjutsu</b>
        <em>Archives de Zenkai</em>
      </span>
    </Link>
  );
}
