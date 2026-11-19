import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
