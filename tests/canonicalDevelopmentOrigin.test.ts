import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  CANONICAL_DEVELOPMENT_ORIGIN,
  bootstrapOnCanonicalDevelopmentOrigin,
} from '../src/platforms/web/utils/canonicalDevelopmentOrigin';

const runBootstrap = ({
  origin,
  pathname = '/',
  search = '',
  hash = '',
  isDevelopment = true,
}: {
  origin: string;
  pathname?: string;
  search?: string;
  hash?: string;
  isDevelopment?: boolean;
}) => {
  let startCount = 0;
  const redirects: string[] = [];
  const result = bootstrapOnCanonicalDevelopmentOrigin({
    isDevelopment,
    location: {
      origin,
      pathname,
      search,
      hash,
      replace: (url) => redirects.push(url),
    },
    start: () => {
      startCount += 1;
    },
  });

  return { result, redirects, startCount };
};

test('standard development commands and Vite config require localhost:5173 without fallback', () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
  ) as { scripts: Record<string, string> };
  const viteConfig = readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');

  for (const scriptName of ['dev', 'web']) {
    assert.match(packageJson.scripts[scriptName], /--host localhost/);
    assert.match(packageJson.scripts[scriptName], /--port 5173/);
    assert.match(packageJson.scripts[scriptName], /--strictPort/);
  }
  assert.match(viteConfig, /server:\s*{[\s\S]*host: 'localhost'/);
  assert.match(viteConfig, /server:\s*{[\s\S]*port: 5173/);
  assert.match(viteConfig, /server:\s*{[\s\S]*strictPort: true/);
});

test('browser entrypoint applies the origin guard before importing the workspace', () => {
  const entrypoint = readFileSync(path.join(process.cwd(), 'src', 'main.tsx'), 'utf8');
  const guardIndex = entrypoint.indexOf('bootstrapOnCanonicalDevelopmentOrigin({');
  const workspaceImportIndex = entrypoint.indexOf("import('./platforms/web/App')");

  assert.ok(guardIndex >= 0);
  assert.ok(workspaceImportIndex > guardIndex);
});

test('canonical localhost:5173 starts the development workspace', () => {
  const outcome = runBootstrap({ origin: CANONICAL_DEVELOPMENT_ORIGIN });

  assert.deepEqual(outcome.result, { action: 'started' });
  assert.equal(outcome.startCount, 1);
  assert.deepEqual(outcome.redirects, []);
});

for (const origin of [
  'http://127.0.0.1:5173',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
]) {
  test(`${origin} redirects before the development workspace starts`, () => {
    const outcome = runBootstrap({ origin });

    assert.equal(outcome.result.action, 'redirected');
    assert.equal(outcome.startCount, 0);
    assert.deepEqual(outcome.redirects, ['http://localhost:5173/']);
  });
}

test('development redirect safely preserves pathname, query, and hash', () => {
  const outcome = runBootstrap({
    origin: 'http://localhost:64000',
    pathname: '/cash-accounts',
    search: '?tab=connections',
    hash: '#first-platypus',
  });

  assert.deepEqual(outcome.redirects, [
    'http://localhost:5173/cash-accounts?tab=connections#first-platypus',
  ]);
  assert.equal(outcome.startCount, 0);
});

test('production and staging origins start normally', () => {
  for (const origin of ['https://portfolio.example.com', 'https://staging.example.com']) {
    const outcome = runBootstrap({ origin, isDevelopment: false });

    assert.deepEqual(outcome.result, { action: 'started' });
    assert.equal(outcome.startCount, 1);
    assert.deepEqual(outcome.redirects, []);
  }
});

test('the Plaid local callback remains valid on the canonical origin', () => {
  const canonical = runBootstrap({
    origin: CANONICAL_DEVELOPMENT_ORIGIN,
    pathname: '/oauth/plaid',
    search: '?oauth_state_id=sandbox-state',
  });
  const redirected = runBootstrap({
    origin: 'http://127.0.0.1:8081',
    pathname: '/oauth/plaid',
    search: '?oauth_state_id=sandbox-state',
  });

  assert.equal(canonical.startCount, 1);
  assert.deepEqual(canonical.redirects, []);
  assert.equal(redirected.startCount, 0);
  assert.deepEqual(redirected.redirects, [
    'http://localhost:5173/oauth/plaid?oauth_state_id=sandbox-state',
  ]);
});
