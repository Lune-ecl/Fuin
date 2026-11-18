import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE : sous-dossier de déploiement (ex. "/fuin/" pour GitHub Pages sans domaine perso).
export default defineConfig({
  base: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITE_BASE || '/',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
});
