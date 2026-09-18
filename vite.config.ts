import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { brokerApiPlugin } from './server/brokerApiPlugin';

const SERVER_ENVIRONMENT_KEYS = [
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
  'PLAID_ENV',
  'PLAID_PRODUCTS',
  'PLAID_COUNTRY_CODES',
  'PLAID_REDIRECT_URI',
  'PLAID_CLIENT_NAME',
  'OPEN_BANKING_VAULT_KEY',
] as const;

export default defineConfig(({ mode }) => {
  const serverEnvironment = loadEnv(mode, process.cwd(), '');
  for (const key of SERVER_ENVIRONMENT_KEYS) {
    if (!process.env[key] && serverEnvironment[key]) {
      process.env[key] = serverEnvironment[key];
    }
  }

  return {
    plugins: [react(), brokerApiPlugin()],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
      open: true,
      allowedHosts: true,
    },
    preview: {
      port: 5173,
      open: true,
      allowedHosts: true,
    },
  };
});
