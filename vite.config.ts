import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { brokerApiPlugin } from './server/brokerApiPlugin';

export default defineConfig({
  plugins: [react(), brokerApiPlugin()],
  server: {
    port: 5173,
    open: true,
    allowedHosts: true,
  },
  preview: {
    port: 5173,
    open: true,
    allowedHosts: true,
  },
});
