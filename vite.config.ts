import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    // Rust build outputs can be locked while Cargo compiles on Windows.
    watch: {
      ignored: [
        '**/src-tauri/target/**',
        '**/target/**',
        '**/.pnpm-store/**',
        '**/.*.tmpdir/**',
        '**/*.tmp',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/.pnpm/recharts@') || id.includes('/node_modules/.pnpm/d3-')) return 'charts';
          if (id.includes('/node_modules/.pnpm/react@') || id.includes('/node_modules/.pnpm/react-dom@') || id.includes('/node_modules/.pnpm/scheduler@')) return 'react-vendor';
        },
      },
    },
  },
});
