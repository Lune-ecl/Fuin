// GitHub Pages ne connaît pas les routes de l'application : on sert index.html
// pour toute URL inconnue en le copiant en 404.html.
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
console.log('dist/404.html créé (fallback SPA)');
