import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/baseball-manager/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
