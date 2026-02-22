import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3213,
    proxy: {
      '/api': {
        target: 'http://localhost:5109',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['mermaid', 'react-markdown', 'remark-gfm', 'rehype-raw'],
  },
});
