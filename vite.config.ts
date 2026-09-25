import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js is the bulk of the bundle and is needed on first paint — NOVA has
    // no route to defer it behind, so the default warning is not useful here.
    chunkSizeWarningLimit: 1600,
  },
});
