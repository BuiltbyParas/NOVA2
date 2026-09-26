import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the Pages workflow sets
  // NOVA_BASE so asset URLs resolve there. Locally NOVA stays at the root.
  base: process.env.NOVA_BASE || '/',
  plugins: [react()],
  server: {
    // Lets a Cloudflare quick tunnel share the dev server with other people.
    allowedHosts: ['.trycloudflare.com'],
  },
  build: {
    // Three.js is the bulk of the bundle and is needed on first paint — NOVA has
    // no route to defer it behind, so the default warning is not useful here.
    chunkSizeWarningLimit: 1600,
  },
});
