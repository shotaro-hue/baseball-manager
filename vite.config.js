import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/baseball-manager/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@react-three/fiber') || id.includes('@react-three/drei')) {
            return 'react-three';
          }
          if (id.includes('/node_modules/three/') || id.includes('\\node_modules\\three\\')) {
            return 'three-core';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
});
