import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const threeSourceEntry = "/Users/keencode/Desktop/3D-Science-Lab/frontend/webapp/node_modules/three/src/Three.js";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^three$/, replacement: threeSourceEntry }] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('node_modules/three/examples')) return 'three-extras';
          if (normalizedId.includes('node_modules/three/src/math/') || normalizedId.endsWith('/node_modules/three/src/constants.js') || normalizedId.endsWith('/node_modules/three/src/utils.js')) return 'three-foundation';
          if (normalizedId.includes('node_modules/three/src/')) return 'three-engine';
          if (normalizedId.includes('node_modules/react') || normalizedId.includes('node_modules/scheduler')) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});