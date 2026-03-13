import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const threeSourceEntry = decodeURIComponent(new URL('./node_modules/three/src/Three.js', import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^three$/, replacement: threeSourceEntry },
    ],
  },
  server: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4318',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');

          if (normalizedId.indexOf('node_modules/three/examples') !== -1) return 'three-extras';
          if (
            normalizedId.indexOf('node_modules/three/src/math/') !== -1 ||
            normalizedId.lastIndexOf('/node_modules/three/src/constants.js') === normalizedId.length - '/node_modules/three/src/constants.js'.length ||
            normalizedId.lastIndexOf('/node_modules/three/src/utils.js') === normalizedId.length - '/node_modules/three/src/utils.js'.length
          ) {
            return 'three-foundation';
          }
          if (normalizedId.indexOf('node_modules/three/src') !== -1) return 'three-vendor';
          if (normalizedId.indexOf('node_modules/react') !== -1 || normalizedId.indexOf('node_modules/scheduler') !== -1) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});
