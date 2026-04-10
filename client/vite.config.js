import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort  = process.env.API_PORT || 3001;
const devPort  = parseInt(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    proxy: {
      '/api':     `http://localhost:${apiPort}`,
      '/uploads': `http://localhost:${apiPort}`,
    },
  },
});
