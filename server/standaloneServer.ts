import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createBrokerApiApplication,
  type BrokerApiApplication,
  type BrokerApiPluginOptions,
} from './apiApplication';
import {
  assertProductionOperationalStores,
  OperationalStoreConfigurationError,
  type OperationalStores,
  type ProductionOperationalStoreFactory,
} from './operationalStore';
import { inspectPlaidPilotConfiguration } from './openBankingPolicy';

export interface StandaloneServerOptions extends BrokerApiPluginOptions {
  application?: BrokerApiApplication;
  frontendIndexHtmlPath?: string;
}

export const createStandaloneServer = (options: StandaloneServerOptions = {}): Server => {
  const application = options.application ?? createBrokerApiApplication(options);
  return createServer(async (request, response) => {
    try {
      if (await application.handle(request, response)) return;
      const requestUrl = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && requestUrl.pathname === '/oauth/plaid' &&
          options.frontendIndexHtmlPath) {
        const indexHtml = await readFile(path.resolve(options.frontendIndexHtmlPath), 'utf8');
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(indexHtml);
        return;
      }
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('[api] Unhandled request failure.', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      response.end(JSON.stringify({ error: 'Unexpected server error.' }));
    }
  });
};

const requireHttpsOrigin = (value: string | undefined) => {
  if (!value?.trim()) {
    throw new OperationalStoreConfigurationError('PUBLIC_ORIGIN is required in Production.');
  }
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new OperationalStoreConfigurationError('PUBLIC_ORIGIN must be a valid HTTPS origin.');
  }
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash || origin.origin !== value.trim()) {
    throw new OperationalStoreConfigurationError('PUBLIC_ORIGIN must be a canonical HTTPS origin.');
  }
};

export const validateProductionServerEnvironment = (
  environment: NodeJS.ProcessEnv
): { port: number; host: string } => {
  if (environment.NODE_ENV !== 'production') {
    throw new OperationalStoreConfigurationError('The production entrypoint requires NODE_ENV=production.');
  }
  const port = Number(environment.PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new OperationalStoreConfigurationError('PORT must be an integer from 1 to 65535.');
  }
  if (environment.SESSION_COOKIE_SECURE !== 'true') {
    throw new OperationalStoreConfigurationError('SESSION_COOKIE_SECURE=true is required in Production.');
  }
  if (environment.TRUST_PROXY !== '1') {
    throw new OperationalStoreConfigurationError(
      'TRUST_PROXY=1 is required because the standalone server must run behind an HTTPS reverse proxy.'
    );
  }
  requireHttpsOrigin(environment.PUBLIC_ORIGIN);
  if (!environment.OPERATIONAL_STORE_MODULE?.trim()) {
    throw new OperationalStoreConfigurationError(
      'OPERATIONAL_STORE_MODULE must select a Production durable-store adapter.'
    );
  }
  if (!environment.DATABASE_URL?.trim()) {
    throw new OperationalStoreConfigurationError('DATABASE_URL is required in Production.');
  }
  if (environment.ACCOUNT_BACKUP_MODE !== 'disabled') {
    throw new OperationalStoreConfigurationError(
      'ACCOUNT_BACKUP_MODE=disabled is required in Production.'
    );
  }
  const plaid = inspectPlaidPilotConfiguration(environment);
  if (!plaid.ready || plaid.environment !== 'production') {
    throw new OperationalStoreConfigurationError('Production Plaid configuration is missing or invalid.');
  }
  if (plaid.scope.transactionsEnabled) {
    throw new OperationalStoreConfigurationError('Production Plaid Transactions must remain disabled.');
  }
  return { port, host: environment.HOST?.trim() || '127.0.0.1' };
};

export const loadProductionOperationalStores = async (
  environment: NodeJS.ProcessEnv
): Promise<OperationalStores> => {
  const modulePath = path.resolve(environment.OPERATIONAL_STORE_MODULE!.trim());
  const loaded = await import(pathToFileURL(modulePath).href) as {
    createOperationalStores?: ProductionOperationalStoreFactory;
  };
  if (typeof loaded.createOperationalStores !== 'function') {
    throw new OperationalStoreConfigurationError(
      'Production operational-store module must export createOperationalStores().'
    );
  }
  const stores = assertProductionOperationalStores(
    await loaded.createOperationalStores({ environment })
  );
  await stores.assertReady();
  return stores;
};

export const startProductionServer = async (
  environment: NodeJS.ProcessEnv = process.env
): Promise<Server> => {
  const { port, host } = validateProductionServerEnvironment(environment);
  const operationalStores = await loadProductionOperationalStores(environment);
  const server = createStandaloneServer({
    operationalStores,
    environment,
    frontendIndexHtmlPath: path.resolve(process.cwd(), 'dist', 'index.html'),
  });
  server.once('close', () => {
    void operationalStores.close();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await operationalStores.close();
    throw error;
  }
  console.info(`[api] Production server listening on ${host}:${port}.`);
  return server;
};
