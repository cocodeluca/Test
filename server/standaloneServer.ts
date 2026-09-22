import { createServer, type Server } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
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
import { readOpenBankingMode } from './openBankingMode';

export interface StandaloneServerOptions extends BrokerApiPluginOptions {
  application?: BrokerApiApplication;
  frontendIndexHtmlPath?: string;
}

const contentTypes: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

const decodedRequestPath = (requestUrl: string): string | null => {
  const rawPath = requestUrl.split('?', 1)[0];
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || /%2f|%5c/i.test(rawPath)) return null;
  try {
    const pathname = decodeURIComponent(rawPath);
    if (pathname.startsWith('//') || /[\\\u0000-\u001f\u007f#?:]/.test(pathname) ||
        /%[0-9a-f]{2}/i.test(pathname) ||
        pathname.split('/').some((segment) => segment.startsWith('.'))) return null;
    return pathname;
  } catch {
    return null;
  }
};

const notFound = (response: import('node:http').ServerResponse) => {
  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({ error: 'Not found' }));
};

export const createStandaloneServer = (options: StandaloneServerOptions = {}): Server => {
  const application = options.application ?? createBrokerApiApplication(options);
  const indexPath = options.frontendIndexHtmlPath && path.resolve(options.frontendIndexHtmlPath);
  const distRoot = indexPath && path.dirname(indexPath);
  return createServer(async (request, response) => {
    try {
      const pathname = decodedRequestPath(request.url ?? '/');
      if (pathname === null) {
        notFound(response);
        return;
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        if (!await application.handle(request, response)) notFound(response);
        return;
      }
      if (await application.handle(request, response)) return;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        notFound(response);
        return;
      }
      if (!indexPath || !distRoot) {
        notFound(response);
        return;
      }
      const serve = async (filePath: string, contentType: string, cacheControl: string) => {
        const root = await realpath(distRoot);
        const file = await realpath(filePath);
        const inside = path.relative(root, file);
        if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) {
          notFound(response);
          return;
        }
        const body = await readFile(filePath);
        response.statusCode = 200;
        response.setHeader('Content-Type', contentType);
        response.setHeader('Cache-Control', cacheControl);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(request.method === 'HEAD' ? undefined : body);
      };
      if (pathname === '/' || pathname === '/index.html' || pathname === '/oauth/plaid') {
        await serve(indexPath, 'text/html; charset=utf-8',
          pathname === '/oauth/plaid' ? 'no-store' : 'no-cache');
        return;
      }
      const extension = path.extname(pathname).toLowerCase();
      if (extension && contentTypes[extension]) {
        const candidate = path.resolve(distRoot, `.${pathname}`);
        const relative = path.relative(distRoot, candidate);
        const builtScript = ['.js', '.css', '.json', '.wasm'].includes(extension);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) &&
            (!builtScript || pathname.startsWith('/assets/'))) {
          try {
            const [root, file, details] = await Promise.all([
              realpath(distRoot), realpath(candidate), stat(candidate),
            ]);
            const inside = path.relative(root, file);
            if (details.isFile() && inside && !inside.startsWith('..') &&
                !path.isAbsolute(inside)) {
              const hashed = pathname.startsWith('/assets/') &&
                /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(pathname);
              await serve(candidate, contentTypes[extension],
                hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
              return;
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
        notFound(response);
        return;
      }
      if (extension || pathname === '/assets' || pathname.startsWith('/assets/') ||
          pathname === '/property-images' || pathname.startsWith('/property-images/')) {
        notFound(response);
        return;
      }
      await serve(indexPath, 'text/html; charset=utf-8', 'no-cache');
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
  if (readOpenBankingMode(environment) === 'enabled') {
    const plaid = inspectPlaidPilotConfiguration(environment);
    if (!plaid.ready || plaid.environment !== 'production') {
      throw new OperationalStoreConfigurationError('Production Plaid configuration is missing or invalid.');
    }
    if (plaid.scope.transactionsEnabled) {
      throw new OperationalStoreConfigurationError('Production Plaid Transactions must remain disabled.');
    }
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
  const frontendIndexHtmlPath = path.resolve(process.cwd(), 'dist', 'index.html');
  try {
    await readFile(frontendIndexHtmlPath);
  } catch (error) {
    await operationalStores.close();
    throw error;
  }
  const server = createStandaloneServer({
    operationalStores,
    environment,
    frontendIndexHtmlPath,
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
